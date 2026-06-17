import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { setMastery, getMastery, getAllMastery } from '../store.js';

describe('mastery persistence', () => {
  it('round-trips a record by repoId', async () => {
    const rec = { level: 'understood', lastCheckedAt: '2026-06-16T00:00:00.000Z', lastResult: { gotIt: 2, shaky: 1, missed: 0, total: 3 } };
    await setMastery('honojs/hono', rec);
    expect(await getMastery('honojs/hono')).toEqual(rec);
  });

  it('returns null for an unknown repo', async () => {
    expect(await getMastery('nope/none')).toBeNull();
  });

  it('getAllMastery returns a repoId→record map', async () => {
    await setMastery('a/b', { level: 'explored' });
    await setMastery('c/d', { level: 'understood' });
    const map = await getAllMastery();
    expect(map['a/b'].level).toBe('explored');
    expect(map['c/d'].level).toBe('understood');
  });
});
