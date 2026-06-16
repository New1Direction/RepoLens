// canvas-engine.js
// Vanilla, dependency-free interactive SVG canvas. Pointer Events only.
// Layout is pure+memoized (positions live in the scene); selection/spotlight is an overlay pass.

import { escapeHtml as esc } from './safe-html.js';

const SVGNS = 'http://www.w3.org/2000/svg';
export const NODE_W = 132, NODE_H = 44;
const el = (name, attrs = {}) => { const e = document.createElementNS(SVGNS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

/**
 * Pure: cubic-bezier path string from source node's right-middle to target node's left-middle.
 * a, b are node objects with {x, y} top-left coordinates.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @returns {string}
 */
export function edgeBezier(a, b) {
  const sx = a.x + NODE_W, sy = a.y + NODE_H / 2;
  const tx = b.x, ty = b.y + NODE_H / 2, mx = (sx + tx) / 2;
  return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
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

  for (const e of scene.edges) {
    const p = el('path', { class: `rl-edge rl-${e.rel}`, d: edgePath(e), fill: 'none' });
    p.dataset.edge = e.id;
    edgeLayer.append(p); edgeEls.set(e.id, p);
  }
  for (const n of scene.nodes) {
    const g = el('g', { class: `rl-node rl-kind-${n.kind}`, transform: `translate(${n.x},${n.y})`, tabindex: '0' });
    g.dataset.node = n.id;
    if (n.ref && n.ref.root) g.classList.add('is-root');
    const rect = el('rect', { width: NODE_W, height: NODE_H, rx: 8 });
    const text = el('text', { x: NODE_W / 2, y: NODE_H / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    text.textContent = n.label;
    g.append(rect, text);
    nodeLayer.append(g); nodeEls.set(n.id, g);
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
