import { describe, it, expect } from 'vitest';
import { daysSince, diffAnalyses } from '../diff-analysis.js';

const NOW = new Date('2026-06-13T00:00:00Z').getTime();
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString();

const base = {
  repoId: 'owner/repo',
  stars: 1000,
  health: { score: 80 },
  red_flags: [{ title: 'No tests', severity: 'warn' }],
  version: '1.0.0',
  cachedAt: daysAgo(30),
};

describe('daysSince', () => {
  it('returns null for null input', () => {
    expect(daysSince(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(daysSince(undefined)).toBeNull();
  });

  it('returns a non-negative integer for a past date', () => {
    const result = daysSince(daysAgo(5));
    expect(result).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('returns 0 for a very recent timestamp', () => {
    const justNow = new Date(Date.now() - 1000).toISOString();
    expect(daysSince(justNow)).toBe(0);
  });
});

describe('diffAnalyses', () => {
  it('returns null when prev is null', () => {
    expect(diffAnalyses(null, base)).toBeNull();
  });

  it('returns null when next is null', () => {
    expect(diffAnalyses(base, null)).toBeNull();
  });

  it('returns null when both are null', () => {
    expect(diffAnalyses(null, null)).toBeNull();
  });

  it('star_delta reflects star growth', () => {
    const prev = { ...base, stars: 1000 };
    const next = { ...base, stars: 1500 };
    const diff = diffAnalyses(prev, next);
    expect(diff.star_delta.delta).toBe(500);
    expect(diff.star_delta.direction).toBe('up');
  });

  it('star_delta reflects star decline', () => {
    const prev = { ...base, stars: 1500 };
    const next = { ...base, stars: 1000 };
    const diff = diffAnalyses(prev, next);
    expect(diff.star_delta.delta).toBe(-500);
    expect(diff.star_delta.direction).toBe('down');
  });

  it('star_delta is same when stars unchanged', () => {
    const diff = diffAnalyses(base, { ...base });
    expect(diff.star_delta.direction).toBe('same');
  });

  it('health_delta reflects score change', () => {
    const prev = { ...base, health: { score: 60 } };
    const next = { ...base, health: { score: 90 } };
    const diff = diffAnalyses(prev, next);
    expect(diff.health_delta.delta).toBe(30);
    expect(diff.health_delta.direction).toBe('up');
  });

  it('detects new red flags', () => {
    const prev = { ...base, red_flags: [] };
    const next = { ...base, red_flags: [{ title: 'No tests', severity: 'warn' }] };
    const diff = diffAnalyses(prev, next);
    expect(diff.new_flags).toContain('No tests');
  });

  it('detects removed red flags', () => {
    const prev = { ...base, red_flags: [{ title: 'No tests', severity: 'warn' }] };
    const next = { ...base, red_flags: [] };
    const diff = diffAnalyses(prev, next);
    expect(diff.removed_flags).toContain('No tests');
  });

  it('fit_delta marks changed when fit level changes', () => {
    const prev = { ...base, health: { score: 90 }, red_flags: [] }; // strong
    const next = {
      ...base,
      health: { score: 55 },
      red_flags: [
        { title: 'x', severity: 'warn' },
        { title: 'y', severity: 'warn' },
      ],
    }; // care
    const diff = diffAnalyses(prev, next);
    expect(diff.fit_delta.changed).toBe(true);
    expect(diff.fit_delta.before).toBe('strong');
    expect(diff.fit_delta.after).toBe('care');
    expect(diff.fit_delta.direction).toBe('down');
  });

  it('fit_delta direction up when fit improves', () => {
    const prev = { ...base, health: { score: 55 }, red_flags: [{ title: 'x', severity: 'warn' }] }; // care
    const next = { ...base, health: { score: 90 }, red_flags: [] }; // strong
    const diff = diffAnalyses(prev, next);
    expect(diff.fit_delta.direction).toBe('up');
  });

  it('fit_delta not changed when fit is same', () => {
    const prev = { ...base, health: { score: 80 }, red_flags: [{ title: 'x', severity: 'warn' }] };
    const next = { ...base, health: { score: 75 }, red_flags: [{ title: 'y', severity: 'warn' }] };
    const diff = diffAnalyses(prev, next);
    expect(diff.fit_delta.changed).toBe(false);
    expect(diff.fit_delta.direction).toBe('same');
  });

  it('version_delta detects version bump', () => {
    const prev = { ...base, version: '1.0.0' };
    const next = { ...base, version: '2.0.0' };
    const diff = diffAnalyses(prev, next);
    expect(diff.version_delta?.changed).toBe(true);
    expect(diff.version_delta.before).toBe('1.0.0');
    expect(diff.version_delta.after).toBe('2.0.0');
  });

  it('version_delta is null when both versions are absent', () => {
    const prev = { ...base, version: undefined };
    const next = { ...base, version: undefined };
    const diff = diffAnalyses(prev, next);
    expect(diff.version_delta).toBeNull();
  });

  it('includes days_since_prev from cachedAt', () => {
    const diff = diffAnalyses(base, { ...base });
    expect(diff.days_since_prev).toBeGreaterThanOrEqual(0);
  });

  it('handles missing health gracefully', () => {
    const prev = { ...base, health: undefined };
    const next = { ...base, health: undefined };
    const diff = diffAnalyses(prev, next);
    expect(diff.health_delta.before).toBe(0);
    expect(diff.health_delta.after).toBe(0);
  });
});
