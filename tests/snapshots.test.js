import { describe, it, expect } from 'vitest';
import { toSnapshot, appendSnapshot, snapshotTrend, sparkline, SNAPSHOT_CAP } from '../snapshots.js';

describe('toSnapshot', () => {
  it('trims a payload to the snapshot shape (health, flag titles, fit via deriveFit)', () => {
    // Real red_flags carry a `severity`; deriveFit counts non-'ok' flags as warnings,
    // so health 88 with 2 warning flags derives to 'care' — and the ledger's fit must
    // match what the app shows (deriveFit on the same payload), so toSnapshot passes the
    // real red_flags through unfiltered.
    const snap = toSnapshot(
      {
        repoId: 'a/b',
        health: 88,
        stars: 1200,
        red_flags: [
          { title: 'No tests', severity: 'warn' },
          { title: '', severity: 'warn' },
        ],
        saved_at: '2026-06-01T00:00:00.000Z',
      },
      '2026-06-01T00:00:00.000Z'
    );
    expect(snap).toEqual({
      ts: '2026-06-01T00:00:00.000Z',
      health: 88,
      fit: 'care',
      stars: 1200,
      flags: ['No tests'], // empty title dropped; titles kept regardless of severity
    });
    // B-4: `version` is never populated upstream (the persisted repo payload has no
    // version field), so the snapshot must not carry an always-null key.
    expect(snap).not.toHaveProperty('version');
  });

  it('reads an old snapshot that still carries a version field (backward-compatible)', () => {
    // snapshotTrend must tolerate legacy snaps that predate dropping the field.
    const trend = snapshotTrend([
      { ts: '2026-06-01T00:00:00.000Z', health: 60, fit: 'care', stars: 0, flags: [], version: '1.0.0' },
      { ts: '2026-06-02T00:00:00.000Z', health: 70, fit: 'care', stars: 0, flags: [] },
    ]);
    expect(trend.healthDelta).toBe(10);
  });
  it('derives a strong fit for a healthy, flag-free repo', () => {
    const snap = toSnapshot(
      { repoId: 'a/b', health: 90, stars: 0, red_flags: [] },
      '2026-06-01T00:00:00.000Z'
    );
    expect(snap.fit).toBe('strong');
  });
  it('accepts health as a { score } object and defaults ts to saved_at', () => {
    const snap = toSnapshot({
      repoId: 'a/b',
      health: { score: 60 },
      stars: 0,
      red_flags: [],
      saved_at: '2026-06-02T00:00:00.000Z',
    });
    expect(snap.health).toBe(60);
    expect(snap.ts).toBe('2026-06-02T00:00:00.000Z');
    expect(snap.fit).toBe('care'); // 60, 0 flags
  });
  it('yields null health when absent', () => {
    expect(toSnapshot({ repoId: 'a/b', red_flags: [] }, '2026-06-01T00:00:00.000Z').health).toBeNull();
  });
});

describe('appendSnapshot', () => {
  it('appends immutably and never mutates the input', () => {
    const a = [{ ts: '1' }];
    const out = appendSnapshot(a, { ts: '2' });
    expect(out).toHaveLength(2);
    expect(a).toHaveLength(1);
  });
  it('keeps only the most recent `cap`', () => {
    const many = Array.from({ length: SNAPSHOT_CAP }, (_, i) => ({ ts: String(i) }));
    const out = appendSnapshot(many, { ts: 'new' }, SNAPSHOT_CAP);
    expect(out).toHaveLength(SNAPSHOT_CAP);
    expect(out[0].ts).toBe('1');
    expect(out[out.length - 1].ts).toBe('new');
  });
  it('handles a non-array prev', () => {
    expect(appendSnapshot(undefined, { ts: 'x' })).toEqual([{ ts: 'x' }]);
  });
});

describe('snapshotTrend', () => {
  const snaps = [
    { ts: '2026-06-01T00:00:00.000Z', health: 72, fit: 'care', stars: 100, flags: ['No tests', 'Stale'] },
    { ts: '2026-06-11T00:00:00.000Z', health: 91, fit: 'strong', stars: 150, flags: ['No tests'] },
  ];
  it('returns null for <2 points', () => {
    expect(snapshotTrend([])).toBeNull();
    expect(snapshotTrend([snaps[0]])).toBeNull();
  });
  it('computes health delta, fit direction, flag diffs and day span', () => {
    const t = snapshotTrend(snaps);
    expect(t.count).toBe(2);
    expect(t.healthDelta).toBe(19);
    expect(t.fitFrom).toBe('care');
    expect(t.fitTo).toBe('strong');
    expect(t.fitDirection).toBe('up');
    expect(t.flagsResolved).toEqual(['Stale']);
    expect(t.flagsNew).toEqual([]);
    expect(t.daysSpan).toBe(10);
    expect(t.series).toHaveLength(2);
  });
  // HIGH-2: a corrupt/hostile backup can pass the envelope-only validateBackup with
  // a non-array `flags` (number, string, null). snapshotTrend must coerce, not throw.
  it('does not throw when flags is a non-array value, behaving as if empty', () => {
    for (const bad of [5, 'No tests', null, undefined, {}]) {
      const corrupt = [
        { ts: '2026-06-01T00:00:00.000Z', health: 70, fit: 'care', stars: 0, flags: bad },
        { ts: '2026-06-11T00:00:00.000Z', health: 80, fit: 'strong', stars: 0, flags: bad },
      ];
      const t = snapshotTrend(corrupt);
      expect(t.flagsResolved).toEqual([]);
      expect(t.flagsNew).toEqual([]);
    }
  });
});

describe('sparkline', () => {
  it('returns null for <2 plottable points', () => {
    expect(sparkline([{ health: 5 }])).toBeNull();
    expect(sparkline([{ health: null }, { health: null }])).toBeNull();
  });
  it('builds an svg polyline scaled to the box', () => {
    const svg = sparkline([{ health: 0 }, { health: 50 }, { health: 100 }], { width: 100, height: 20 });
    expect(svg).toContain('<svg');
    expect(svg).toContain('<polyline');
    // min=0 → y=height(20); max=100 → y=0; x spans 0..100
    expect(svg).toContain('0.0,20.0');
    expect(svg).toContain('100.0,0.0');
  });
});
