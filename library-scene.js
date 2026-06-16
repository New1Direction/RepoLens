// library-scene.js
// Library graph (nodes/edges stores) + repo metadata → a 'corkboard' scene.
import { createScene } from './scene.js';

const idOf = (n) => String(n.repoId || n.title || n.nodeId || '');

/**
 * @param {object} args
 * @param {{nodes:any[], edges:any[]}} args.graph  from store.getLibraryGraph()
 * @param {Array<{repoId:string, fit?:string, health?:{score:number}, decision?:string}>} [args.repos]
 * @param {string[]} [args.only]  when set, keep only these repoIds (Collection filter)
 * @returns {object} corkboard scene (id 'library')
 */
export function buildLibraryScene({ graph, repos = [], only = null }) {
  const meta = Object.fromEntries(repos.map((r) => [r.repoId, r]));
  const keep = only ? new Set(only) : null;

  const rawNodes = (graph?.nodes || []).filter((n) => {
    const id = idOf(n);
    if (!id) return false;
    if (keep && n.kind === 'idea') { const src = n.sources || []; return src.length > 0 && src.every((s) => keep.has(s)); }
    if (keep) return keep.has(id);
    return true;
  });

  const nodes = rawNodes.map((n) => {
    const id = idOf(n);
    const m = meta[n.repoId] || {};
    return {
      id,
      label: n.kind === 'idea' ? String(n.title || 'idea') : String(n.name || id.split('/').pop() || id),
      kind: n.kind === 'idea' ? 'idea' : 'repo',
      layer: null,
      x: 0, y: 0, pinned: false,
      ref: {
        repoId: n.repoId || null,
        analyzed: !!n.analyzed,
        fit: m.fit || null,
        health: (m.health && Number.isFinite(m.health.score)) ? m.health.score : null,
        decision: m.decision || null,
        pitch: n.pitch || null,
        sources: n.sources || null,
      },
    };
  });

  // Edges in the store reference the hashed node-store id (nodeIdFor), not the repoId.
  // Map those back to scene node ids; also tolerate edges that already use the scene id.
  const byNodeId = new Map();
  for (const n of rawNodes) {
    const sid = idOf(n);
    if (n.nodeId != null) byNodeId.set(String(n.nodeId), sid);
    byNodeId.set(sid, sid);
  }
  const edges = (graph?.edges || [])
    .map((e) => ({ id: String(e.id), from: byNodeId.get(String(e.source)), to: byNodeId.get(String(e.target)), rel: String(e.label || 'ALTERNATIVE_TO'), note: null, userDrawn: false }))
    .filter((e) => e.from && e.to);

  const scene = createScene({ scope: 'corkboard', repoId: null, title: 'Library' });
  scene.nodes = nodes;
  scene.edges = edges;
  return scene;
}
