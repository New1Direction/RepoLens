// canvas-layout.js
// Pure seed-layout for the Blueprint scope. Left→right layered DAG.
// Ports diagram.js's cycle-safe depth relaxation; emits {x,y} not SVG.

const COL_W = 220, ROW_H = 110, PAD = 40;

/**
 * @param {object[]} nodes  scene nodes (mutated copies returned, inputs untouched)
 * @param {object[]} edges  scene edges
 * @returns {object[]} new node array with x/y assigned (pinned nodes keep theirs)
 */
export function layoutBlueprint(nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const idset = new Set(ids);
  const valid = edges.filter((e) => idset.has(e.from) && idset.has(e.to));

  // depth = longest path from a root; bounded relaxation (cycle-safe)
  const depth = Object.fromEntries(ids.map((id) => [id, 0]));
  for (let i = 0; i < ids.length; i++) {
    let changed = false;
    for (const e of valid) if (depth[e.to] < depth[e.from] + 1) { depth[e.to] = depth[e.from] + 1; changed = true; }
    if (!changed) break;
  }

  const cols = {};
  ids.forEach((id) => { (cols[depth[id]] ||= []).push(id); });

  const pos = {};
  Object.keys(cols).forEach((d) => {
    const col = cols[d];
    col.forEach((id, i) => { pos[id] = { x: PAD + Number(d) * COL_W, y: PAD + i * ROW_H }; });
  });

  return nodes.map((n) => (n.pinned ? { ...n } : { ...n, x: pos[n.id].x, y: pos[n.id].y }));
}

const CARD_W = 150, CARD_H = 64, GAP_X = 60, GAP_Y = 44, ORIGIN = 40;

/** Simple seed layout for the corkboard: union-find components, grid-place ordered by
 *  (component, id) so related repos start adjacent. Pinned nodes keep their position. Pure. */
export function layoutCorkboard(nodes, edges) {
  const parent = Object.fromEntries(nodes.map((n) => [n.id, n.id]));
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { if (parent[a] === undefined || parent[b] === undefined) return; parent[find(a)] = find(b); };
  for (const e of edges) union(e.from, e.to);

  const ordered = nodes.slice().sort((p, q) => {
    const rp = find(p.id), rq = find(q.id);
    return rp < rq ? -1 : rp > rq ? 1 : (p.id < q.id ? -1 : p.id > q.id ? 1 : 0);
  });

  const cols = Math.max(1, Math.ceil(Math.sqrt(ordered.length)));
  const pos = {};
  ordered.forEach((n, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    pos[n.id] = { x: ORIGIN + c * (CARD_W + GAP_X), y: ORIGIN + r * (CARD_H + GAP_Y) };
  });

  return nodes.map((n) => (n.pinned ? { ...n } : { ...n, x: pos[n.id].x, y: pos[n.id].y }));
}
