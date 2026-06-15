import { describe, it, expect } from 'vitest';
import { applyFilters } from '../library-filters.js';

const mkRow = (repoId, over = {}) => ({
  repoId,
  name: repoId.split('/').pop(),
  fit: { level: 'solid' },
  fitDelta: null,
  health: 50,
  stars: 0,
  capabilities: [],
  languages: [{ name: 'JavaScript' }],
  savedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const rows = [
  mkRow('a/one', { fit: { level: 'strong' } }),
  mkRow('a/two', { fit: { level: 'risky' }, languages: [{ name: 'Python' }] }),
  mkRow('a/three', { fit: { level: 'solid' } }),
];
const base = { query: '', sort: 'name' }; // 'name' sorts by repoId

describe('applyFilters', () => {
  it('returns every row with an empty filter state', () => {
    expect(applyFilters(rows, base, {}).map((r) => r.repoId)).toEqual(['a/one', 'a/three', 'a/two']);
  });

  it('narrows to a language', () => {
    const out = applyFilters(rows, { ...base, lang: 'javascript' }, {});
    expect(out.map((r) => r.repoId).sort()).toEqual(['a/one', 'a/three']);
  });

  it('decision=undecided hides rows that have a saved decision', () => {
    const decisionMap = new Map([['a/one', { decision: 'adopt', savedAt: '2026-01-01' }]]);
    const out = applyFilters(rows, { ...base, decision: 'undecided' }, { decisionMap });
    expect(out.map((r) => r.repoId)).not.toContain('a/one');
    expect(out).toHaveLength(2);
  });

  it('decision=<value> keeps only matching rows', () => {
    const decisionMap = new Map([
      ['a/one', { decision: 'adopt' }],
      ['a/two', { decision: 'reject' }],
    ]);
    const out = applyFilters(rows, { ...base, decision: 'adopt' }, { decisionMap });
    expect(out.map((r) => r.repoId)).toEqual(['a/one']);
  });

  it('collection filter keeps only members', () => {
    const collections = [{ id: 'c1', repoIds: ['a/two'] }];
    const out = applyFilters(rows, { ...base, collection: 'c1' }, { collections });
    expect(out.map((r) => r.repoId)).toEqual(['a/two']);
  });

  // The exact divergence this module fixes: the export path used to filter by the
  // NL ids but NOT re-order by the AI ranking. applyFilters preserves AI order.
  it('NL filter restricts to the AI ids AND preserves the AI order', () => {
    const out = applyFilters(rows, base, { nlFilter: { ids: ['a/three', 'a/one'] } });
    expect(out.map((r) => r.repoId)).toEqual(['a/three', 'a/one']);
  });

  it('NL filter with empty ids (AI found nothing) returns []', () => {
    expect(applyFilters(rows, base, { nlFilter: { ids: [] } })).toEqual([]);
  });

  it('eval sort orders by weighted score, unscored last', () => {
    const rubric = [{ id: 'docs', weight: 1 }];
    const evalMap = new Map([
      ['a/one', { scores: { docs: 2 } }],
      ['a/three', { scores: { docs: 5 } }],
    ]);
    const out = applyFilters(rows, { ...base, sort: 'eval' }, { evalMap, rubric });
    expect(out[0].repoId).toBe('a/three'); // 5 > 2 > unscored(-1)
    expect(out[out.length - 1].repoId).toBe('a/two'); // unscored sinks
  });
});
