import { describe, it, expect } from 'vitest';
import { libraryRow, sortRows, filterRows, allCapabilities, relativeTime, sourceUrl, mergeRows } from '../library-data.js';

const mk = (repoId, score, warns, caps = [], extra = {}) => ({
  repoId,
  health: { score },
  red_flags: Array.from({ length: warns }, () => ({ severity: 'warning' })),
  pros: [1, 2],
  cons: [1],
  capabilities: caps,
  ...extra,
});

describe('libraryRow', () => {
  it('maps a payload into a row with a derived fit', () => {
    const row = libraryRow(mk('facebook/react', 92, 0, ['ui'], { description: 'A UI lib', languages: [{ name: 'JS', pct: 90 }] }));
    expect(row.repoId).toBe('facebook/react');
    expect(row.name).toBe('react');
    expect(row.fit.level).toBe('strong');
    expect(row.health).toBe(92);
    expect(row.capabilities).toEqual(['ui']);
    expect(row.blurb).toBe('A UI lib');
    expect(row.languages).toEqual([{ name: 'JS', pct: 90 }]);
  });
  it('marks a sparse/trimmed payload as Unrated (no fake fit)', () => {
    const row = libraryRow({ repoId: 'o/old', category: 'CLI', eli5: 'an old trimmed row' });
    expect(row.fit.level).toBe('unrated');
    expect(row.health).toBe(0);
  });
  it('rates a payload that has triage fields', () => {
    expect(libraryRow(mk('o/r', 92, 0)).fit.level).toBe('strong');
  });
  it('carries saved_at through as savedAt (empty string when absent)', () => {
    expect(libraryRow(mk('o/r', 92, 0, [], { saved_at: '2026-06-01T00:00:00Z' })).savedAt).toBe('2026-06-01T00:00:00Z');
    expect(libraryRow(mk('o/r', 92, 0)).savedAt).toBe('');
  });
  it('carries platform and maps a cache cachedAt (unix ms) to an ISO savedAt', () => {
    const row = libraryRow(mk('o/r', 92, 0, [], { platform: 'npm', cachedAt: Date.parse('2026-06-01T00:00:00Z') }));
    expect(row.platform).toBe('npm');
    expect(row.savedAt).toBe('2026-06-01T00:00:00.000Z');
  });
  it('prefers saved_at over cachedAt when both exist', () => {
    const row = libraryRow(mk('o/r', 92, 0, [], { saved_at: '2026-06-02T00:00:00Z', cachedAt: Date.parse('2026-06-01T00:00:00Z') }));
    expect(row.savedAt).toBe('2026-06-02T00:00:00Z');
  });
});

describe('sourceUrl', () => {
  it('maps each platform to its project page', () => {
    expect(sourceUrl('github', 'facebook/react')).toBe('https://github.com/facebook/react');
    expect(sourceUrl('gitlab', 'inkscape/inkscape')).toBe('https://gitlab.com/inkscape/inkscape');
    expect(sourceUrl('npm', 'express')).toBe('https://www.npmjs.com/package/express');
    expect(sourceUrl('pypi', 'requests')).toBe('https://pypi.org/project/requests/');
  });
  it('falls back to GitHub for unknown platforms with owner/name ids', () => {
    expect(sourceUrl('', 'o/r')).toBe('https://github.com/o/r');
  });
  it('falls back to a GitHub search for bare names', () => {
    expect(sourceUrl('', 'mystery')).toBe('https://github.com/search?q=mystery&type=repositories');
  });
});

describe('mergeRows', () => {
  const a = [{ repoId: 'o/a', src: 'saved' }, { repoId: 'o/b', src: 'saved' }];
  const b = [{ repoId: 'o/b', src: 'cache' }, { repoId: 'o/c', src: 'cache' }, { repoId: '', src: 'cache' }];
  it('unions by repoId with primary precedence; drops blank ids', () => {
    const merged = mergeRows(a, b);
    expect(merged.map(r => r.repoId)).toEqual(['o/a', 'o/b', 'o/c']);
    expect(merged.find(r => r.repoId === 'o/b').src).toBe('saved');
  });
  it('does not mutate either input', () => {
    mergeRows(a, b);
    expect(a.length).toBe(2);
    expect(b.length).toBe(3);
  });
  it('handles empty inputs', () => {
    expect(mergeRows([], b).map(r => r.repoId)).toEqual(['o/b', 'o/c']);
    expect(mergeRows(a, [])).toHaveLength(2);
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-06-09T12:00:00Z'); // fixed reference for deterministic tests
  const ago = (ms) => new Date(now - ms).toISOString();
  const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR;

  it('returns empty string for missing or unparseable input', () => {
    expect(relativeTime('', now)).toBe('');
    expect(relativeTime(null, now)).toBe('');
    expect(relativeTime('not-a-date', now)).toBe('');
  });
  it('reports sub-minute ages as "just now"', () => {
    expect(relativeTime(ago(5 * SEC), now)).toBe('just now');
  });
  it('reports minutes, hours, and days', () => {
    expect(relativeTime(ago(3 * MIN), now)).toBe('3m ago');
    expect(relativeTime(ago(5 * HOUR), now)).toBe('5h ago');
    expect(relativeTime(ago(2 * DAY), now)).toBe('2d ago');
  });
  it('reports months and years for older scans', () => {
    expect(relativeTime(ago(45 * DAY), now)).toBe('1mo ago');
    expect(relativeTime(ago(400 * DAY), now)).toBe('1y ago');
  });
  it('clamps a future timestamp to "just now" rather than a negative age', () => {
    expect(relativeTime(ago(-10 * MIN), now)).toBe('just now');
  });
});

describe('sortRows', () => {
  const rows = [mk('o/risky', 30, 4), mk('o/strong', 95, 0), mk('o/care', 55, 2), mk('o/solid', 78, 1)].map(libraryRow);
  it("by 'fit' orders strong → risky", () => {
    expect(sortRows(rows, 'fit').map(r => r.fit.level)).toEqual(['strong', 'solid', 'care', 'risky']);
  });
  it("by 'health' orders score desc", () => {
    expect(sortRows(rows, 'health').map(r => r.health)).toEqual([95, 78, 55, 30]);
  });
  it("by 'name' orders alphabetically and does not mutate the input", () => {
    const before = rows.map(r => r.repoId);
    expect(sortRows(rows, 'name').map(r => r.name)).toEqual(['care', 'risky', 'solid', 'strong']);
    expect(rows.map(r => r.repoId)).toEqual(before); // immutability
  });
});

describe('filterRows', () => {
  const rows = [mk('facebook/react', 90, 0, ['ui']), mk('vuejs/core', 88, 0, ['ui', 'reactivity']), mk('rust-lang/rust', 95, 0, ['compiler'])].map(libraryRow);
  it('filters by name substring (case-insensitive)', () => {
    expect(filterRows(rows, { query: 'RUST' }).map(r => r.name)).toEqual(['rust']);
  });
  it('filters by capability exact match', () => {
    expect(filterRows(rows, { capability: 'ui' }).map(r => r.name).sort()).toEqual(['core', 'react']);
  });
  it('empty filter returns all', () => {
    expect(filterRows(rows, {}).length).toBe(3);
  });
});

describe('allCapabilities', () => {
  it('returns sorted unique capabilities', () => {
    const rows = [mk('a/b', 80, 0, ['ui', 'storage']), mk('c/d', 80, 0, ['ui', 'agent'])].map(libraryRow);
    expect(allCapabilities(rows)).toEqual(['agent', 'storage', 'ui']);
  });
});
