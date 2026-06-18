import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cacheAnalysis, getCached, importCache, clearCache } from '../cache.js';

let store;
beforeEach(() => {
  store = {};
  global.chrome = {
    storage: {
      local: {
        get: vi.fn(async (k) => {
          if (k === null) return { ...store };
          if (typeof k === 'string') return { [k]: store[k] };
          if (Array.isArray(k)) return Object.fromEntries(k.map((key) => [key, store[key]]));
          return {};
        }),
        set: vi.fn(async (obj) => {
          Object.assign(store, obj);
        }),
        remove: vi.fn(async (k) => {
          for (const key of Array.isArray(k) ? k : [k]) delete store[key];
        }),
      },
    },
  };
});

describe('cache backup — importCache', () => {
  it('imports entries keyed by platform:repo', async () => {
    const n = await importCache([
      { platform: 'github', repoId: 'a/one', eli5: 'x' },
      { platform: 'npm', repoId: 'b', eli5: 'y' },
    ]);
    expect(n).toBe(2);
    expect((await getCached('github', 'a/one')).eli5).toBe('x');
    expect((await getCached('npm', 'b')).eli5).toBe('y');
  });

  it('skips entries missing platform or repoId', async () => {
    const n = await importCache([{ repoId: 'no-platform' }, { platform: 'github', repoId: 'ok/one' }, null]);
    expect(n).toBe(1);
  });

  it('drops entries for unknown platforms (no cache-key injection)', async () => {
    const n = await importCache([
      { platform: 'github:evil', repoId: 'x' },
      { platform: 'github', repoId: 'ok/one' },
    ]);
    expect(n).toBe(1);
    expect(await getCached('github', 'ok/one')).not.toBeNull();
  });

  it('replace mode clears existing cache first', async () => {
    await cacheAnalysis('github', 'old/one', { eli5: 'old' });
    await importCache([{ platform: 'github', repoId: 'new/one', eli5: 'new' }], { mode: 'replace' });
    expect(await getCached('github', 'old/one')).toBeNull();
    expect((await getCached('github', 'new/one')).eli5).toBe('new');
  });

  it('merge mode (default) preserves existing entries', async () => {
    await cacheAnalysis('github', 'keep/one', { eli5: 'keep' });
    await importCache([{ platform: 'github', repoId: 'add/two', eli5: 'add' }]);
    expect((await getCached('github', 'keep/one')).eli5).toBe('keep');
    expect((await getCached('github', 'add/two')).eli5).toBe('add');
  });
});

describe('cache backup — clearCache', () => {
  it('removes only rlcache:* keys, leaving settings intact', async () => {
    store['theme'] = 'midnight';
    store['anthropicKey'] = 'sk-secret';
    await cacheAnalysis('github', 'a/one', { eli5: 'x' });
    const cleared = await clearCache();
    expect(cleared).toBe(1);
    expect(store['theme']).toBe('midnight');
    expect(store['anthropicKey']).toBe('sk-secret');
    expect(await getCached('github', 'a/one')).toBeNull();
  });
});
