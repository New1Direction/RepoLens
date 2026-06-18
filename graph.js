// Pure, dependency-free graph helpers for the Connections tab: node/edge ids,
// a deterministic radial ego-layout, and an SVG renderer. Mirrors diagram.js —
// string functions, all values escaped, empty input → ''. No DOM, no network.

import { hashRepoId } from './store.js';
import { escapeHtml as esc } from './safe-html.js';

const truncate = (s, n) => {
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

/**
 * Numeric node id for a name or canonical repoId. A canonical "owner/repo"
 * (contains "/") hashes unchanged so a Synergies/Versus reference collapses onto
 * that repo's analyzed node; a bare name is trimmed + lowercased first so "Vue"
 * and "vue" merge into a single stub.
 */
export function nodeIdFor(nameOrRepoId) {
  const s = String(nameOrRepoId || '').trim();
  if (!s) return 1;
  return s.includes('/') ? hashRepoId(s) : hashRepoId(s.toLowerCase());
}

/** Deterministic edge id from the (source,label,target) triple — idempotent re-saves. */
export function edgeIdFor(source, label, target) {
  const key = `${source}|${label}|${target}`;
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) + hash + key.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) || 1;
}

/** Deterministic id for an IDEA node from its source repoIds — order-independent + idempotent. */
export function ideaIdFor(sources) {
  const key = (sources || []).map(String).slice().sort().join('+');
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) + hash + key.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) || 1;
}

const CX = 200,
  CY = 150,
  RADIUS = 110;

/**
 * Radial layout: center at (CX,CY) ring 0; neighbors evenly spaced on a circle
 * (start at top, clockwise) ring 1. Deterministic — same input, same coords.
 * Returns [{ id, x, y, ring }] with ids as strings.
 */
export function egoLayout(centerId, neighbors) {
  const list = neighbors || [];
  const out = [{ id: String(centerId), x: CX, y: CY, ring: 0 }];
  const n = list.length;
  list.forEach((nb, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    out.push({
      id: String(nb.id),
      x: +(CX + RADIUS * Math.cos(angle)).toFixed(1),
      y: +(CY + RADIUS * Math.sin(angle)).toFixed(1),
      ring: 1,
    });
  });
  return out;
}

const EDGE_CLASS = {
  ALTERNATIVE_TO: 'cn-alt',
  SYNERGIZES_WITH: 'cn-syn',
  COMPARED_TO: 'cn-vs',
  COMBINES: 'cn-combines',
};

/**
 * Ego-graph SVG. center: { id, name }; neighbors: [{ id, name, analyzed }];
 * edges: [{ source, target, label }]. Edges with an unknown endpoint are dropped.
 * Empty neighbors → ''.
 */
export function egoGraphSvg(center, neighbors, edges) {
  if (!center || !neighbors?.length) return '';
  const pos = Object.fromEntries(egoLayout(center.id, neighbors).map((p) => [p.id, p]));
  const c = pos[String(center.id)];

  const lines = (edges || [])
    .map((e) => {
      const a = pos[String(e.source)],
        b = pos[String(e.target)];
      if (!a || !b) return '';
      const cls = EDGE_CLASS[e.label] || 'cn-alt';
      return `<line class="cn-edge ${cls}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
    })
    .join('');

  const ring = neighbors
    .map((nb) => {
      const p = pos[String(nb.id)];
      const cls = nb.kind === 'idea' ? 'cn-idea' : nb.analyzed ? 'cn-analyzed' : 'cn-stub';
      return (
        `<g class="cn-node ${cls}" data-node="${esc(nb.id)}" data-analyzed="${nb.analyzed ? '1' : '0'}" data-kind="${esc(nb.kind || 'repo')}">` +
        `<circle cx="${p.x}" cy="${p.y}" r="13"/>` +
        `<text x="${p.x}" y="${p.y + 25}" text-anchor="middle">${esc(truncate(nb.name, 12))}</text></g>`
      );
    })
    .join('');

  const centerNode =
    `<g class="cn-node cn-center" data-node="${esc(center.id)}">` +
    `<circle cx="${c.x}" cy="${c.y}" r="22"/>` +
    `<text x="${c.x}" y="${c.y}" text-anchor="middle" dominant-baseline="central">${esc(truncate(center.name, 14))}</text></g>`;

  return `<svg class="cn-graph" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${lines}${centerNode}${ring}</svg>`;
}
