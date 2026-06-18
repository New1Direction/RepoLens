import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  selectKeyFiles,
  fetchSource,
  buildAtomsPrompt,
  parseAtoms,
  buildLineagePrompt,
  parseLineage,
  buildFeynmanPrompt,
  parseFeynman,
} from '../deepdive.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('selectKeyFiles', () => {
  it('prioritises known manifest/entry files and skips deep non-code files', () => {
    const picked = selectKeyFiles(['docs/x.md', 'package.json', 'src/index.js', 'a/b/c/deep.ts']);
    expect(picked).toContain('package.json');
    expect(picked).toContain('src/index.js');
    expect(picked).not.toContain('docs/x.md'); // not code
    expect(picked).not.toContain('a/b/c/deep.ts'); // too deep
  });
  it('caps at 8 files', () => {
    const many = Array.from({ length: 30 }, (_, i) => `f${i}.ts`);
    expect(selectKeyFiles(many).length).toBeLessThanOrEqual(8);
  });
});

describe('fetchSource', () => {
  it('returns a degraded result for non-GitHub platforms without fetching', async () => {
    global.fetch = vi.fn();
    const res = await fetchSource('npm', 'left-pad');
    expect(res.degraded).toBe(true);
    expect(res.tree).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches the tree + key file contents for GitHub', async () => {
    global.fetch = vi.fn(async (url) => {
      const body = url.endsWith('/repos/facebook/react')
        ? { default_branch: 'main' }
        : url.includes('/git/trees/')
          ? {
              tree: [
                { path: 'package.json', type: 'blob' },
                { path: 'src/index.js', type: 'blob' },
                { path: 'docs/readme.md', type: 'blob' },
              ],
            }
          : url.includes('/contents/package.json')
            ? { encoding: 'base64', content: btoa('{"name":"react"}') }
            : url.includes('/contents/src/index.js')
              ? { encoding: 'base64', content: btoa('export const x = 1;') }
              : {};
      return { ok: true, json: async () => body };
    });

    const res = await fetchSource('github', 'facebook/react');
    expect(res.tree).toContain('package.json');
    expect(res.tree).toContain('src/index.js');
    const pkg = res.files.find((f) => f.path === 'package.json');
    expect(pkg.content).toContain('"name": "react"'.replace(': ', ':')); // tolerant of spacing
    expect(res.files.some((f) => f.path === 'src/index.js')).toBe(true);
  });
});

describe('buildAtomsPrompt', () => {
  it('includes the repo, file tree, and source, and asks for atoms JSON', () => {
    const p = buildAtomsPrompt(
      { repoId: 'facebook/react', description: 'UI lib', language: 'JavaScript' },
      { tree: ['src/index.js'], files: [{ path: 'src/index.js', content: 'export const x=1' }] }
    );
    expect(p).toContain('facebook/react');
    expect(p).toContain('src/index.js');
    expect(p).toContain('export const x=1');
    expect(p).toMatch(/"atoms"/);
  });
  it('degrades gracefully with no source', () => {
    const p = buildAtomsPrompt({ repoId: 'x/y' }, { tree: [], files: [] });
    expect(p).toContain('no file tree available');
  });
});

describe('parseAtoms', () => {
  it('parses atoms and fills defaults for missing fields', () => {
    const { atoms } = parseAtoms(
      '```json\n{"atoms":[{"name":"Reconciler","purpose":"diffs the tree"}]}\n```'
    );
    expect(atoms).toHaveLength(1);
    expect(atoms[0].id).toBe('atom-1'); // defaulted
    expect(atoms[0].kind).toBe('module'); // defaulted
    expect(atoms[0].files).toEqual([]);
  });
  it('throws on non-JSON', () => {
    expect(() => parseAtoms('no json here')).toThrow();
  });
});

describe('buildLineagePrompt + parseLineage', () => {
  it('lists the atom ids and parses links, dropping malformed ones', () => {
    const prompt = buildLineagePrompt([{ id: 'sched', name: 'Scheduler', purpose: 'schedules work' }]);
    expect(prompt).toContain('sched');
    const out = parseLineage(
      '{"links":[{"from":"a","to":"b","relation":"enables","why":"x"},{"to":"c"}],"roots":["a"],"leaves":["b"]}'
    );
    expect(out.links).toHaveLength(1); // the {to:"c"} link is dropped (no from)
    expect(out.links[0].relation).toBe('enables');
    expect(out.roots).toEqual(['a']);
  });
  it('defaults relation when missing', () => {
    const out = parseLineage('{"links":[{"from":"a","to":"b"}]}');
    expect(out.links[0].relation).toBe('depends-on');
  });
});

describe('buildFeynmanPrompt + parseFeynman', () => {
  it('asks for explanation/gaps/questions and parses them with defaults', () => {
    const prompt = buildFeynmanPrompt({ repoId: 'x/y' }, [{ id: 'a', name: 'A', purpose: 'p' }], {
      links: [],
    });
    expect(prompt).toMatch(/explanation/);
    const out = parseFeynman('{"explanation":"It does X.","questions":[{"q":"Why?","a":"Because."}]}');
    expect(out.explanation).toBe('It does X.');
    expect(out.gaps).toEqual([]);
    expect(out.questions[0].q).toBe('Why?');
    expect(out.confidence).toEqual([]);
  });
});

import { factsBlock } from '../deepdive.js';

describe('factsBlock + facts-aware atoms prompt', () => {
  const facts = {
    fileCount: 13,
    languages: [
      { name: 'JavaScript', code: 315 },
      { name: 'JSON', code: 62 },
    ],
    manifests: ['package.json'],
    dependencies: { npm: ['react', 'scheduler'], cargo: [], pip: [], go: [] },
    tests: { present: false },
    ci: { present: true, files: ['.github/workflows/main.yml'] },
    secrets: [],
  };
  const source = { tree: ['a.js'], files: [], degraded: false };
  const repo = { repoId: 'o/r', description: 'd', language: 'JavaScript' };

  it('factsBlock summarises measured facts', () => {
    const b = factsBlock(facts);
    expect(b).toMatch(/MEASURED FACTS/);
    expect(b).toContain('13 files');
    expect(b).toContain('JavaScript 315');
    expect(b).toContain('react');
  });
  it('factsBlock is empty without facts', () => {
    expect(factsBlock(null)).toBe('');
    expect(factsBlock(undefined)).toBe('');
  });
  it('buildAtomsPrompt is unchanged when no facts, grounded when facts present', () => {
    const plain = buildAtomsPrompt(repo, source);
    expect(plain).not.toContain('MEASURED FACTS');
    const grounded = buildAtomsPrompt(repo, source, facts);
    expect(grounded).toContain('MEASURED FACTS');
    expect(grounded).toContain('JavaScript 315');
  });
  it('factsBlock includes license, transitive scale, and architecture when present', () => {
    const rich = {
      ...facts,
      license: { spdx: 'Apache-2.0', file: 'LICENSE-APACHE' },
      depGraph: {
        cargo: { direct: 39, total: 240, lockfile: 'Cargo.lock' },
        npm: { direct: 0, total: 0, lockfile: '' },
      },
      architecture: {
        monorepo: true,
        workspaces: ['crates/*'],
        entryPoints: ['src/lib.rs'],
        containerized: true,
      },
    };
    const b = factsBlock(rich);
    expect(b).toContain('License: Apache-2.0');
    expect(b).toContain('cargo 39 direct / 240 total');
    expect(b).toContain('monorepo');
    expect(b).toContain('containerized');
  });
  it('factsBlock includes optional code graph evidence from advanced runners', () => {
    const b = factsBlock({
      ...facts,
      codeGraph: {
        nodes: 1200,
        edges: 3400,
        symbols: { functions: 210, classes: 18, routes: 7 },
        routes: ['GET /api/repos'],
        hotspots: [{ name: 'scanRepository', file: 'src/scan.ts', inbound: 14 }],
        deadCode: [{ name: 'legacyParser', file: 'src/legacy.ts' }],
      },
    });
    expect(b).toContain('Code graph: 1200 nodes; 3400 edges');
    expect(b).toContain('210 functions');
    expect(b).toContain('GET /api/repos');
    expect(b).toContain('Graph hotspots: scanRepository');
    expect(b).toContain('Potential dead code: 1 symbols flagged');
  });
});
