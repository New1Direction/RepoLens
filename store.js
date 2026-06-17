// RepoLens persistence — fully in-browser, backed by IndexedDB. This module REPLACES velesdb.js:
// it exposes the same function names the app already calls, minus the old `velesdbUrl` argument,
// since there is no longer a server. Reads degrade to []/null on failure; saveRepo throws so
// callers can surface errors (matching the old behavior).

import { deriveCapabilities } from './taxonomy.js';
import { deriveFit } from './verdict.js';
import { idbPut, idbGet, idbGetAll, idbDelete, idbClear } from './store/idb.js';
import { rankRepos } from './store/search.js';
import { buildEgoGraph } from './store/egograph.js';
import { toSnapshot, appendSnapshot, SNAPSHOT_CAP } from './snapshots.js';

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
    // Carry the onboarding demo marker through so the seeded sample survives the
    // round-trip and can be excluded from stats / torn down. Absent for real repos.
    ...(analysis.__demo__ === true ? { __demo__: true } : {}),
  };
  await idbPut('repos', { id: hashRepoId(analysis.repoId), payload });
  await appendScanSnapshot(payload, existing?.payload);
}

/**
 * Append a snapshot for a repo's current payload (best-effort — a ledger write
 * must never fail a scan). `prevPayload` (the repo's previous state, which saveRepo
 * already reads) seeds one prior point the first time, so an existing repo's first
 * re-scan yields a real 2-point trend instead of losing its history.
 */
export async function appendScanSnapshot(payload, prevPayload) {
  // The onboarding demo is a fixture, not a real scan — never let it seed the
  // ledger (an orphan snapshot would leak into backups and replaying the intro
  // would double it up). The demo repo/scene are torn down separately.
  if (payload && payload.__demo__ === true) return;
  if (!payload || !payload.repoId) return;
  try {
    const id = hashRepoId(payload.repoId);
    const rec = await idbGet('snapshots', id).catch(() => null);
    let snaps = rec && Array.isArray(rec.snaps) ? rec.snaps : [];
    if (!snaps.length && prevPayload && prevPayload.saved_at) {
      snaps = [toSnapshot(prevPayload)];
    }
    snaps = appendSnapshot(snaps, toSnapshot(payload), SNAPSHOT_CAP);
    await idbPut('snapshots', { id, repoId: payload.repoId, snaps });
  } catch {
    /* the ledger is additive; a write failure must not break the scan */
  }
}

/** A repo's snapshot history (oldest→newest). Best-effort — [] on failure. */
export async function listSnapshots(repoId) {
  try {
    const rec = await idbGet('snapshots', hashRepoId(repoId));
    return rec && Array.isArray(rec.snaps) ? rec.snaps : [];
  } catch {
    return [];
  }
}

/** Remove a repo's snapshot history. Best-effort — never throws (mirrors deleteRepo). */
export async function deleteSnapshots(repoId) {
  try {
    await idbDelete('snapshots', hashRepoId(repoId));
  } catch { /* best-effort */ }
}

/** All snapshot histories as a Map(repoId → snaps[]) for batch rendering. */
export async function listAllSnapshots() {
  try {
    const rows = await idbGetAll('snapshots');
    return new Map((rows || []).filter((r) => r && r.repoId).map((r) => [r.repoId, r.snaps || []]));
  } catch {
    return new Map();
  }
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

// ─── mastery: per-repo Knowledge-Game signal ─────────────────────────────────

/** Persist a repo's mastery record (already computed by mastery.js). Throws on failure. */
export async function setMastery(repoId, record) {
  if (!repoId) throw new Error('setMastery needs a repoId');
  await idbPut('mastery', { id: repoId, payload: record });
}

/** Get a repo's mastery record, or null if none / on store error. */
export async function getMastery(repoId) {
  try {
    const row = await idbGet('mastery', repoId);
    return (row && row.payload) || null;
  } catch {
    return null;
  }
}

/** All mastery records as a { repoId: record } map. Best-effort — {} on failure. */
export async function getAllMastery() {
  try {
    const rows = await idbGetAll('mastery');
    const out = {};
    for (const r of rows || []) if (r && r.id) out[r.id] = r.payload;
    return out;
  } catch {
    return {};
  }
}

// ─── concepts: per-repo deep-dive atoms + embeddings (Knowledge Graph) ────────

/** Persist a repo's concept record (atoms [+ vectors]). Throws on failure. */
export async function setConcepts(repoId, record) {
  if (!repoId) throw new Error('setConcepts needs a repoId');
  await idbPut('concepts', { id: repoId, payload: record });
}

/** Get a repo's concept record, or null. */
export async function getConcepts(repoId) {
  try {
    const row = await idbGet('concepts', repoId);
    return (row && row.payload) || null;
  } catch {
    return null;
  }
}

/** All concept records as a { repoId: record } map. Best-effort — {} on failure. */
export async function getAllConcepts() {
  try {
    const rows = await idbGetAll('concepts');
    const out = {};
    for (const r of rows || []) if (r && r.id) out[r.id] = r.payload;
    return out;
  } catch {
    return {};
  }
}

// ─── Canvas scenes ────────────────────────────────────────────────────────────

/** Persist a canvas scene (upsert by id). Throws on failure. */
export async function saveScene(scene) {
  if (!scene || !scene.id) throw new Error('saveScene: scene.id required');
  await idbPut('scenes', scene);
}

/** Get a single scene by id. Returns null if not found or on store error. */
export async function getScene(id) {
  try {
    return (await idbGet('scenes', String(id))) || null;
  } catch {
    return null;
  }
}

/** All scenes, optionally filtered by repoId. Best-effort — [] on failure. */
export async function listScenes(repoId) {
  try {
    const all = (await idbGetAll('scenes')) || [];
    return repoId == null ? all : all.filter((s) => s.repoId === repoId);
  } catch {
    return [];
  }
}

/** Delete a scene by id. Best-effort — never throws. */
export async function deleteScene(id) {
  try {
    await idbDelete('scenes', String(id));
  } catch { /* store unavailable */ }
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

/** The whole library graph: every node payload + every edge. Best-effort — empty on failure. */
export async function getLibraryGraph() {
  try {
    const [nodeRows, edges] = await Promise.all([idbGetAll('nodes'), idbGetAll('edges')]);
    return {
      nodes: (nodeRows || []).filter((r) => r && r.payload).map((r) => ({ nodeId: String(r.id), ...r.payload })),
      edges: (edges || []),
    };
  } catch {
    return { nodes: [], edges: [] };
  }
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

/** Gather every row from all stores for a backup envelope. The seeded onboarding
 *  demo (repo + its snapshot + its scene, all tagged __demo__) is dropped so it
 *  never leaks into a user's backup file. */
export async function exportStores() {
  const [repos, nodes, edges, collections, decisions, snapshots, scenes] = await Promise.all([
    idbGetAll('repos'),
    idbGetAll('nodes'),
    idbGetAll('edges'),
    idbGetAll('collections'),
    idbGetAll('decisions'),
    idbGetAll('snapshots'),
    idbGetAll('scenes'),
  ]);
  const isDemoRepo = (r) => r?.payload?.__demo__ === true;
  // Snapshot rows share the repo's hashed id, so the demo repo's id is also its snapshot key.
  const demoIds = new Set((repos || []).filter(isDemoRepo).map((r) => r.id));
  return {
    repos: (repos || []).filter((r) => !isDemoRepo(r)),
    nodes: nodes || [],
    edges: edges || [],
    collections: collections || [],
    decisions: decisions || [],
    snapshots: (snapshots || []).filter((s) => !demoIds.has(s.id)),
    scenes: (scenes || []).filter((s) => s?.__demo__ !== true),
  };
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
export async function importStores({ repos = [], nodes = [], edges = [], collections = [], decisions = [], snapshots = [], scenes = [] } = {}, { mode = 'merge' } = {}) {
  if (mode === 'replace') {
    await Promise.all([idbClear('repos'), idbClear('nodes'), idbClear('edges'), idbClear('collections'), idbClear('decisions'), idbClear('snapshots'), idbClear('scenes')]);
  }
  const vr = validRows(repos), vn = validRows(nodes), ve = validRows(edges), vc = validRows(collections), vd = validRows(decisions), vs = validRows(snapshots), vsc = validRows(scenes);
  for (const row of vr) await idbPut('repos', row);
  for (const row of vn) await idbPut('nodes', row);
  for (const row of ve) await idbPut('edges', row);
  for (const row of vc) await idbPut('collections', row);
  for (const row of vd) await idbPut('decisions', row);
  for (const row of vs) await idbPut('snapshots', mode === 'merge' ? await mergeSnapshotRow(row) : row);
  for (const row of vsc) await idbPut('scenes', row);
  return { repos: vr.length, nodes: vn.length, edges: ve.length, collections: vc.length, decisions: vd.length, snapshots: vs.length, scenes: vsc.length };
}

/**
 * In merge mode, fold an incoming snapshot row into the local one (same id) instead
 * of overwriting it — so importing a short backup never wipes a repo's longer local
 * history. Snaps are unioned by `ts` (incoming wins on tie), sorted oldest→newest,
 * and re-clamped to SNAPSHOT_CAP. A row with no local counterpart passes through
 * (still clamped, so a hostile file can't blow the cap).
 */
async function mergeSnapshotRow(row) {
  const local = await idbGet('snapshots', row.id).catch(() => null);
  const incoming = Array.isArray(row.snaps) ? row.snaps : [];
  if (!local || !Array.isArray(local.snaps) || !local.snaps.length) {
    return { ...row, snaps: clampSnaps(incoming) };
  }
  const byTs = new Map();
  for (const s of local.snaps) if (s && s.ts) byTs.set(s.ts, s);
  for (const s of incoming) if (s && s.ts) byTs.set(s.ts, s); // incoming wins on tie
  const union = [...byTs.values()].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return { ...row, snaps: clampSnaps(union) };
}

/** Keep only the most recent SNAPSHOT_CAP snaps (the list is already sorted ascending). */
const clampSnaps = (snaps) => (snaps.length > SNAPSHOT_CAP ? snaps.slice(snaps.length - SNAPSHOT_CAP) : snaps);

/** Wipe the whole library (all stores). Backs the "Clear library" action. */
export async function clearLibrary() {
  await Promise.all([idbClear('repos'), idbClear('nodes'), idbClear('edges'), idbClear('collections'), idbClear('decisions'), idbClear('snapshots'), idbClear('scenes')]);
}
