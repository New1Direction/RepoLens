import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveRepo,
  upsertNode,
  addEdge,
  hashRepoId,
  exportStores,
  importStores,
  clearLibrary,
  scrollPoints,
  getEgoGraph,
  saveCollection,
  listCollections,
} from '../store.js';
import { idbClear } from '../store/idb.js';

const analysis = (repoId, extra = {}) => ({ repoId, language: 'Rust', category: 'CLI', health: { score: 80 }, ...extra });

describe('store backup — exportStores', () => {
  beforeEach(async () => {
    await idbClear('repos');
    await idbClear('nodes');
    await idbClear('edges');
    await idbClear('collections');
  });

  it('gathers rows from all three stores', async () => {
    await saveRepo(analysis('a/one'));
    await upsertNode(hashRepoId('b/two'), { name: 'two', repoId: 'b/two', analyzed: true });
    await addEdge({ id: 'e1', source: hashRepoId('a/one'), target: hashRepoId('b/two'), label: 'SYNERGIZES_WITH' });
    const dump = await exportStores();
    expect(dump.repos).toHaveLength(1);
    expect(dump.nodes).toHaveLength(1);
    expect(dump.edges).toHaveLength(1);
    expect(dump.repos[0].payload.repoId).toBe('a/one');
    expect(dump.edges[0].label).toBe('SYNERGIZES_WITH');
  });
});

describe('store backup — importStores', () => {
  beforeEach(async () => {
    await idbClear('repos');
    await idbClear('nodes');
    await idbClear('edges');
    await idbClear('collections');
  });

  it('round-trips: export → clear → import restores the library', async () => {
    await saveRepo(analysis('a/one', { eli5: 'hello' }));
    await saveRepo(analysis('b/two'));
    await upsertNode(hashRepoId('b/two'), { name: 'two', repoId: 'b/two', analyzed: true });
    await addEdge({ id: 'e1', source: hashRepoId('a/one'), target: hashRepoId('b/two'), label: 'SYNERGIZES_WITH' });

    const dump = await exportStores();
    await clearLibrary();
    expect(await scrollPoints()).toHaveLength(0);

    const written = await importStores(dump, { mode: 'replace' });
    expect(written).toEqual({ repos: 2, nodes: 1, edges: 1, collections: 0, decisions: 0, snapshots: 2, scenes: 0 });
    const points = await scrollPoints();
    expect(points.map((p) => p.payload.repoId).sort()).toEqual(['a/one', 'b/two']);
    const ego = await getEgoGraph('a/one');
    expect(ego.neighbors).toHaveLength(1); // graph survived the round-trip
  });

  it('round-trips collections through export → clear → import', async () => {
    await saveRepo(analysis('a/one'));
    await saveCollection({ id: 'col1', name: 'My Stack', color: '#818cf8', repoIds: ['a/one'], createdAt: 't0', updatedAt: 't0' });

    const dump = await exportStores();
    expect(dump.collections).toHaveLength(1);

    await clearLibrary();
    expect(await listCollections()).toHaveLength(0);

    const written = await importStores(dump, { mode: 'replace' });
    expect(written.collections).toBe(1);
    const restored = await listCollections();
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ id: 'col1', name: 'My Stack', repoIds: ['a/one'] });
  });

  it('merge mode keeps existing rows and overwrites matching ids', async () => {
    await saveRepo(analysis('a/one', { eli5: 'v1' }));
    const incoming = {
      repos: [
        { id: hashRepoId('a/one'), payload: { repoId: 'a/one', eli5: 'v2' } },
        { id: hashRepoId('c/three'), payload: { repoId: 'c/three' } },
      ],
    };
    const written = await importStores(incoming, { mode: 'merge' });
    expect(written.repos).toBe(2);
    const byId = Object.fromEntries((await scrollPoints()).map((p) => [p.payload.repoId, p.payload]));
    expect(Object.keys(byId).sort()).toEqual(['a/one', 'c/three']);
    expect(byId['a/one'].eli5).toBe('v2'); // overwritten by the import
  });

  it('replace mode wipes rows not present in the backup', async () => {
    await saveRepo(analysis('old/gone'));
    await importStores({ repos: [{ id: hashRepoId('new/one'), payload: { repoId: 'new/one' } }] }, { mode: 'replace' });
    expect((await scrollPoints()).map((p) => p.payload.repoId)).toEqual(['new/one']);
  });

  it('skips malformed rows that have no id', async () => {
    const written = await importStores({ repos: [{ payload: { repoId: 'x' } }, null, { id: 5, payload: { repoId: 'ok/one' } }] });
    expect(written.repos).toBe(1);
  });
});

import { listSnapshots } from '../store.js';
import { idbPut } from '../store/idb.js';
import { SNAPSHOT_CAP } from '../snapshots.js';

it('snapshots survive an export → clear → import round-trip', async () => {
  await saveRepo({ repoId: 'rt/one', health: 70, stars: 0, red_flags: [] });
  await saveRepo({ repoId: 'rt/one', health: 85, stars: 0, red_flags: [] });
  const dump = await exportStores();
  expect(dump.snapshots.length).toBe(1);
  await clearLibrary();
  expect(await listSnapshots('rt/one')).toEqual([]);
  await importStores(dump, { mode: 'replace' });
  const snaps = await listSnapshots('rt/one');
  expect(snaps.map((s) => s.health)).toEqual([70, 85]);
});

// B-1: merge mode must not lose local snapshot history. Importing a backup whose
// snapshot row shares an id with a local row must UNION the snaps by ts (incoming
// wins on tie), sort ascending, and clamp to SNAPSHOT_CAP — never overwrite.
describe('store backup — importStores merge unions snapshot history (B-1)', () => {
  beforeEach(async () => {
    await idbClear('repos');
    await idbClear('snapshots');
  });

  const snap = (ts, health) => ({ ts, health, fit: 'care', stars: 0, flags: [] });

  it('unions local + incoming snaps by ts (no local loss), deduped, clamped to the cap', async () => {
    const id = hashRepoId('m/one');
    // Local row: 4 distinct points.
    await idbPut('snapshots', {
      id, repoId: 'm/one',
      snaps: [snap('2026-01-01T00:00:00.000Z', 50), snap('2026-01-02T00:00:00.000Z', 55), snap('2026-01-03T00:00:00.000Z', 60), snap('2026-01-04T00:00:00.000Z', 65)],
    });
    // Incoming backup: one overlapping ts (different health → incoming wins) + two new points.
    const incoming = {
      snapshots: [{
        id, repoId: 'm/one',
        snaps: [snap('2026-01-03T00:00:00.000Z', 99), snap('2026-01-05T00:00:00.000Z', 70), snap('2026-01-06T00:00:00.000Z', 75)],
      }],
    };
    await importStores(incoming, { mode: 'merge' });
    const snaps = await listSnapshots('m/one');
    // Union of {01,02,03,04} (local) + {03,05,06} (incoming) = 6 distinct ts, sorted ascending.
    expect(snaps.map((s) => s.ts)).toEqual([
      '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', '2026-01-03T00:00:00.000Z',
      '2026-01-04T00:00:00.000Z', '2026-01-05T00:00:00.000Z', '2026-01-06T00:00:00.000Z',
    ]);
    // The local 01-03 point (health 60) loses to the incoming one (health 99) on the dedupe tie.
    expect(snaps.find((s) => s.ts === '2026-01-03T00:00:00.000Z').health).toBe(99);
    // No local data lost.
    expect(snaps.find((s) => s.ts === '2026-01-01T00:00:00.000Z').health).toBe(50);
  });

  it('re-clamps the unioned history to SNAPSHOT_CAP (most recent kept)', async () => {
    const id = hashRepoId('m/cap');
    const day = (i) => `2026-02-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`;
    // Local: cap points (days 1..CAP).
    const local = Array.from({ length: SNAPSHOT_CAP }, (_, i) => snap(day(i), i));
    await idbPut('snapshots', { id, repoId: 'm/cap', snaps: local });
    // Incoming: 5 brand-new newer points.
    const incoming = {
      snapshots: [{ id, repoId: 'm/cap', snaps: Array.from({ length: 5 }, (_, i) => snap(day(SNAPSHOT_CAP + i), 100 + i)) }],
    };
    await importStores(incoming, { mode: 'merge' });
    const snaps = await listSnapshots('m/cap');
    expect(snaps).toHaveLength(SNAPSHOT_CAP);
    // The most recent point is the newest incoming one; the oldest five locals were trimmed.
    expect(snaps[snaps.length - 1].ts).toBe(day(SNAPSHOT_CAP + 4));
    expect(snaps[0].ts).toBe(day(5)); // first five days dropped
  });

  it('merge mode adds a brand-new repo snapshot row untouched', async () => {
    const id = hashRepoId('m/new');
    await importStores({ snapshots: [{ id, repoId: 'm/new', snaps: [snap('2026-03-01T00:00:00.000Z', 80)] }] }, { mode: 'merge' });
    expect((await listSnapshots('m/new')).map((s) => s.health)).toEqual([80]);
  });

  it('replace mode still overwrites a local snapshot row wholesale', async () => {
    const id = hashRepoId('r/one');
    await idbPut('snapshots', { id, repoId: 'r/one', snaps: [snap('2026-01-01T00:00:00.000Z', 50), snap('2026-01-02T00:00:00.000Z', 55)] });
    await importStores({ snapshots: [{ id, repoId: 'r/one', snaps: [snap('2026-04-01T00:00:00.000Z', 90)] }] }, { mode: 'replace' });
    const snaps = await listSnapshots('r/one');
    expect(snaps.map((s) => s.health)).toEqual([90]); // local 50/55 gone, not unioned
  });
});
