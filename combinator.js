// Pure selection engine for the Combinator. Ranks candidate repo combinations by
// adjacency (do they sit in the same / neighbouring capability layers — coherent) times
// disjointness (do they play different roles — novel). No DB, no AI. rows are
// { repoId, name, capabilities: string[], eli5? }.

import { layerOf, layersAdjacent } from './taxonomy.js';

function layersOf(caps) {
  return new Set((caps || []).map(layerOf));
}

function pairAdjacent(a, b) {
  const la = layersOf(a.capabilities),
    lb = layersOf(b.capabilities);
  if (!la.size || !lb.size) return false;
  for (const x of la) for (const y of lb) if (layersAdjacent(x, y)) return true;
  return false;
}

function disjointness(combo) {
  const counts = {};
  let total = 0;
  for (const r of combo)
    for (const t of r.capabilities || []) {
      counts[t] = (counts[t] || 0) + 1;
      total++;
    }
  if (!total) return 0;
  const shared = Object.values(counts)
    .filter((c) => c > 1)
    .reduce((s, c) => s + c, 0);
  return 1 - shared / total;
}

function adjacency(combo) {
  let pairs = 0,
    adj = 0;
  for (let i = 0; i < combo.length; i++)
    for (let j = i + 1; j < combo.length; j++) {
      pairs++;
      if (pairAdjacent(combo[i], combo[j])) adj++;
    }
  return pairs ? adj / pairs : 0;
}

function distinctLayers(combo) {
  const set = new Set();
  for (const r of combo) for (const t of r.capabilities || []) set.add(layerOf(t));
  return set.size;
}

/** Layer spread: distinct capability layers per repo (1 = every repo adds a new layer). */
function spread(combo) {
  return combo.length ? distinctLayers(combo) / combo.length : 0;
}

/**
 * Score one combo. wildness in [0,1] decays adjacency's weight (1 = ignore adjacency).
 * The `spread` factor rewards combos that span more distinct capability layers — this
 * gives the ranking resolution instead of saturating at 1.0 when repos carry one tag each.
 */
export function scoreCombo(combo, wildness = 0) {
  const a = adjacency(combo),
    d = disjointness(combo),
    s = spread(combo);
  // wildness 0 rewards adjacency (coherent combos); wildness 1 rewards non-adjacency
  // (surprising combos); a linear blend between, so the dial actually changes the ranking.
  const coherence = (1 - wildness) * a + wildness * (1 - a);
  return { score: coherence * d * s, adjacency: a, disjointness: d, spread: s };
}

/**
 * Greedy diversity-aware top-K (MMR-style). Picks the highest-scoring candidate, then for
 * each subsequent pick discounts candidates that reuse repos already chosen — so the
 * surfaced set spans different repos instead of repeating one "hub". The `seed` (present in
 * every candidate in repo-anchored mode) is excluded from the reuse penalty. Deterministic:
 * ties resolve to the higher-ranked (earlier) candidate.
 */
export function diversifyTopK(ranked, { seed = null, topK = 6, penalty = 0.7 } = {}) {
  const pool = ranked.slice();
  const picked = [];
  const used = new Set();
  while (picked.length < topK && pool.length) {
    let bestIdx = 0,
      bestAdj = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const others = pool[i].repoIds.filter((r) => r !== seed);
      const reused = others.length ? others.filter((r) => used.has(r)).length / others.length : 0;
      const adj = pool[i].score * (1 - penalty * reused);
      if (adj > bestAdj) {
        bestAdj = adj;
        bestIdx = i;
      }
    }
    const [chosen] = pool.splice(bestIdx, 1);
    picked.push(chosen);
    for (const r of chosen.repoIds) if (r !== seed) used.add(r);
  }
  return picked;
}

function combosOf(arr, k) {
  const res = [];
  const rec = (start, acc) => {
    if (acc.length === k) {
      res.push(acc.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      acc.push(arr[i]);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return res;
}

/**
 * Rank candidate combos. With `seed`, every candidate contains the seed repo (and the
 * seed fills one of the `sizes` slots). Returns the top-K
 * [{ repoIds, rows, score, adjacency, disjointness }], best first, deterministically.
 */
export function combineCandidates(rows, { seed = null, sizes = [2, 3], wildness = 0, topK = 6 } = {}) {
  const byId = new Map(rows.map((r) => [r.repoId, r]));
  const seedRow = seed ? byId.get(seed) : null;
  if (seed && !seedRow) return [];
  const pool = rows.filter((r) => r.repoId !== seed);

  const out = [];
  const seen = new Set();
  const extraSizes = seed ? sizes.map((s) => s - 1) : sizes; // seed fills one slot
  for (const k of extraSizes) {
    if (k < 1) continue;
    for (const c of combosOf(pool, k)) {
      const combo = seed ? [seedRow, ...c] : c;
      const key = combo
        .map((r) => r.repoId)
        .slice()
        .sort()
        .join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const sc = scoreCombo(combo, wildness);
      out.push({ repoIds: combo.map((r) => r.repoId), rows: combo, ...sc });
    }
  }
  out.sort(
    (x, y) =>
      y.score - x.score || y.disjointness - x.disjointness || x.repoIds.join().localeCompare(y.repoIds.join())
  );
  return diversifyTopK(out, { seed, topK });
}
