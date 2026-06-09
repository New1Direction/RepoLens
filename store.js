// RepoLens persistence — fully in-browser, backed by IndexedDB. This module REPLACES velesdb.js:
// it exposes the same function names the app already calls, minus the old `velesdbUrl` argument,
// since there is no longer a server. Reads degrade to []/null on failure; saveRepo throws so
// callers can surface errors (matching the old behavior).

import { deriveCapabilities } from './taxonomy.js';
import { idbPut, idbGet, idbGetAll } from './store/idb.js';
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
  const payload = {
    repoId: analysis.repoId,
    platform: analysis.platform ?? '',
    language: analysis.language ?? '',
    license: analysis.license ?? '',
    stars: analysis.stars ?? 0,
    category: analysis.category ?? '',
    tags: analysis.tags ?? [],
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
  };
  await idbPut('repos', { id: hashRepoId(analysis.repoId), payload });
}

/** Save a full analysis. (No collection init needed — IndexedDB stores auto-create.) */
export async function saveAnalysis(analysis) {
  await saveRepo(analysis);
}

async function allPayloads() {
  const rows = await idbGetAll('repos');
  return (rows || []).map((r) => r.payload).filter((p) => p && p.repoId);
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
