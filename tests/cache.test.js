import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cacheKey, cacheAnalysis, getCached, listCached, removeCached } from '../cache.js';

let store;
beforeEach(() => {
  store = {};
  global.chrome = {
    storage: {
      local: {
        get: vi.fn(async (k) => {
          if (k === null) return { ...store };
          if (typeof k === 'string') return { [k]: store[k] };
          return {};
        }),
        set: vi.fn(async (obj) => {
          Object.assign(store, obj);
        }),
        remove: vi.fn(async (k) => {
          delete store[k];
        }),
      },
    },
  };
});

describe('cacheKey', () => {
  it('namespaces by platform + repo', () => {
    expect(cacheKey('github', 'facebook/react')).toBe('rlcache:github:facebook/react');
  });
});

describe('cacheAnalysis / getCached', () => {
  it('stores a trimmed analysis (no README or lens results) and round-trips', async () => {
    await cacheAnalysis('github', 'facebook/react', {
      eli5: 'x',
      readme: 'HUGE'.repeat(1000),
      deepDive: { status: 'done' },
      sktpg: { status: 'done' },
      loading: true,
      status: 'thinking',
    });
    const got = await getCached('github', 'facebook/react');
    expect(got.eli5).toBe('x');
    expect(got.readme).toBeUndefined(); // README stripped
    expect(got.deepDive).toBeUndefined(); // lens results stripped
    expect(got.sktpg).toBeUndefined();
    expect(got.loading).toBeUndefined(); // transient stripped
    expect(got.platform).toBe('github');
    expect(got.repoId).toBe('facebook/react');
    expect(typeof got.cachedAt).toBe('number');
  });
  it('returns null when absent', async () => {
    expect(await getCached('npm', 'nope')).toBeNull();
  });
});

describe('listCached', () => {
  it('lists only cache entries, newest first', async () => {
    store['unrelated'] = { foo: 1 };
    await cacheAnalysis('npm', 'a', { eli5: '1' });
    await cacheAnalysis('npm', 'b', { eli5: '2' });
    store['rlcache:npm:a'].cachedAt = 100;
    store['rlcache:npm:b'].cachedAt = 200;
    const list = await listCached();
    expect(list.map((x) => x.repoId)).toEqual(['b', 'a']); // newest first
    expect(list.some((x) => x.foo)).toBe(false); // unrelated key excluded
  });
});

describe('removeCached', () => {
  it('deletes a cache entry', async () => {
    await cacheAnalysis('pypi', 'x', { eli5: '1' });
    await removeCached('pypi', 'x');
    expect(await getCached('pypi', 'x')).toBeNull();
  });
});
