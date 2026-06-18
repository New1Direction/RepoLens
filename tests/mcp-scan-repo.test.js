import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildScanResult, runScanRepo } from '../mcp/scan-repo.js';

describe('buildScanResult', () => {
  const repoData = { repoId: 'a/b', language: 'JS', license: 'MIT', stars: 5, description: 'x' };

  it('derives fit — the field parseClaudeResponse never produces', () => {
    const analysis = {
      health: { score: 90 },
      red_flags: [],
      pros: ['p1', 'p2'],
      cons: [],
      bottom_line: 'Good.',
    };
    const out = buildScanResult('github', repoData, analysis);
    expect(out.repoId).toBe('a/b');
    expect(out.platform).toBe('github');
    expect(out.fit.level).toBe('strong');
    expect(out.fit.label).toBe('Strong fit');
    expect(out.fit.why).toContain('Health 90');
    expect(out.bottom_line).toBe('Good.'); // carried through from the spread analysis
  });

  it('reflects a weak repo as a risky fit', () => {
    const analysis = { health: { score: 40 }, red_flags: [{ severity: 'risk' }], pros: [], cons: ['c'] };
    expect(buildScanResult('github', repoData, analysis).fit.level).toBe('risky');
  });
});

describe('runScanRepo (offline, mocked GitHub + Anthropic)', () => {
  const originalToken = process.env.GITHUB_TOKEN;
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  });

  it('runs end-to-end and threads GITHUB_TOKEN into the GitHub call', async () => {
    process.env.GITHUB_TOKEN = 'ghp_abc';
    const scanJson = JSON.stringify({
      health: { score: 80 },
      red_flags: [],
      pros: ['a'],
      cons: [],
      bottom_line: 'Solid.',
    });
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('api.anthropic.com')) {
        return Promise.resolve({ ok: true, json: async () => ({ content: [{ text: scanJson }] }) });
      }
      if (u.includes('/readme') || u.includes('/languages')) return Promise.resolve({ ok: false });
      if (u.endsWith('/repos/facebook/react')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            description: 'UI',
            stargazers_count: 1,
            language: 'JavaScript',
            license: { spdx_id: 'MIT' },
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const out = await runScanRepo({ repo: 'facebook/react' });
    expect(out.repoId).toBe('facebook/react');
    expect(out.fit.level).toBe('solid');

    const ghCall = global.fetch.mock.calls.find((c) => String(c[0]).endsWith('/repos/facebook/react'));
    expect(ghCall[1]?.headers?.Authorization).toBe('Bearer ghp_abc');
    const anthCall = global.fetch.mock.calls.find((c) => String(c[0]).includes('api.anthropic.com'));
    expect(anthCall[1].headers['x-api-key']).toBe('sk-test');
  });

  it('sends no Authorization header when GITHUB_TOKEN is unset', async () => {
    delete process.env.GITHUB_TOKEN;
    const scanJson = JSON.stringify({ health: { score: 60 }, red_flags: [], pros: [], cons: [] });
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('api.anthropic.com'))
        return Promise.resolve({ ok: true, json: async () => ({ content: [{ text: scanJson }] }) });
      if (u.includes('/readme') || u.includes('/languages')) return Promise.resolve({ ok: false });
      return Promise.resolve({
        ok: true,
        json: async () => ({
          description: '',
          stargazers_count: 0,
          language: 'JavaScript',
          license: { spdx_id: 'MIT' },
        }),
      });
    });
    await runScanRepo({ repo: 'x/y' });
    const ghCall = global.fetch.mock.calls.find((c) => String(c[0]).endsWith('/repos/x/y'));
    // No init / no headers => anonymous, identical to extension behavior.
    expect(ghCall[1]?.headers?.Authorization).toBeUndefined();
  });
});
