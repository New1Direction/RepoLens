// canvas-export.js
// Pure serializers: scene → standalone SVG, and scene → Excalidraw document JSON.

import { escapeHtml as esc } from './safe-html.js';

const NW = 132,
  NH = 44;
const seedFrom = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) || 1;
};
// Coerce any coordinate to a finite number before it reaches an SVG attribute or
// Excalidraw field. Guards against non-numeric values (e.g. strings from untrusted
// JSON) breaking out of an attribute context. Non-finite → 0.
const num = (v) => (Number.isFinite(+v) ? +v : 0);

/** Standalone, themeable SVG snapshot of the scene. */
export function toCanvasSvg(scene) {
  const nodes = scene.nodes || [];
  const edges = scene.edges || [];
  const ann = scene.annotations || [];
  const pos = Object.fromEntries(nodes.map((n) => [n.id, n]));
  // Fold bounds in one pass instead of spreading the node array into Math.min/max —
  // spreading thousands+ of args overflows the call stack (RangeError) on big scenes.
  // Seeds match the old literals: minX/minY start at 0, maxX at 200, maxY at 200.
  const b = nodes.reduce(
    (acc, n) => {
      const x = num(n.x),
        y = num(n.y);
      return {
        minX: Math.min(acc.minX, x),
        minY: Math.min(acc.minY, y),
        maxX: Math.max(acc.maxX, x + (num(n._w) || NW)),
        maxY: Math.max(acc.maxY, y + NH),
      };
    },
    { minX: 0, minY: 0, maxX: 200, maxY: 200 }
  );
  const minX = b.minX - 20;
  const minY = b.minY - 20;
  const maxX = b.maxX + 20;
  const maxY = b.maxY + 60;

  const edgeSvg = edges
    .map((e) => {
      const a = pos[e.from],
        b = pos[e.to];
      if (!a || !b) return '';
      // Start the edge at the source node's real right edge (auto-width `_w`), not the
      // fixed constant, so edges on wide cards stay attached.
      const aw = num(a._w) || NW;
      const x1 = num(a.x) + aw,
        y1 = num(a.y) + NH / 2,
        x2 = num(b.x),
        y2 = num(b.y) + NH / 2,
        mx = (x1 + x2) / 2;
      return `<path class="ce-edge ce-${esc(e.rel)}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none"/>`;
    })
    .join('');

  const nodeSvg = nodes
    .map((n) => {
      const x = num(n.x),
        y = num(n.y),
        w = num(n._w) || NW;
      return (
        `<g class="ce-node ce-kind-${esc(n.kind)}"><rect x="${x}" y="${y}" width="${w}" height="${NH}" rx="8"/>` +
        `<text x="${x + w / 2}" y="${y + NH / 2}" text-anchor="middle" dominant-baseline="central">${esc(n.label)}</text></g>`
      );
    })
    .join('');

  const annSvg = ann
    .map((a) => {
      const x = num(a.x),
        y = num(a.y);
      return (
        `<g class="ce-note ce-${esc(a.tone)}"><rect x="${x}" y="${y}" width="150" height="48" rx="4"/>` +
        `<text x="${x + 8}" y="${y + 20}">${esc(a.text)}</text></g>`
      );
    })
    .join('');

  return `<svg class="canvas-export" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" xmlns="http://www.w3.org/2000/svg">${edgeSvg}${nodeSvg}${annSvg}</svg>`;
}

/** Scene → Excalidraw document (opens in excalidraw.com, Obsidian, VS Code). */
export function toExcalidraw(scene) {
  const elements = [];
  const base = (id, extra) => ({
    id,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    angle: 0,
    strokeColor: '#1e1a14',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: { type: 3 },
    seed: seedFrom(id),
    versionNonce: seedFrom('n' + id),
    version: 1,
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
    ...extra,
  });

  for (const n of scene.nodes || []) {
    const rid = `rect-${n.id}`,
      tid = `txt-${n.id}`;
    const x = num(n.x),
      y = num(n.y),
      w = num(n._w) || NW;
    elements.push(
      base(rid, {
        type: 'rectangle',
        x,
        y,
        width: w,
        height: 44,
        backgroundColor: n.kind === 'subsystem' ? '#c2691c' : '#fffdf6',
        boundElements: [{ type: 'text', id: tid }],
      })
    );
    elements.push(
      base(tid, {
        type: 'text',
        x: x + 8,
        y: y + 14,
        width: w - 16,
        height: 20,
        text: String(n.label),
        fontSize: 16,
        fontFamily: 1,
        textAlign: 'center',
        verticalAlign: 'middle',
        containerId: rid,
        originalText: String(n.label),
        lineHeight: 1.25,
      })
    );
  }

  const pos = Object.fromEntries((scene.nodes || []).map((n) => [n.id, n]));
  for (const e of scene.edges || []) {
    const a = pos[e.from],
      b = pos[e.to];
    if (!a || !b) continue;
    const x1 = num(a.x) + (num(a._w) || NW),
      y1 = num(a.y) + 22,
      x2 = num(b.x),
      y2 = num(b.y) + 22;
    elements.push(
      base(`arrow-${e.id}`, {
        type: 'arrow',
        x: x1,
        y: y1,
        width: x2 - x1,
        height: y2 - y1,
        points: [
          [0, 0],
          [x2 - x1, y2 - y1],
        ],
        startBinding: { elementId: `rect-${e.from}`, focus: 0, gap: 4 },
        endBinding: { elementId: `rect-${e.to}`, focus: 0, gap: 4 },
        strokeColor: e.rel === 'triggers' ? '#3b6ea5' : e.rel === 'enables' ? '#2f7d34' : '#1e1a14',
      })
    );
  }

  for (const a of scene.annotations || []) {
    const x = num(a.x),
      y = num(a.y);
    elements.push(
      base(`note-${a.id}`, {
        type: 'text',
        x,
        y,
        width: 150,
        height: 40,
        text: String(a.text),
        fontSize: 14,
        fontFamily: 1,
        textAlign: 'left',
        verticalAlign: 'top',
        originalText: String(a.text),
        lineHeight: 1.25,
        strokeColor: a.tone === 'warn' ? '#8a480f' : '#1e1a14',
      })
    );
  }

  return JSON.stringify(
    {
      type: 'excalidraw',
      version: 2,
      source: 'https://github.com/RepoLens',
      elements,
      appState: { gridSize: null, viewBackgroundColor: '#fbf6ea' },
      files: {},
    },
    null,
    2
  );
}
