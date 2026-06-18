import { describe, it, expect } from 'vitest';
import { scoreCombo, combineCandidates, diversifyTopK } from '../combinator.js';

const vec = { repoId: 'o/vec', name: 'vec', capabilities: ['vector-index'] }; // storage
const vec2 = { repoId: 'o/vec2', name: 'vec2', capabilities: ['vector-index'] }; // storage (same role)
const tune = { repoId: 'o/tune', name: 'tune', capabilities: ['fine-tuning'] }; // ml (storage<->ml adjacent)
const fin = { repoId: 'o/fin', name: 'fin', capabilities: ['finance'] }; // domain (not adjacent to storage)
const rows = [vec, vec2, tune, fin];

describe('scoreCombo', () => {
  it('scores adjacent + disjoint pairs high', () => {
    const s = scoreCombo([vec, tune]);
    expect(s.adjacency).toBe(1);
    expect(s.disjointness).toBe(1);
    expect(s.score).toBeCloseTo(1);
  });
  it('scores same-role pairs near zero (no disjointness)', () => {
    expect(scoreCombo([vec, vec2]).disjointness).toBe(0);
    expect(scoreCombo([vec, vec2]).score).toBe(0);
  });
  it('penalizes non-adjacent pairs at wildness 0, rescues them at wildness 1', () => {
    expect(scoreCombo([vec, fin], 0).score).toBe(0);
    expect(scoreCombo([vec, fin], 1).score).toBeCloseTo(1);
  });
});

describe('combineCandidates', () => {
  it('only returns combos containing the seed', () => {
    const out = combineCandidates(rows, { seed: 'o/vec', topK: 10 });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((c) => c.repoIds.includes('o/vec'))).toBe(true);
  });
  it('ranks the adjacent+disjoint combo first', () => {
    const out = combineCandidates(rows, { seed: 'o/vec', topK: 10 });
    expect(out[0].repoIds).toContain('o/tune');
  });
  it('respects topK', () => {
    expect(combineCandidates(rows, { seed: 'o/vec', topK: 2 })).toHaveLength(2);
  });
  it('returns [] when the seed is not in the rows', () => {
    expect(combineCandidates(rows, { seed: 'missing/repo' })).toEqual([]);
  });
  it('each candidate carries its row objects for downstream synthesis', () => {
    const out = combineCandidates(rows, { seed: 'o/vec', topK: 1 });
    expect(Array.isArray(out[0].rows)).toBe(true);
    expect(out[0].rows[0]).toHaveProperty('capabilities');
  });
});

describe('scoreCombo resolution (Fix A — layer spread)', () => {
  const uiA = { repoId: 'x/ui', capabilities: ['ui-rendering'] }; // ui
  const uiB = { repoId: 'x/ui2', capabilities: ['visualization'] }; // ui (same layer, different tag)
  const dev = { repoId: 'x/dev', capabilities: ['cli'] }; // devtools (adjacent to ui)
  it('rewards combos spanning more capability layers, so scores are not all 1.0', () => {
    // both pairs are disjoint(1) + adjacent(1); only the layer spread differs
    expect(scoreCombo([uiA, dev]).score).toBeGreaterThan(scoreCombo([uiA, uiB]).score);
  });
  it('reports the spread factor (distinct layers per repo)', () => {
    expect(scoreCombo([uiA, dev]).spread).toBeCloseTo(1); // 2 layers / 2 repos
    expect(scoreCombo([uiA, uiB]).spread).toBeCloseTo(0.5); // 1 layer / 2 repos
  });
});

describe('diversifyTopK (Fix B — no repo dominates every pick)', () => {
  it('discounts reused repos so the top-K is diverse', () => {
    const ranked = [
      { repoIds: ['s', 'hub'], score: 1.0 },
      { repoIds: ['s', 'hub', 'x'], score: 0.95 },
      { repoIds: ['s', 'hub', 'y'], score: 0.94 },
      { repoIds: ['s', 'other'], score: 0.85 },
    ];
    const out = diversifyTopK(ranked, { seed: 's', topK: 2 });
    expect(out[0].repoIds).toEqual(['s', 'hub']); // best raw score first
    expect(out[1].repoIds).toEqual(['s', 'other']); // 'hub' penalized → diverse pick beats its own triples
  });
  it('keeps raw order when there is no overlap to avoid', () => {
    const ranked = [
      { repoIds: ['s', 'a'], score: 1.0 },
      { repoIds: ['s', 'b'], score: 0.9 },
    ];
    expect(diversifyTopK(ranked, { seed: 's', topK: 2 }).map((c) => c.repoIds[1])).toEqual(['a', 'b']);
  });
});

describe('wildness actually flips the ranking', () => {
  // vec(storage)+tune(ml) are adjacent/coherent; vec(storage)+fin(domain) are distant/surprising
  it('prefers coherent combos at wildness 0', () => {
    expect(scoreCombo([vec, tune], 0).score).toBeGreaterThan(scoreCombo([vec, fin], 0).score);
  });
  it('prefers surprising (non-adjacent) combos at wildness 1', () => {
    expect(scoreCombo([vec, fin], 1).score).toBeGreaterThan(scoreCombo([vec, tune], 1).score);
  });
});
