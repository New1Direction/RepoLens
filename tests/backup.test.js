import { describe, it, expect } from 'vitest';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  buildBackup,
  validateBackup,
  summarizeBackup,
  backupFilename,
} from '../backup.js';

const repos = [
  { id: 1, payload: { repoId: 'a/one', eli5: 'x' } },
  { id: 2, payload: { repoId: 'b/two' } },
];
const nodes = [{ id: '1', payload: { name: 'one' } }];
const edges = [{ id: 'e1', source: '1', target: '2', label: 'SYNERGIZES_WITH', properties: {} }];
const cache = [{ repoId: 'a/one', platform: 'github', eli5: 'x', cachedAt: 5 }];

describe('buildBackup', () => {
  it('wraps the gathered rows in a versioned envelope with honest counts', () => {
    const b = buildBackup({ repos, nodes, edges, cache, exportedAt: '2026-06-12T00:00:00.000Z' });
    expect(b.format).toBe(BACKUP_FORMAT);
    expect(b.version).toBe(BACKUP_VERSION);
    expect(b.exportedAt).toBe('2026-06-12T00:00:00.000Z');
    expect(b.counts).toEqual({
      repos: 2,
      nodes: 1,
      edges: 1,
      cache: 1,
      collections: 0,
      decisions: 0,
      snapshots: 0,
      scenes: 0,
    });
    expect(b.repos).toEqual(repos);
  });
  it('tolerates missing sections (empty library export)', () => {
    const b = buildBackup();
    expect(b.counts).toEqual({
      repos: 0,
      nodes: 0,
      edges: 0,
      cache: 0,
      collections: 0,
      decisions: 0,
      snapshots: 0,
      scenes: 0,
    });
    expect(b.repos).toEqual([]);
    expect(typeof b.exportedAt).toBe('string');
  });
  it('round-trips through JSON', () => {
    const b = buildBackup({ repos, nodes, edges, cache, exportedAt: '2026-06-12T00:00:00.000Z' });
    const parsed = JSON.parse(JSON.stringify(b));
    expect(validateBackup(parsed).ok).toBe(true);
    expect(validateBackup(parsed).value.repos).toEqual(repos);
  });
});

describe('validateBackup', () => {
  it('accepts a well-formed backup', () => {
    const res = validateBackup(buildBackup({ repos, nodes, edges, cache }));
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
    expect(res.value.repos).toHaveLength(2);
  });
  it('rejects non-objects and the wrong format', () => {
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup('nope').ok).toBe(false);
    expect(validateBackup([]).ok).toBe(false);
    const wrong = validateBackup({ format: 'something-else', version: 1 });
    expect(wrong.ok).toBe(false);
    expect(wrong.errors.join(' ')).toMatch(/expected a "repolens-backup"/);
  });
  it('rejects a newer-than-supported version with a helpful message', () => {
    const res = validateBackup({ format: BACKUP_FORMAT, version: BACKUP_VERSION + 1, repos: [] });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/newer RepoLens/);
  });
  it('drops malformed rows but keeps the good ones (partial-corruption tolerance)', () => {
    const dirty = {
      format: BACKUP_FORMAT,
      version: 1,
      repos: [{ id: 1, payload: { repoId: 'ok/one' } }, { id: 2, payload: {} }, { nope: true }, null],
      nodes: [
        { id: '1', payload: {} },
        { id: null, payload: {} },
      ],
      edges: [{ id: 'e', source: 's', target: 't', label: 'X' }, { id: 'bad' }],
      cache: [{ repoId: 'ok/one', platform: 'github' }, { repoId: 'no-platform' }],
    };
    const { ok, value } = validateBackup(dirty);
    expect(ok).toBe(true);
    expect(value.repos).toHaveLength(1);
    expect(value.repos[0].payload.repoId).toBe('ok/one');
    expect(value.nodes).toHaveLength(1);
    expect(value.edges).toHaveLength(1);
    expect(value.cache).toHaveLength(1);
  });
  it('always returns a safe normalized value even on failure', () => {
    const { value } = validateBackup(undefined);
    expect(value).toEqual({
      repos: [],
      nodes: [],
      edges: [],
      cache: [],
      collections: [],
      decisions: [],
      snapshots: [],
      scenes: [],
    });
  });
  it('clamps oversized sections and warns instead of importing unbounded rows', () => {
    const repos = Array.from({ length: 5001 }, (_, i) => ({ id: i + 1, payload: { repoId: `o/r${i}` } }));
    const { value, warnings } = validateBackup({ format: BACKUP_FORMAT, version: 1, repos });
    expect(value.repos).toHaveLength(5000);
    expect(warnings.join(' ')).toMatch(/5001 repos/);
  });
});

describe('collections in the envelope', () => {
  const collections = [
    { id: 'c1', payload: { id: 'c1', name: 'My Stack', color: '#818cf8', repoIds: ['a/one'] } },
  ];
  it('round-trips collections through build → validate', () => {
    const b = buildBackup({ repos, collections, exportedAt: '2026-06-12T00:00:00.000Z' });
    expect(b.counts.collections).toBe(1);
    const { ok, value } = validateBackup(JSON.parse(JSON.stringify(b)));
    expect(ok).toBe(true);
    expect(value.collections).toHaveLength(1);
    expect(value.collections[0].payload.name).toBe('My Stack');
  });
  it('drops malformed collection rows but keeps valid ones', () => {
    const dirty = {
      format: BACKUP_FORMAT,
      version: 1,
      collections: [
        { id: 'ok', payload: { name: 'A' } },
        { id: 'bad' },
        { payload: { name: 'no-id' } },
        null,
      ],
    };
    expect(validateBackup(dirty).value.collections).toHaveLength(1);
  });
  it('treats an old backup with no collections key as zero collections (backward-compatible)', () => {
    const old = { format: BACKUP_FORMAT, version: 1, repos: [{ id: 1, payload: { repoId: 'a/b' } }] };
    expect(validateBackup(old).value.collections).toEqual([]);
  });
});

describe('summarizeBackup', () => {
  it('counts importable rows from the actual data, not the self-reported counts', () => {
    const lying = {
      format: BACKUP_FORMAT,
      version: 1,
      counts: { repos: 999 },
      repos: [{ id: 1, payload: { repoId: 'a/b' } }],
    };
    expect(summarizeBackup(lying)).toEqual({
      repos: 1,
      nodes: 0,
      edges: 0,
      cache: 0,
      collections: 0,
      decisions: 0,
      snapshots: 0,
      scenes: 0,
    });
  });
});

describe('backupFilename', () => {
  it('is dated and filesystem-safe', () => {
    expect(backupFilename('2026-06-12T09:30:00.000Z')).toBe('repolens-backup-2026-06-12.json');
  });
});

describe('backup: snapshots', () => {
  const snapRow = {
    id: 1,
    repoId: 'a/b',
    snaps: [{ ts: '2026-06-01T00:00:00.000Z', health: 80, fit: 'solid', stars: 1, flags: [] }],
  };

  it('clamps an imported snapshots row to the 30 most-recent entries', () => {
    const big = {
      id: 9,
      repoId: 'big/repo',
      snaps: Array.from({ length: 50 }, (_, i) => ({
        ts: `2026-06-01T00:00:${String(i).padStart(2, '0')}.000Z`,
        health: i,
        fit: 'solid',
        stars: 0,
        flags: [],
      })),
    };
    const { value } = validateBackup({
      format: 'repolens-backup',
      version: BACKUP_VERSION,
      snapshots: [big],
    });
    expect(value.snapshots[0].snaps).toHaveLength(30);
    expect(value.snapshots[0].snaps[0].health).toBe(20); // oldest 20 dropped, keeps the most recent 30 (20..49)
    expect(value.snapshots[0].snaps[29].health).toBe(49);
  });

  it('buildBackup includes snapshots and counts them', () => {
    const b = buildBackup({ snapshots: [snapRow], exportedAt: '2026-06-15T00:00:00.000Z' });
    expect(b.version).toBe(BACKUP_VERSION);
    expect(b.snapshots).toHaveLength(1);
    expect(b.counts.snapshots).toBe(1);
  });

  it('validateBackup keeps well-formed snapshot rows and drops malformed ones', () => {
    const { value } = validateBackup({
      format: 'repolens-backup',
      version: BACKUP_VERSION,
      snapshots: [snapRow, { id: 2 }, { repoId: 'x', snaps: [] }],
    });
    expect(value.snapshots).toHaveLength(1);
    expect(value.snapshots[0].repoId).toBe('a/b');
  });
});
