// Lightweight, dependency-free SVG diagrams for the structural lenses. Renders
// offline (no Mermaid/CDN), themes via CSS classes, and is built for our small
// graphs (≤ ~10 nodes). Pure string functions — unit-testable without a DOM.

import { escapeHtml as esc } from './safe-html.js';

const NODE_W = 132,
  NODE_H = 38,
  COL_GAP = 64,
  ROW_GAP = 16,
  PAD = 14;

const truncate = (s, n) => {
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

/** Layered left→right DAG of atoms connected by lineage links. */
export function lineageSvg(atoms, links) {
  if (!atoms?.length || !links?.length) return '';
  const ids = atoms.map((a) => a.id);
  const idset = new Set(ids);
  const nameById = Object.fromEntries(atoms.map((a) => [a.id, a.name]));
  const valid = links.filter((l) => idset.has(l.from) && idset.has(l.to));
  if (!valid.length) return '';

  // depth = longest path from a root; relaxation bounded by node count (cycle-safe)
  const depth = Object.fromEntries(ids.map((id) => [id, 0]));
  for (let i = 0; i < ids.length; i++) {
    let changed = false;
    for (const l of valid)
      if (depth[l.to] < depth[l.from] + 1) {
        depth[l.to] = depth[l.from] + 1;
        changed = true;
      }
    if (!changed) break;
  }

  const cols = {};
  ids.forEach((id) => {
    (cols[depth[id]] ||= []).push(id);
  });
  const maxDepth = Math.max(...ids.map((id) => depth[id]));
  const maxRows = Math.max(...Object.values(cols).map((c) => c.length));
  const totalH = PAD * 2 + maxRows * (NODE_H + ROW_GAP) - ROW_GAP;

  const pos = {};
  for (let d = 0; d <= maxDepth; d++) {
    const col = cols[d] || [];
    const colH = col.length * (NODE_H + ROW_GAP) - ROW_GAP;
    const top = PAD + (totalH - PAD * 2 - colH) / 2;
    col.forEach((id, i) => {
      pos[id] = { x: PAD + d * (NODE_W + COL_GAP), y: top + i * (NODE_H + ROW_GAP) };
    });
  }
  const width = PAD * 2 + (maxDepth + 1) * (NODE_W + COL_GAP) - COL_GAP;

  const edges = valid
    .map((l) => {
      const a = pos[l.from],
        b = pos[l.to];
      const x1 = a.x + NODE_W,
        y1 = a.y + NODE_H / 2,
        x2 = b.x,
        y2 = b.y + NODE_H / 2;
      const mx = (x1 + x2) / 2;
      return `<path class="dg-edge" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" marker-end="url(#dg-arrow)"/>`;
    })
    .join('');
  const nodes = ids
    .map((id) => {
      const p = pos[id];
      return `<g><rect class="dg-node" x="${p.x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="6"/><text class="dg-node-text" x="${p.x + NODE_W / 2}" y="${p.y + NODE_H / 2}" text-anchor="middle" dominant-baseline="central">${esc(truncate(nameById[id], 18))}</text></g>`;
    })
    .join('');

  return `<svg class="diagram" viewBox="0 0 ${width} ${Math.max(totalH, NODE_H + PAD * 2)}" preserveAspectRatio="xMinYMin meet" xmlns="http://www.w3.org/2000/svg"><defs><marker id="dg-arrow" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto"><path class="dg-arrowhead" d="M0,0 L9,4.5 L0,9 z"/></marker></defs>${edges}${nodes}</svg>`;
}

/** Circular diagram of one feedback loop's cycle (reinforcing or balancing). */
export function loopSvg(cycle, type) {
  const nodes = (cycle || []).filter(Boolean);
  if (nodes.length < 2) return '';
  const cls = type === 'balancing' ? 'dg-bal' : 'dg-rein';
  const R = 78,
    cx = 130,
    cy = 110;
  const pts = nodes.map((_, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / nodes.length;
    return { x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) };
  });
  const edges = pts
    .map((p, i) => {
      const q = pts[(i + 1) % pts.length];
      return `<line class="dg-edge ${cls}" x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" marker-end="url(#dg-arrow)"/>`;
    })
    .join('');
  const labels = pts
    .map(
      (p, i) =>
        `<g><circle class="dg-dot ${cls}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5"/><text class="dg-loop-text" x="${p.x.toFixed(1)}" y="${(p.y - 11).toFixed(1)}" text-anchor="middle">${esc(truncate(nodes[i], 16))}</text></g>`
    )
    .join('');

  return `<svg class="diagram" viewBox="0 0 260 220" style="max-width:300px" xmlns="http://www.w3.org/2000/svg"><defs><marker id="dg-arrow" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto"><path class="dg-arrowhead" d="M0,0 L9,4.5 L0,9 z"/></marker></defs>${edges}${labels}</svg>`;
}
