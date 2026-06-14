// RepoLens persistence — fully in-browser, backed by IndexedDB. This module REPLACES velesdb.js:
// it exposes the same function names the app already calls, minus the old `velesdbUrl` argument,
// since there is no longer a server. Reads degrade to []/null on failure; saveRepo throws so
// callers can surface errors (matching the old behavior).

import { deriveCapabilities } from './taxonomy.js';
import { deriveFit } from './verdict.js';
import { idbPut, idbGet, idbGetAll, idbDelete, idbClear } from './store/idb.js';
import { rankRepos } from './store/search.js';
import { buildEgoGraph } from './store/egograph.js';

/** Stable numeric key for a repo id (djb2). Unchanged from the VelesDB era so existing ids line up. */
export function hashRepoId(repoId) {
  let hash = 5381;
  for (let i = 0; i < repoId.length; i++) {
    hash = (hash << 5) + hash + repoId.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) || 1;
}

// ─── repos: document store ────────────────────────────────────────────────────

/** Persist a repo's analysis payload, keyed by hashRepoId. Throws on failure. */
export async function saveRepo(analysis) {
  const existing = await idbGet('repos', hashRepoId(analysis.repoId)).catch(() => null);
  const prevFitLevel = existing?.payload ? (deriveFit(existing.payload)?.level ?? null) : null;
  const payload = {
    repoId: analysis.repoId,
    platform: analysis.platform ?? '',
    language: analysis.language ?? '',
    license: analysis.license ?? '',
    stars: analysis.stars ?? 0,
    category: analysis.category ?? '',
    tags: analysis.tags ?? [],
    description: analysis.description ?? '',
    saved_at: new Date().toISOString(),
    eli5: analysis.eli5 ?? '',
    compare_hooks: analysis.compare_hooks ?? '',
    capabilities: analysis.capabilities ?? [],
    // Triage fields for the Library Home (fit chip + card).
    health: analysis.health ?? null,
    red_flags: analysis.red_flags ?? [],
    pros: analysis.pros ?? [],
    cons: analysis.cons ?? [],
    languages: analysis.languages ?? [],
    // Fit delta: snapshot the previous fit so the library can show ↑/↓ after re-scan.
    prevFitLevel,
  };
  await idbPut('repos', { id: hashRepoId(analysis.repoId), payload });
}

/** Save a full analysis. (No collection init needed — IndexedDB stores auto-create.) */
export async function saveAnalysis(analysis) {
  await saveRepo(analysis);
}

/** Remove one repo from the library by id. Best-effort — never throws (offline = no-op). */
export async function deleteRepo(repoId) {
  try {
    await idbDelete('repos', hashRepoId(repoId));
  } catch { /* store unavailable — caller still drops the local cache copy */ }
}

async function allPayloads() {
  const rows = await idbGetAll('repos');
  return (rows || []).map((r) => r.payload).filter((p) => p && p.repoId);
}

/** Map of repoId → bare metadata for cross-reference widgets (alternatives, similar). */
export async function getLibraryIndex() {
  try {
    const payloads = await allPayloads();
    return new Map(payloads.map((p) => [p.repoId, { stars: p.stars, language: p.language, license: p.license, capabilities: p.capabilities }]));
  } catch {
    return new Map();
  }
}

/** Raw points ({ id, payload }) for the Library grid and the re-tagging backfill. */
export async function scrollPoints({ limit = 500 } = {}) {
  try {
    const rows = await idbGetAll('repos');
    return (rows || [])
      .filter((r) => r && r.payload && r.payload.repoId)
      .slice(0, limit)
      .map((r) => ({ id: r.id, payload: r.payload }));
  } catch {
    return [];
  }
}

/** The whole library as trimmed, capability-tagged rows (for the Combinator). */
export async function scrollLibrary({ limit = 500 } = {}) {
  try {
    const payloads = await allPayloads();
    return payloads.slice(0, limit).map((p) => {
      const caps = Array.isArray(p.capabilities) && p.capabilities.length ? p.capabilities : deriveCapabilities(p);
      return { repoId: p.repoId, name: p.repoId.split('/').pop() || p.repoId, capabilities: caps, eli5: p.eli5 || '' };
    });
  } catch {
    return [];
  }
}

/** All library repos with their license, for client-side license compatibility checks. */
export async function allLicenses() {
  try {
    const payloads = await allPayloads();
    return payloads.map(p => ({ repoId: p.repoId, license: p.license || 'Unknown' }));
  } catch {
    return [];
  }
}

/** Up to 3 repos similar to the current one (by language/category overlap), excluding it. */
export async function findSimilar({ language, category, repoId }) {
  try {
    const ranked = rankRepos(await allPayloads(), `${language} ${category}`, { excludeId: repoId, topK: 3 });
    return ranked.map((p) => ({ repoId: p.repoId, eli5: p.eli5, compare_hooks: p.compare_hooks }));
  } catch {
    return [];
  }
}

/** Broader library pull used to seed the Synergies pass. */
export async function searchLibrary({ query, topK = 12, excludeRepoId }) {
  try {
    const ranked = rankRepos(await allPayloads(), query, { excludeId: excludeRepoId, topK });
    return ranked.map((p) => ({ repoId: p.repoId, category: p.category || '', language: p.language || '', eli5: p.eli5 || '' }));
  } catch {
    return [];
  }
}

// ─── collections: user-curated boards of repos ───────────────────────────────

/** Every collection, newest field shape. Best-effort — [] on failure. */
export async function listCollections() {
  try {
    const rows = await idbGetAll('collections');
    return (rows || []).map((r) => r && r.payload).filter((c) => c && c.id);
  } catch {
    return [];
  }
}

/** Upsert a collection (keyed by its id). Throws on failure so the UI can surface it. */
export async function saveCollection(collection) {
  if (!collection || !collection.id) throw new Error('Collection needs an id');
  await idbPut('collections', { id: collection.id, payload: collection });
}

/** Delete a collection by id. Best-effort — never throws. */
export async function deleteCollection(id) {
  try {
    await idbDelete('collections', id);
  } catch { /* store unavailable */ }
}

// ─── decisions: per-repo adoption decisions (Decision Log) ───────────────────

/** Persist an adoption decision for a repo, keyed by repoId. Throws on failure. */
export async function saveDecision(decision) {
  if (!decision || !decision.repoId) throw new Error('Decision needs a repoId');
  await idbPut('decisions', { id: decision.repoId, payload: decision });
}

/** Get the current decision for a repo. Returns null if none recorded. */
export async function getDecision(repoId) {
  try {
    const row = await idbGet('decisions', repoId);
    return (row && row.payload) || null;
  } catch {
    return null;
  }
}

/** Remove the recorded decision for a repo. Best-effort — never throws. */
export async function clearDecision(repoId) {
  try {
    await idbDelete('decisions', repoId);
  } catch { /* store unavailable */ }
}

/** All decisions. Best-effort — [] on failure. */
export async function listDecisions() {
  try {
    const rows = await idbGetAll('decisions');
    return (rows || []).map((r) => r && r.payload).filter((d) => d && d.repoId);
  } catch {
    return [];
  }
}

// ─── graph: nodes + edges for the Connections tab ─────────────────────────────

/** Upsert a graph node's payload (idempotent by id). Throws on failure (callers wrap best-effort). */
export async function upsertNode(nodeId, payload) {
  await idbPut('nodes', { id: String(nodeId), payload });
}

/** Add/replace an edge (idempotent by id). Throws on failure (callers wrap best-effort). */
export async function addEdge({ id, source, target, label, properties = {} }) {
  await idbPut('edges', { id: String(id), source: String(source), target: String(target), label, properties });
}

/** Ring-1 ego graph for one repo. Returns { center, edges, neighbors } or null on failure. */
export async function getEgoGraph(repoId) {
  const centerId = hashRepoId(repoId);
  const centerKey = String(centerId);
  try {
    const allEdges = (await idbGetAll('edges')) || [];
    const touching = allEdges.filter((e) => String(e.source) === centerKey || String(e.target) === centerKey);
    const neighborIds = [
      ...new Set(touching.flatMap((e) => [String(e.source), String(e.target)]).filter((id) => id !== centerKey)),
    ];
    const nodePayloads = {};
    for (const id of neighborIds) {
      const n = await idbGet('nodes', id);
      nodePayloads[id] = (n && n.payload) || {};
    }
    return buildEgoGraph(centerId, repoId, touching, nodePayloads);
  } catch {
    return null;
  }
}

// ─── backup: whole-library export / import ────────────────────────────────────

const validRows = (rows) => (rows || []).filter((r) => r && r.id != null);

/** Gather every row from all stores for a backup envelope. */
export async function exportStores() {
  const [repos, nodes, edges, collections, decisions] = await Promise.all([
    idbGetAll('repos'),
    idbGetAll('nodes'),
    idbGetAll('edges'),
    idbGetAll('collections'),
    idbGetAll('decisions'),
  ]);
  return { repos: repos || [], nodes: nodes || [], edges: edges || [], collections: collections || [], decisions: decisions || [] };
}

/**
 * Write backed-up rows into the stores.
 * - mode 'replace' wipes each store first (a clean restore).
 * - mode 'merge' (default) upserts: matching ids are overwritten, the rest kept.
 * Returns the number of rows written per store. Throws on store failure so the
 * caller can surface a clear error (matching saveRepo's contract).
 * @param {{ repos?: object[], nodes?: object[], edges?: object[] }} rows
 * @param {{ mode?: 'merge'|'replace' }} [opts]
 */
export async function importStores({ repos = [], nodes = [], edges = [], collections = [], decisions = [] } = {}, { mode = 'merge' } = {}) {
  if (mode === 'replace') {
    await Promise.all([idbClear('repos'), idbClear('nodes'), idbClear('edges'), idbClear('collections'), idbClear('decisions')]);
  }
  const vr = validRows(repos), vn = validRows(nodes), ve = validRows(edges), vc = validRows(collections), vd = validRows(decisions);
  for (const row of vr) await idbPut('repos', row);
  for (const row of vn) await idbPut('nodes', row);
  for (const row of ve) await idbPut('edges', row);
  for (const row of vc) await idbPut('collections', row);
  for (const row of vd) await idbPut('decisions', row);
  return { repos: vr.length, nodes: vn.length, edges: ve.length, collections: vc.length, decisions: vd.length };
}

/** Wipe the whole library (all stores). Backs the "Clear library" action. */
export async function clearLibrary() {
  await Promise.all([idbClear('repos'), idbClear('nodes'), idbClear('edges'), idbClear('collections'), idbClear('decisions')]);
}
