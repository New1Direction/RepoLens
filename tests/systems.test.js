import { describe, it, expect } from 'vitest';
import { SYSTEMS_FRAMEWORKS, isFramework, buildSystemsPrompt, parseSystems } from '../systems.js';

const repo = { repoId: 'facebook/react', description: 'UI lib', language: 'JavaScript' };
const source = { tree: ['src/index.js'], files: [{ path: 'src/index.js', content: 'export const x=1' }] };

describe('SYSTEMS_FRAMEWORKS / isFramework', () => {
  it('exposes the four frameworks', () => {
    expect(SYSTEMS_FRAMEWORKS.map((f) => f.key)).toEqual(['toc', 'loops', 'pdca', 'dmaic']);
  });
  it('validates framework keys', () => {
    expect(isFramework('toc')).toBe(true);
    expect(isFramework('nope')).toBe(false);
  });
});

describe('buildSystemsPrompt', () => {
  it('includes repo + source context and the framework instruction', () => {
    const toc = buildSystemsPrompt('toc', repo, source);
    expect(toc).toContain('facebook/react');
    expect(toc).toContain('src/index.js');
    expect(toc).toContain('THEORY OF CONSTRAINTS');
    expect(toc).toMatch(/"bottleneck"/);
  });
  it('builds distinct prompts per framework', () => {
    expect(buildSystemsPrompt('loops', repo, source)).toContain('SYSTEMS THINKING');
    expect(buildSystemsPrompt('pdca', repo, source)).toContain('PDCA');
    expect(buildSystemsPrompt('dmaic', repo, source)).toContain('DMAIC');
  });
  it('falls back to ToC for an unknown framework', () => {
    expect(buildSystemsPrompt('bogus', repo, source)).toContain('THEORY OF CONSTRAINTS');
  });
});

describe('parseSystems', () => {
  it('toc — parses bottleneck/exploit/next with defaults', () => {
    const r = parseSystems(
      'toc',
      '```json\n{"bottleneck":{"name":"Single-threaded reconcile"},"exploit":["batch updates"]}\n```'
    );
    expect(r.bottleneck.name).toBe('Single-threaded reconcile');
    expect(r.bottleneck.why).toBe('');
    expect(r.exploit).toEqual(['batch updates']);
    expect(r.next_bottleneck).toEqual({ name: '', why: '' });
  });
  it('loops — normalizes type and keeps cycle', () => {
    const r = parseSystems(
      'loops',
      '{"loops":[{"type":"balancing","name":"L","cycle":["A","B"],"effect":"e"},{"name":"R"}]}'
    );
    expect(r.loops[0].type).toBe('balancing');
    expect(r.loops[0].cycle).toEqual(['A', 'B']);
    expect(r.loops[1].type).toBe('reinforcing'); // defaulted
  });
  it('pdca — coerces all four phases to strings', () => {
    const r = parseSystems('pdca', '{"plan":"p","do":["a","b"],"check":"c","act":"x"}');
    expect(r.plan).toBe('p');
    expect(r.do).toBe('a b'); // array coerced
    expect(typeof r.check).toBe('string');
  });
  it('dmaic — arrays for measure/improve/control', () => {
    const r = parseSystems(
      'dmaic',
      '{"define":"d","measure":["m1","m2"],"analyze":"a","improve":["i"],"control":["c"]}'
    );
    expect(r.define).toBe('d');
    expect(r.measure).toEqual(['m1', 'm2']);
    expect(r.improve).toEqual(['i']);
    expect(r.control).toEqual(['c']);
  });
});
