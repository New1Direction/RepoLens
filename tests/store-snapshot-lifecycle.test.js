import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  appendScanSnapshot,
  deleteSnapshots,
  listSnapshots,
  saveScene,
  getScene,
  exportStores,
} from '../store.js';
import { buildBackup, validateBackup } from '../backup.js';
import { importStores } from '../store.js';
import { idbClear } from '../store/idb.js';

const payload = (repoId, extra = {}) => ({
  repoId,
  health: 80,
  stars: 0,
  red_flags: [],
  saved_at: '2026-06-01T00:00:00.000Z',
  ...extra,
});

describe('appendScanSnapshot — demo payloads (HIGH-1a)', () => {
  beforeEach(async () => {
    await idbClear('snapshots');
  });

  it('writes NO snapshot row when the payload is the demo', async () => {
    await appendScanSnapshot({ ...payload('honojs/hono'), __demo__: true }, null);
    expect(await listSnapshots('honojs/hono')).toEqual([]);
  });

  it('still writes a snapshot for a real (non-demo) payload', async () => {
    await appendScanSnapshot(payload('real/repo'), null);
    expect(await listSnapshots('real/repo')).toHaveLength(1);
  });
});

describe('deleteSnapshots (HIGH-1b)', () => {
  beforeEach(async () => {
    await idbClear('snapshots');
  });

  it('removes an existing snapshot history', async () => {
    await appendScanSnapshot(payload('x/y'), null);
    expect(await listSnapshots('x/y')).toHaveLength(1);
    await deleteSnapshots('x/y');
    expect(await listSnapshots('x/y')).toEqual([]);
  });

  it('is a no-op (does not throw) when no history exists', async () => {
    await expect(deleteSnapshots('none/here')).resolves.toBeUndefined();
  });
});

describe('scenes survive a UI-shaped backup round-trip (HIGH-3)', () => {
  beforeEach(async () => {
    await idbClear('scenes');
    await idbClear('repos');
  });

  it('saveScene → exportStores → buildBackup → validateBackup → importStores → getScene', async () => {
    const scene = {
      id: 'repo:rt',
      scope: 'blueprint',
      repoId: 'a/b',
      title: 'rt',
      nodes: [],
      edges: [],
      annotations: [],
      camera: { x: 0, y: 0, zoom: 1 },
      tour: null,
      source: {},
      createdAt: 'x',
      updatedAt: 'x',
    };
    await saveScene(scene);
    const stores = await exportStores();
    const backup = buildBackup({
      repos: stores.repos,
      nodes: stores.nodes,
      edges: stores.edges,
      cache: [],
      collections: stores.collections,
      decisions: stores.decisions,
      snapshots: stores.snapshots,
      scenes: stores.scenes,
    });
    const { value } = validateBackup(backup);
    await idbClear('scenes');
    expect(await getScene('repo:rt')).toBeNull();
    await importStores(value, { mode: 'replace' });
    const got = await getScene('repo:rt');
    expect(got).not.toBeNull();
    expect(got.title).toBe('rt');
  });
});
