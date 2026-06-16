// stack-scene.js
// Tech-Stack Builder result → a 'stack'-scope canvas scene.
import { createScene } from './scene.js';

/**
 * @param {{title?:string, roles?:any[], integrations?:any[], gaps?:any[], order?:string[]}} result
 * @param {string} [title]
 * @returns {object} stack scene
 */
export function buildStackScene(result, title) {
  const roles = (result && result.roles) || [];
  const integrations = (result && result.integrations) || [];
  const gaps = (result && result.gaps) || [];
  const order = (result && result.order) || [];

  const nodes = roles.map((r) => ({
    id: String(r.repoId),
    label: String(r.repoId).split('/').pop() || String(r.repoId),
    kind: 'repo',
    layer: r.layer || null,
    x: 0, y: 0, pinned: false,
    ref: { repoId: r.repoId, role: r.role || null },
  }));
  const repoIds = new Set(nodes.map((n) => n.id));

  gaps.forEach((g, i) => nodes.push({
    id: `gap:${i}`, label: String(g), kind: 'gap', layer: null,
    x: 0, y: 0, pinned: false, ref: { gap: true },
  }));

  const edges = integrations
    .filter((it) => it && repoIds.has(String(it.from)) && repoIds.has(String(it.to)))
    .map((it, i) => ({ id: `int:${i}`, from: String(it.from), to: String(it.to), rel: 'integrates', note: it.glue || null, userDrawn: false }));

  const scene = createScene({ scope: 'stack', repoId: null, title: title || (result && result.title) || 'Stack' });
  scene.nodes = nodes;
  scene.edges = edges;
  scene.source = { ...scene.source, order };
  return scene;
}
