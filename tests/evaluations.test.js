import { describe, it, expect } from 'vitest';
import { computeScore, DEFAULT_RUBRIC } from '../evaluations.js';

const rubric = [
  { id: 'docs', name: 'Documentation', weight: 1 },
  { id: 'types', name: 'Type safety', weight: 2 },
];

describe('computeScore', () => {
  it('returns null with no scored criteria', () => {
    expect(computeScore(null, rubric)).toBeNull();
    expect(computeScore({}, rubric)).toBeNull();
    expect(computeScore({ scores: {} }, rubric)).toBeNull();
  });

  it('returns null with an empty rubric', () => {
    expect(computeScore({ scores: { docs: 5 } }, [])).toBeNull();
    expect(computeScore({ scores: { docs: 5 } }, null)).toBeNull();
  });

  it('computes a weighted average', () => {
    // docs=4 (w1), types=2 (w2) → (4·1 + 2·2) / (1+2) = 8/3
    expect(computeScore({ scores: { docs: 4, types: 2 } }, rubric)).toBeCloseTo(8 / 3);
  });

  it('ignores unscored (0) and out-of-range (>5) criteria', () => {
    // types=0 is unscored → only docs=5 counts
    expect(computeScore({ scores: { docs: 5, types: 0 } }, rubric)).toBe(5);
    // docs=9 is out of range → only types=3 (w2) counts
    expect(computeScore({ scores: { docs: 9, types: 3 } }, rubric)).toBe(3);
  });

  it('treats a missing weight as 1', () => {
    expect(computeScore({ scores: { a: 2, b: 4 } }, [{ id: 'a' }, { id: 'b' }])).toBe(3);
  });

  it('scores against the default rubric', () => {
    const all5 = { scores: { docs: 5, types: 5, maint: 5 } };
    expect(computeScore(all5, DEFAULT_RUBRIC)).toBe(5);
  });
});
