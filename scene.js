// scene.js
// Pure scene model for the interactive canvas. No DOM, no network.

/** djb2 string hash → positive integer. Deterministic; mirrors store.hashRepoId. */
export function hashId(str) {
  let h = 5381;
  const s = String(str);
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) || 1;
}

const nowIso = () => new Date().toISOString();

/** Build an empty scene for a scope. id derives from scope + repoId. */
export function createScene({ scope, repoId = null, title = '' }) {
  const id =
    scope === 'corkboard'
      ? 'library'
      : scope === 'stack'
        ? 'stack:' + hashId(repoId || title)
        : 'repo:' + hashId(repoId || title);
  const ts = nowIso();
  return {
    id,
    scope,
    repoId,
    title,
    nodes: [],
    edges: [],
    annotations: [],
    camera: { x: 0, y: 0, zoom: 1 },
    tour: null,
    source: { lens: 'deepDive', generatedAt: ts, scanAt: null },
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Immutable: return a copy of `scene` with node `id` moved to (x,y). */
export function withNodePos(scene, id, x, y) {
  return {
    ...scene,
    nodes: scene.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
    updatedAt: nowIso(),
  };
}

/** Validate referential integrity. Returns { ok, errors }. */
export function validateScene(scene) {
  const errors = [];
  if (!scene || typeof scene !== 'object') return { ok: false, errors: ['not an object'] };
  const ids = new Set((scene.nodes || []).map((n) => n.id));
  for (const e of scene.edges || []) {
    if (!ids.has(e.from) || !ids.has(e.to)) errors.push(`edge ${e.id} references unknown node`);
  }
  return { ok: errors.length === 0, errors };
}
