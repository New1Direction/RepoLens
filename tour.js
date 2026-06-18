// tour.js
// Compute a guided tour (5–15 steps) from a scene's topology. Pure, deterministic.

const MAX_STEPS = 15;

/**
 * @param {{nodes:object[], edges:object[]}} scene
 * @param {{roots?:string[]}} [hints]
 * @returns {Array<{order:number,nodeIds:string[],title:string,blurb:string,lesson?:string}>}
 */
export function buildTour(scene, hints = {}) {
  const nodes = scene.nodes || [];
  const edges = scene.edges || [];
  if (!nodes.length) return [];
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  // fan-in / fan-out
  const fanIn = Object.fromEntries(nodes.map((n) => [n.id, 0]));
  const fanOut = Object.fromEntries(nodes.map((n) => [n.id, 0]));
  const adj = Object.fromEntries(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (byId[e.from]) {
      fanOut[e.from]++;
      adj[e.from].push(e.to);
    }
    if (byId[e.to]) fanIn[e.to]++;
  }

  // start: provided root with highest fan-out, else node with lowest fan-in / highest fan-out
  const roots = (hints.roots || []).filter((id) => byId[id]);
  let start = roots.sort((a, b) => fanOut[b] - fanOut[a])[0];
  if (!start)
    start = nodes.slice().sort((a, b) => fanIn[a.id] - fanIn[b.id] || fanOut[b.id] - fanOut[a.id])[0].id;

  // BFS reading order from start
  const order = [];
  const seen = new Set();
  const q = [start];
  seen.add(start);
  while (q.length) {
    const id = q.shift();
    order.push(id);
    for (const nb of adj[id] || [])
      if (!seen.has(nb)) {
        seen.add(nb);
        q.push(nb);
      }
  }
  // include any unreached nodes by fan-in importance
  for (const n of nodes.slice().sort((a, b) => fanIn[b.id] - fanIn[a.id]))
    if (!seen.has(n.id)) {
      seen.add(n.id);
      order.push(n.id);
    }

  const picked = order.slice(0, MAX_STEPS);
  return picked.map((id, i) => {
    const n = byId[id];
    return {
      order: i + 1,
      nodeIds: [id],
      title: n.label,
      blurb: n.ref && n.ref.purpose ? String(n.ref.purpose) : `${n.label} (${n.kind}).`,
    };
  });
}
