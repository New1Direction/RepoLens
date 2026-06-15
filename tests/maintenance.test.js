import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { bandFromSignals, daysSincePush, ciSignals, buildMaintenancePrompt, parseMaintenance, MAINT_BANDS, BUS_FACTORS } from '../maintenance.js';

const NOW = new Date('2026-06-13T00:00:00Z').getTime();
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

// bandFromSignals/daysSincePush read the real Date.now(); pin it to NOW so the
// day-based assertions stay deterministic regardless of when the suite runs.
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-13T00:00:00Z')); });
afterAll(() => { vi.useRealTimers(); });

const signals = {
  pushedAt: daysAgo(45),
  archived: false,
  openIssues: 12,
  forks: 80,
  watchers: 200,
  topContributors: [
    { login: 'alice', contributions: 900 },
    { login: 'bob', contributions: 100 },
  ],
};

describe('bandFromSignals', () => {
  it('returns active for recent push', () => {
    expect(bandFromSignals({ ...signals, pushedAt: daysAgo(10), archived: false })).toBe('active');
  });
  it('returns slowing for 120-day-old push', () => {
    expect(bandFromSignals({ ...signals, pushedAt: daysAgo(120), archived: false })).toBe('slowing');
  });
  it('returns stale for 200-day-old push', () => {
    expect(bandFromSignals({ ...signals, pushedAt: daysAgo(200), archived: false })).toBe('stale');
  });
  it('returns abandoned for > 365 days', () => {
    expect(bandFromSignals({ ...signals, pushedAt: daysAgo(400), archived: false })).toBe('abandoned');
  });
  it('returns abandoned when archived regardless of push date', () => {
    expect(bandFromSignals({ ...signals, pushedAt: daysAgo(5), archived: true })).toBe('abandoned');
  });
  it('returns unknown when signals is null', () => {
    expect(bandFromSignals(null)).toBe('unknown');
  });
  it('returns unknown when pushedAt is missing', () => {
    expect(bandFromSignals({ archived: false })).toBe('unknown');
  });
});

describe('daysSincePush', () => {
  it('returns null for null input', () => {
    expect(daysSincePush(null)).toBeNull();
  });
  it('returns a non-negative integer for a valid date', () => {
    const d = daysSincePush(daysAgo(30));
    expect(d).toBeGreaterThanOrEqual(29);
    expect(d).toBeLessThanOrEqual(31);
  });
});

describe('ciSignals', () => {
  it('detects GitHub Actions', () => {
    const result = ciSignals(['.github/workflows/ci.yml', 'src/index.ts']);
    expect(result).toContain('✓ GitHub Actions');
  });
  it('marks missing CI as ✗', () => {
    const result = ciSignals(['src/index.ts', 'README.md']);
    expect(result).toContain('✗ GitHub Actions');
  });
  it('detects test files', () => {
    const result = ciSignals(['tests/foo.test.js']);
    expect(result).toContain('✓ Test files');
  });
  it('returns unavailable message for empty tree', () => {
    expect(ciSignals([])).toContain('No file tree available');
  });
  it('returns unavailable message for null tree', () => {
    expect(ciSignals(null)).toContain('No file tree available');
  });
});

describe('buildMaintenancePrompt', () => {
  const repoData = { repoId: 'owner/repo', description: 'A test repo.', stars: 1000, language: 'TypeScript', license: 'MIT' };
  const tree = ['.github/workflows/ci.yml', 'tests/foo.test.ts'];

  it('includes the repo id', () => {
    const p = buildMaintenancePrompt(repoData, signals, tree, NOW);
    expect(p).toContain('owner/repo');
  });
  it('includes days since push', () => {
    const p = buildMaintenancePrompt(repoData, signals, tree, NOW);
    expect(p).toContain('days ago');
  });
  it('includes contributor data', () => {
    const p = buildMaintenancePrompt(repoData, signals, tree, NOW);
    expect(p).toContain('alice');
  });
  it('includes CI signal', () => {
    const p = buildMaintenancePrompt(repoData, signals, tree, NOW);
    expect(p).toContain('GitHub Actions');
  });
  it('includes archived status', () => {
    const p = buildMaintenancePrompt(repoData, { ...signals, archived: true }, tree, NOW);
    expect(p).toContain('Archived: true');
  });
  it('handles null signals gracefully', () => {
    const p = buildMaintenancePrompt(repoData, null, tree, NOW);
    expect(p).toContain('unavailable');
  });
});

describe('parseMaintenance', () => {
  it('parses a valid response', () => {
    const json = JSON.stringify({ band: 'active', bus_factor: 'concentrated', days_since_push: 45, summary: 'Healthy.', watch_list: ['Solo maintainer'] });
    const result = parseMaintenance(json, signals);
    expect(result.band).toBe('active');
    expect(result.bus_factor).toBe('concentrated');
    expect(result.days_since_push).toBe(45);
    expect(result.summary).toBe('Healthy.');
    expect(result.watch_list).toContain('Solo maintainer');
  });

  it('falls back to deterministic band on bad JSON', () => {
    const result = parseMaintenance('not json', { ...signals, pushedAt: daysAgo(10), archived: false });
    expect(result.band).toBe('active');
    expect(result.summary).toContain('Could not parse');
  });

  it('falls back band when AI band is invalid', () => {
    const json = JSON.stringify({ band: 'bogus', bus_factor: 'safe', days_since_push: 5, summary: 'x', watch_list: [] });
    const result = parseMaintenance(json, { ...signals, pushedAt: daysAgo(5), archived: false });
    expect(MAINT_BANDS).toContain(result.band);
  });

  it('falls back bus_factor when AI value is invalid', () => {
    const json = JSON.stringify({ band: 'active', bus_factor: 'bogus', days_since_push: 5, summary: 'x', watch_list: [] });
    const result = parseMaintenance(json, signals);
    expect(result.bus_factor).toBe('unknown');
  });

  it('clamps negative days_since_push to null', () => {
    const json = JSON.stringify({ band: 'active', bus_factor: 'safe', days_since_push: -5, summary: 'x', watch_list: [] });
    const result = parseMaintenance(json, signals);
    expect(result.days_since_push).not.toBe(-5);
  });

  it('exports contain only known band values', () => {
    expect(MAINT_BANDS).toContain('active');
    expect(MAINT_BANDS).toContain('abandoned');
    expect(BUS_FACTORS).toContain('safe');
    expect(BUS_FACTORS).toContain('solo');
  });
});
