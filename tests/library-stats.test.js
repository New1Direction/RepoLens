import { describe, it, expect } from 'vitest';
import { libraryStats } from '../library-data.js';

const row = (level, health) => ({ fit: { level }, health });

describe('libraryStats', () => {
  it('tallies rows by fit level', () => {
    const stats = libraryStats([
      row('strong', 90), row('strong', 80), row('solid', 70), row('care', 50), row('risky', 30),
    ]);
    expect(stats.total).toBe(5);
    expect(stats.byFit).toEqual({ strong: 2, solid: 1, care: 1, risky: 1, unrated: 0 });
  });
  it('averages only the rows that carry a health score', () => {
    const stats = libraryStats([row('strong', 90), row('solid', 70), row('unrated', 0)]);
    expect(stats.avgHealth).toBe(80); // (90 + 70) / 2, the 0-health row excluded
  });
  it('returns null average when nothing is rated', () => {
    expect(libraryStats([row('unrated', 0)]).avgHealth).toBeNull();
  });
  it('handles an empty library', () => {
    expect(libraryStats([])).toEqual({ total: 0, byFit: { strong: 0, solid: 0, care: 0, risky: 0, unrated: 0 }, avgHealth: null });
    expect(libraryStats(undefined).total).toBe(0);
  });
  it('treats a missing fit as unrated', () => {
    expect(libraryStats([{ health: 0 }]).byFit.unrated).toBe(1);
  });
});
