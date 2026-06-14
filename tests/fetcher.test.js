import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchRepoData } from '../fetcher.js';

beforeEach(() => { vi.restoreAllMocks(); });

describe('fetchRepoData — github', () => {
  it('returns structured data from GitHub API', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ full_name: 'facebook/react', description: 'The library for web and native UIs', stargazers_count: 230000, language: 'JavaScript', license: { spdx_id: 'MIT' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: btoa('# React\nA UI library.'), encoding: 'base64' }) })
      .mockResolvedValueOnce({ ok: false });
    const result = await fetchRepoData('github', 'facebook/react');
    expect(result.repoId).toBe('facebook/react');
    expect(result.platform).toBe('github');
    expect(result.stars).toBe(230000);
    expect(result.language).toBe('JavaScript');
    expect(result.license).toBe('MIT');
    expect(result.readme).toContain('React');
  });

  it('returns empty readme when README fetch fails', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ full_name: 'x/y', description: '', stargazers_count: 0, language: null, license: null }) })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false });
    const result = await fetchRepoData('github', 'x/y');
    expect(result.readme).toBe('');
  });
});

describe('fetchRepoData — npm', () => {
  it('returns structured data from npm registry', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'lodash', description: 'Lodash modular utilities.', 'dist-tags': { latest: '4.17.21' }, versions: { '4.17.21': { license: 'MIT' } }, readme: '# Lodash\nA utility library.' }) });
    const result = await fetchRepoData('npm', 'lodash');
    expect(result.repoId).toBe('lodash');
    expect(result.platform).toBe('npm');
    expect(result.readme).toContain('Lodash');
  });

  it('extracts real dependencies from the latest version', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'react-dom', 'dist-tags': { latest: '18.2.0' }, versions: { '18.2.0': { license: 'MIT', dependencies: { scheduler: '^0.23.0', 'loose-envify': '^1.1.0' } } }, readme: 'x' }) });
    const result = await fetchRepoData('npm', 'react-dom');
    expect(result.dependencies).toEqual([{ name: 'scheduler', version: '^0.23.0' }, { name: 'loose-envify', version: '^1.1.0' }]);
    expect(result.languages).toEqual([{ name: 'JavaScript', pct: 100 }]);
  });
});

describe('fetchRepoData — github languages', () => {
  it('builds a language composition from the languages endpoint', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ full_name: 'facebook/react', description: '', stargazers_count: 1, language: 'JavaScript', license: { spdx_id: 'MIT' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: btoa('# x'), encoding: 'base64' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ JavaScript: 800, TypeScript: 200 }) });
    const result = await fetchRepoData('github', 'facebook/react');
    expect(result.languages).toEqual([{ name: 'JavaScript', pct: 80 }, { name: 'TypeScript', pct: 20 }]);
    expect(result.dependencies).toEqual([]);
  });
});
