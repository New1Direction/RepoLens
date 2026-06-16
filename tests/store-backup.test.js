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
