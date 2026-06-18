// Pure ego-graph assembly — the in-JS replacement for VelesDB's graph node/edge reads.
// Given a center node, the edges that touch it, and the neighbors' payloads, produce the
// { center, edges, neighbors } shape the Connections tab already expects. No I/O.

export function buildEgoGraph(centerId, repoId, edges, nodePayloads = {}) {
  const centerKey = String(centerId);
  const norm = edges.map((e) => ({ source: String(e.source), target: String(e.target), label: e.label }));
  const neighborIds = [
    ...new Set(norm.flatMap((e) => [e.source, e.target]).filter((id) => id !== centerKey)),
  ];
  const neighbors = neighborIds.map((id) => {
    const p = nodePayloads[id] || {};
    const isIdea = p.kind === 'idea';
    return {
      id,
      name: isIdea ? p.title || 'idea' : p.name || p.repoId || id,
      analyzed: !!p.analyzed,
      repoId: p.repoId || null,
      kind: p.kind || 'repo',
      pitch: p.pitch || '',
    };
  });
  return {
    center: { id: centerKey, repoId, name: repoId.split('/').pop() || repoId },
    edges: norm,
    neighbors,
  };
}
