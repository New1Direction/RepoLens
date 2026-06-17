// tests/mastery.test.js
import { describe, it, expect } from 'vitest';
import {
  MASTERY_LEVELS, UNDERSTOOD_THRESHOLD, levelLabel, levelRank,
  deriveCheckResult, aggregateMastery,
} from '../mastery.js';

const Q = (n) => Array.from({ length: n }, (_, i) => ({ q: `q${i}`, a: `a${i}` }));

describe('deriveCheckResult', () => {
  it('marks understood at exactly 2 of 3 (the 2/3 boundary, not a rounded 0.67)', () => {
    const r = deriveCheckResult(Q(3), ['gotIt', 'gotIt', 'missed']);
    expect(r.level).toBe('understood');
    expect(r.score).toBeCloseTo(2 / 3);
    expect(r.gotIt).toBe(2);
  });

  it('marks explored below the threshold', () => {
    expect(deriveCheckResult(Q(3), ['gotIt', 'missed', 'missed']).level).toBe('explored');
    expect(deriveCheckResult(Q(2), ['gotIt', 'shaky']).level).toBe('explored'); // 0.5 < 2/3
  });

  it('marks understood at 4 of 6', () => {
    expect(deriveCheckResult(Q(6), ['gotIt', 'gotIt', 'gotIt', 'gotIt', 'shaky', 'missed']).level).toBe('understood');
  });

  it('partitions glows (gotIt) from grows (shaky/missed) by question text', () => {
    const r = deriveCheckResult(Q(3), ['gotIt', 'shaky', 'missed']);
    expect(r.glows).toEqual(['q0']);
    expect(r.grows).toEqual(['q1', 'q2']);
    expect({ gotIt: r.gotIt, shaky: r.shaky, missed: r.missed, total: r.total }).toEqual({ gotIt: 1, shaky: 1, missed: 1, total: 3 });
  });

  it('returns level new with zero counts for an empty check (no accidental promotion)', () => {
    const r = deriveCheckResult([], []);
    expect(r).toEqual({ level: 'new', score: 0, gotIt: 0, shaky: 0, missed: 0, total: 0, glows: [], grows: [] });
  });
});

describe('aggregateMastery', () => {
  it('counts levels across a records map', () => {
    const recs = {
      'a/b': { level: 'understood' }, 'c/d': { level: 'understood' },
      'e/f': { level: 'explored' }, 'g/h': { level: 'new' },
    };
    expect(aggregateMastery(recs)).toEqual({ total: 4, understood: 2, explored: 1, new: 1 });
  });
  it('treats unknown/missing levels as new and tolerates empty input', () => {
    expect(aggregateMastery({})).toEqual({ total: 0, understood: 0, explored: 0, new: 0 });
    expect(aggregateMastery({ 'x/y': {} }).new).toBe(1);
  });
});

describe('level helpers', () => {
  it('labels and ranks levels', () => {
    expect(levelLabel('understood')).toBe('Understood');
    expect(levelLabel('whatever')).toBe('New');
    expect(levelRank('new')).toBeLessThan(levelRank('explored'));
    expect(levelRank('explored')).toBeLessThan(levelRank('understood'));
  });
  it('exposes the 2/3 threshold constant', () => {
    expect(UNDERSTOOD_THRESHOLD).toBeCloseTo(2 / 3);
    expect(MASTERY_LEVELS.UNDERSTOOD).toBe('understood');
  });
});
