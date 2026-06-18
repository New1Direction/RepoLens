import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildDeepDiveResult, runDeepDive } from '../mcp/deep-dive.js';

describe('buildDeepDiveResult', () => {
  it('assembles the Feynman layer + atoms/lineage and flags degraded', () => {
    const feynman = {
      explanation: 'It works.',
      gaps: ['g'],
      assumptions: ['a'],
      questions: [{ q: '?', a: '!' }],
      confidence: [{ claim: 'c', level: 'high', note: 'n' }],
    };
    const out = buildDeepDiveResult('a/b', [{ id: 'x' }], { links: [], roots: [], leaves: [] }, feynman, {
      degraded: true,
    });
    expect(out.repoId).toBe('a/b');
    expect(out.explanation).toBe('It works.');
    expect(out.degraded).toBe(true);
    expect(out.atoms).toEqual([{ id: 'x' }]);
    expect(out.questions).toEqual([{ q: '?', a: '!' }]);
  });
});

describe('runDeepDive (offline, mocked GitHub + Anthropic)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('makes three sequential model calls (atoms → lineage → Feynman)', async () => {
    const atomsJson = JSON.stringify({
      atoms: [{ id: 'core', name: 'Core', kind: 'subsystem', purpose: 'p', files: ['package.json'] }],
    });
    const lineageJson = JSON.stringify({ links: [], roots: ['core'], leaves: [] });
    const feynmanJson = JSON.stringify({
      explanation: 'Plain.',
      gaps: [],
      assumptions: [],
      questions: [],
      confidence: [],
    });
    const anthropicQueue = [atomsJson, lineageJson, feynmanJson];

    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('api.anthropic.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ content: [{ text: anthropicQueue.shift() }] }),
        });
      }
      if (u.includes('/git/trees/'))
        return Promise.resolve({
          ok: true,
          json: async () => ({ tree: [{ type: 'blob', path: 'package.json' }] }),
        });
      if (u.includes('/contents/'))
        return Promise.resolve({
          ok: true,
          json: async () => ({ encoding: 'base64', content: btoa('{"name":"x"}') }),
        });
      if (u.includes('/readme') || u.includes('/languages')) return Promise.resolve({ ok: false });
      if (/\/repos\/[^/]+\/[^/]+$/.test(u)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            description: 'x',
            stargazers_count: 0,
            language: 'JavaScript',
            license: { spdx_id: 'MIT' },
            default_branch: 'main',
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const out = await runDeepDive({ repo: 'honojs/hono' });
    expect(out.repoId).toBe('honojs/hono');
    expect(out.explanation).toBe('Plain.');
    expect(out.atoms).toHaveLength(1);
    expect(out.lineage.roots).toEqual(['core']);
    expect(out.degraded).toBe(false);

    const anthropicCalls = global.fetch.mock.calls.filter((c) => String(c[0]).includes('api.anthropic.com'));
    expect(anthropicCalls).toHaveLength(3);
  });
});
