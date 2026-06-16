import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  hashRepoId,
  saveRepo,
  saveAnalysis,
  scrollPoints,
  scrollLibrary,
  findSimilar,
  searchLibrary,
  upsertNode,
  addEdge,
  getEgoGraph,
} from '../store.js';
import { idbClear } from '../store/idb.js';

const analysis = (repoId, extra = {}) => ({
  repoId,
  language: 'Rust',
  category: 'CLI',
  health: { score: 88 },
  red_flags: [{ severity: 'warning' }],
  pros: ['fast'],
  cons: ['niche'],
  eli5: 'a tiny tool',
  ...extra,
});

describe('store — repos', () => {
  beforeEach(async () => {
    await idbClear('repos');
    await idbClear('nodes');
    await idbClear('edges');
  });

  it('saveRepo → scrollPoints round-trips the payload incl. triage fields', async () => {
    await saveRepo(analysis('a/cli'));
    const points = await scrollPoints();
    expect(points).toHaveLength(1);
    expect(points[0].id).toBe(hashRepoId('a/cli'));
    expect(points[0].payload).toMatchObject({
      repoId: 'a/cli',
      health: { score: 88 },
      pros: ['fast'],
      cons: ['niche'],
    });
    expect(points[0].payload.saved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('saveAnalysis re-saving the same repo overwrites (no duplicate)', async () => {
    await saveAnalysis(analysis('a/cli', { eli5: 'v1' }));
    await saveAnalysis(analysis('a/cli', { eli5: 'v2' }));
    const points = await scrollPoints();
    expect(points).toHaveLength(1);
    expect(points[0].payload.eli5).toBe('v2');
  });

  it('scrollLibrary returns trimmed, capability-tagged rows', async () => {
    await saveRepo(analysis('a/cli', { capabilities: ['cli'] }));
    const rows = await scrollLibrary();
    expect(rows[0]).toMatchObject({ repoId: 'a/cli', name: 'cli', capabilities: ['cli'] });
  });

  it('findSimilar ranks by overlap and excludes self', async () => {
    await saveRepo(analysis('a/rust-cli', { language: 'Rust', category: 'CLI' }));
    await saveRepo(analysis('b/rust-web', { language: 'Rust', category: 'web' }));
    await saveRepo(analysis('me/here', { language: 'Rust', category: 'CLI' }));
    const sim = await findSimilar({ language: 'Rust', category: 'CLI', repoId: 'me/here' });
    expect(sim.map((s) => s.repoId)).not.toContain('me/here');
    expect(sim[0].repoId).toBe('a/rust-cli');
  });

  it('searchLibrary returns ranked rows with category/language', async () => {
    await saveRepo(analysis('a/cli', { language: 'Rust', category: 'CLI' }));
    const out = await searchLibrary({ query: 'Rust CLI', excludeRepoId: 'x/y' });
    expect(out[0]).toMatchObject({ repoId: 'a/cli', language: 'Rust', category: 'CLI' });
  });
});

describe('store — graph', () => {
  beforeEach(async () => {
    await idbClear('nodes');
    await idbClear('edges');
  });

  it('addEdge + upsertNode → getEgoGraph surfaces the neighbor', async () => {
    const center = hashRepoId('a/center');
    const neighbor = hashRepoId('b/neighbor');
    await upsertNode(neighbor, { name: 'neighbor', repoId: 'b/neighbor', analyzed: true });
    await addEdge({ id: 'e1', source: center, target: neighbor, label: 'similar' });

    const ego = await getEgoGraph('a/center');
    expect(ego.center.repoId).toBe('a/center');
    expect(ego.edges).toHaveLength(1);
    expect(ego.neighbors).toHaveLength(1);
    expect(ego.neighbors[0]).toMatchObject({ repoId: 'b/neighbor', name: 'neighbor', analyzed: true });
  });

  it('addEdge is idempotent by id', async () => {
    const center = hashRepoId('a/center');
    const neighbor = hashRepoId('b/neighbor');
    await addEdge({ id: 'e1', source: center, target: neighbor, label: 'similar' });
    await addEdge({ id: 'e1', source: center, target: neighbor, label: 'similar' });
    const ego = await getEgoGraph('a/center');
    expect(ego.edges).toHaveLength(1);
  });

  it('getEgoGraph with no edges returns an empty ego graph', async () => {
    const ego = await getEgoGraph('lonely/repo');
    expect(ego.neighbors).toEqual([]);
    expect(ego.edges).toEqual([]);
  });
});

import { appendScanSnapshot, listSnapshots, listAllSnapshots } from '../store.js';

describe('scan ledger', () => {
  beforeEach(async () => {
    await idbClear('snapshots');
    await idbClear('repos');
  });

  it('saveRepo records a snapshot and re-scan appends a second point', async () => {
    await saveRepo({ repoId: 'led/one', health: 70, stars: 10, red_flags: [] });
    await saveRepo({ repoId: 'led/one', health: 90, stars: 20, red_flags: [] });
    const snaps = await listSnapshots('led/one');
    expect(snaps.length).toBe(2);
    expect(snaps[0].health).toBe(70);
    expect(snaps[1].health).toBe(90);
  });

  it('caps history at 30 (ring buffer)', async () => {
    for (let i = 0; i < 35; i++) {
      await appendScanSnapshot({ repoId: 'led/cap', health: i, stars: 0, red_flags: [], saved_at: `2026-06-01T00:00:${String(i).padStart(2, '0')}.000Z` });
    }
    const snaps = await listSnapshots('led/cap');
    expect(snaps.length).toBe(30);
    expect(snaps[snaps.length - 1].health).toBe(34);
  });

  it('seeds the prior scan into the ledger on first re-scan of an existing repo', async () => {
    // A repo scanned before the ledger existed has a repos payload but no snapshots.
    // appendScanSnapshot must record that prior state (prevPayload) before the new one.
    const prev = { repoId: 'led/seed', health: 40, stars: 1, red_flags: [], saved_at: '2026-05-01T00:00:00.000Z' };
    const next = { repoId: 'led/seed', health: 80, stars: 2, red_flags: [], saved_at: '2026-06-01T00:00:00.000Z' };
    await appendScanSnapshot(next, prev);
    const snaps = await listSnapshots('led/seed');
    expect(snaps.map((s) => s.health)).toEqual([40, 80]);
  });

  it('listAllSnapshots returns a Map keyed by repoId', async () => {
    await saveRepo({ repoId: 'led/map', health: 60, stars: 0, red_flags: [] });
    const map = await listAllSnapshots();
    expect(map.has('led/map')).toBe(true);
    expect(Array.isArray(map.get('led/map'))).toBe(true);
  });
});
