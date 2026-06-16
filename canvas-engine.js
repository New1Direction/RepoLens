// canvas-engine.js
// Vanilla, dependency-free interactive SVG canvas. Pointer Events only.
// Layout is pure+memoized (positions live in the scene); selection/spotlight is an overlay pass.

const SVGNS = 'http://www.w3.org/2000/svg';
export const NODE_W = 132, NODE_H = 44;
// Auto-width card bounds: each card fits its label, clamped to [MIN_W, MAX_W];
// labels past MAX_W are ellipsised (full text kept in the <title> tooltip).
const MIN_W = 96, MAX_W = 210, PAD_X = 14, CHAR_W = 7.8;
const el = (name, attrs = {}) => { const e = document.createElementNS(SVGNS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

/**
 * Pure: cubic-bezier from the source node's right-middle to the target's left-middle.
 * Uses the source node's rendered width (`_w`, set by the engine when it auto-sizes a
 * card) so the edge still meets the card edge when a long label widens it; falls back
 * to NODE_W when `_w` is absent.
 * @param {{ x:number, y:number, _w?:number }} a
 * @param {{ x:number, y:number }} b
 * @returns {string}
 */
export function edgeBezier(a, b) {
  const sx = a.x + ((a && a._w) || NODE_W), sy = a.y + NODE_H / 2;
  const tx = b.x, ty = b.y + NODE_H / 2, mx = (sx + tx) / 2;
  return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
}

/** Pure: the class string for a node element (kind + optional root/fit/layer). */
export function nodeClass(n) {
  let c = `rl-node rl-kind-${n.kind}`;
  if (n.ref && n.ref.root) c += ' is-root';
  if (n.ref && n.ref.fit) c += ` rl-fit-${n.ref.fit}`;
  if (n.layer) c += ` rl-layer-${n.layer}`;
  return c;
}

/**
 * Mount an interactive canvas into `host`.
 * @returns {{ moveNode, setSpotlight, clearSpotlight, getScene, destroy }}
 */
export function mountCanvas(host, inputScene, { onChange } = {}) {
  const scene = structuredClone(inputScene);
  // Leading-edge debounce: the first change saves immediately (so a direct
  // api.moveNode(...) is observable synchronously), then a 250ms cooldown
  // coalesces the high-frequency pointer paths into a single trailing save.
  let saveTimer = null, pendingDuringCooldown = false;
  const fire = () => { if (onChange) onChange(structuredClone(scene)); };
  const persist = () => {
    if (!onChange) return;
    if (saveTimer) { pendingDuringCooldown = true; return; }
    fire();
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (pendingDuringCooldown) { pendingDuringCooldown = false; persist(); }
    }, 250);
  };

  host.innerHTML = '';
  const svg = el('svg', { class: 'rl-canvas', width: '100%', height: '100%' });
  const root = el('g', { class: 'rl-camera' });
  const edgeLayer = el('g', { class: 'rl-edges' });
  const nodeLayer = el('g', { class: 'rl-nodes' });
  root.append(edgeLayer, nodeLayer);
  svg.append(root);
  host.append(svg);

  const cam = scene.camera || (scene.camera = { x: 0, y: 0, zoom: 1 });
  const applyCamera = () => root.setAttribute('transform', `translate(${cam.x},${cam.y}) scale(${cam.zoom})`);

  const nodeEls = new Map();
  const edgeEls = new Map();

  const byId = (id) => scene.nodes.find((n) => n.id === id);
  function edgePath(e) {
    return (byId(e.from) && byId(e.to)) ? edgeBezier(byId(e.from), byId(e.to)) : '';
  }

  // Measure a candidate string in the live text node; fall back to a monospace
  // estimate when getComputedTextLength is unavailable (hidden host / jsdom).
  function widthOf(textEl, str) {
    textEl.textContent = str;
    const m = textEl.getComputedTextLength ? textEl.getComputedTextLength() : 0;
    return m > 0 ? m : str.length * CHAR_W;
  }
  // Fit a card to its label: clamp width to [MIN_W, MAX_W]; truncate with an ellipsis
  // past MAX_W (the full label lives in the node's <title>). Records n._w for edges.
  function sizeNode(n, rect, text) {
    const maxTextW = MAX_W - PAD_X * 2;
    let tw = widthOf(text, n.label);
    if (tw > maxTextW) {
      let s = n.label;
      while (s.length > 1 && widthOf(text, s + '…') > maxTextW) s = s.slice(0, -1);
      text.textContent = s.replace(/\s+$/, '') + '…';
      tw = widthOf(text, text.textContent);
    }
    const w = Math.max(MIN_W, Math.min(MAX_W, Math.round(tw + PAD_X * 2)));
    rect.setAttribute('width', w);
    text.setAttribute('x', w / 2);
    n._w = w;
  }

  for (const e of scene.edges) {
    const p = el('path', { class: `rl-edge rl-${e.rel}`, d: edgePath(e), fill: 'none' });
    p.dataset.edge = e.id;
    edgeLayer.append(p); edgeEls.set(e.id, p);
  }
  for (const n of scene.nodes) {
    const g = el('g', { class: nodeClass(n), transform: `translate(${n.x},${n.y})`, tabindex: '0' });
    g.dataset.node = n.id;
    const rect = el('rect', { width: NODE_W, height: NODE_H, rx: 8 });
    const text = el('text', { y: NODE_H / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    text.textContent = n.label;
    const title = el('title'); title.textContent = n.label; // full label on hover (survives truncation)
    g.append(rect, text, title);
    nodeLayer.append(g); nodeEls.set(n.id, g);
    sizeNode(n, rect, text); // fit the card to its label
    wireDrag(g, n);
  }
  applyCamera();

  function wireDrag(g, n) {
    let startX, startY, ox, oy, dragging = false;
    g.addEventListener('pointerdown', (ev) => {
      dragging = true; g.setPointerCapture?.(ev.pointerId);
      startX = ev.clientX; startY = ev.clientY; ox = n.x; oy = n.y; ev.stopPropagation();
    });
    g.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      moveNode(n.id, ox + (ev.clientX - startX) / cam.zoom, oy + (ev.clientY - startY) / cam.zoom);
    });
    g.addEventListener('pointerup', (ev) => { if (dragging) { dragging = false; g.releasePointerCapture?.(ev.pointerId); persist(); } });
  }

  let panning = false, px, py, pcx, pcy;
  svg.addEventListener('pointerdown', (ev) => { if (ev.target === svg || ev.target === root) { panning = true; px = ev.clientX; py = ev.clientY; pcx = cam.x; pcy = cam.y; } });
  svg.addEventListener('pointermove', (ev) => { if (panning) { cam.x = pcx + (ev.clientX - px); cam.y = pcy + (ev.clientY - py); applyCamera(); } });
  svg.addEventListener('pointerup', () => { if (panning) { panning = false; persist(); } });
  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
    cam.zoom = Math.max(0.2, Math.min(3, cam.zoom * factor));
    applyCamera(); persist();
  }, { passive: false });

  function moveNode(id, x, y) {
    const n = byId(id); if (!n) return;
    n.x = x; n.y = y;
    const g = nodeEls.get(id); if (g) g.setAttribute('transform', `translate(${x},${y})`);
    for (const e of scene.edges) if (e.from === id || e.to === id) { const p = edgeEls.get(e.id); if (p) p.setAttribute('d', edgePath(e)); }
    persist();
  }
  function setSpotlight(ids) {
    const set = new Set(ids);
    for (const [id, g] of nodeEls) { g.classList.toggle('is-spotlight', set.has(id)); g.classList.toggle('is-dim', !set.has(id)); }
  }
  function clearSpotlight() { for (const [, g] of nodeEls) g.classList.remove('is-spotlight', 'is-dim'); }
  function getScene() { return structuredClone(scene); }
  function destroy() { clearTimeout(saveTimer); host.innerHTML = ''; }

  return { moveNode, setSpotlight, clearSpotlight, getScene, destroy };
}
