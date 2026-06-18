import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeRunnerUrl, scanRepo, pingRunner, DEFAULT_RUNNER_URL } from '../runner.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('normalizeRunnerUrl', () => {
  it('defaults, trims, strips trailing slash', () => {
    expect(normalizeRunnerUrl('')).toBe(DEFAULT_RUNNER_URL);
    expect(normalizeRunnerUrl(undefined)).toBe(DEFAULT_RUNNER_URL);
    expect(normalizeRunnerUrl('http://localhost:9191/')).toBe('http://localhost:9191');
  });
});

describe('scanRepo', () => {
  it('returns null without any network call for unsupported platforms or bare ids', async () => {
    global.fetch = vi.fn();
    expect(await scanRepo('', 'npm', 'react')).toBeNull();
    expect(await scanRepo('', 'pypi', 'flask')).toBeNull();
    expect(await scanRepo('', 'github', 'noslash')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('POSTs then polls to done and returns the facts', async () => {
    global.fetch = vi.fn((url, opts) => {
      if (opts && opts.method === 'POST')
        return Promise.resolve({ ok: true, json: async () => ({ jobId: 'j1' }) });
      return Promise.resolve({ ok: true, json: async () => ({ status: 'done', facts: { fileCount: 3 } }) });
    });
    const facts = await scanRepo('http://localhost:9191', 'github', 'facebook/react');
    expect(facts).toEqual({ fileCount: 3 });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:9191/scan',
      expect.objectContaining({ method: 'POST' })
    );
  });
  it('returns null on an error status and on a failed POST', async () => {
    global.fetch = vi.fn((url, opts) =>
      opts && opts.method === 'POST'
        ? Promise.resolve({ ok: true, json: async () => ({ jobId: 'j1' }) })
        : Promise.resolve({ ok: true, json: async () => ({ status: 'error', error: 'boom' }) })
    );
    expect(await scanRepo('http://localhost:9191', 'github', 'o/r')).toBeNull();

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    expect(await scanRepo('http://localhost:9191', 'github', 'o/r')).toBeNull();
  });
  it('returns null when the runner is unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('refused'));
    expect(await scanRepo('http://localhost:9191', 'github', 'o/r')).toBeNull();
  });
});

describe('pingRunner', () => {
  it('reports ok + docker from a healthy /health', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', docker: true, version: '0.1.0' }) });
    expect(await pingRunner('http://localhost:9191')).toEqual({ ok: true, docker: true, version: '0.1.0' });
    expect(fetch).toHaveBeenCalledWith('http://localhost:9191/health');
  });
  it('reports not-ok on a non-2xx and on a rejected fetch', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    expect(await pingRunner('http://localhost:9191')).toEqual({ ok: false });
    global.fetch = vi.fn().mockRejectedValue(new Error('refused'));
    expect(await pingRunner('http://localhost:9191')).toEqual({ ok: false });
  });
});
