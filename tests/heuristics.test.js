import { describe, it, expect } from 'vitest';
import {
  HEURISTICS_FRAMEWORKS,
  isHeuristicFramework,
  buildHeuristicsPrompt,
  parseHeuristics,
} from '../heuristics.js';

const repo = { repoId: 'facebook/react', description: 'UI lib', language: 'JavaScript' };
const source = { tree: ['src/index.js'], files: [{ path: 'src/index.js', content: 'export const x=1' }] };

describe('HEURISTICS_FRAMEWORKS / isHeuristicFramework', () => {
  it('exposes the two frameworks', () => {
    expect(HEURISTICS_FRAMEWORKS.map((f) => f.key)).toEqual(['pareto', 'eisenhower']);
  });
  it('validates keys', () => {
    expect(isHeuristicFramework('pareto')).toBe(true);
    expect(isHeuristicFramework('nope')).toBe(false);
  });
});

describe('buildHeuristicsPrompt', () => {
  it('includes repo + source and the framework instruction', () => {
    const p = buildHeuristicsPrompt('pareto', repo, source);
    expect(p).toContain('facebook/react');
    expect(p).toContain('src/index.js');
    expect(p).toContain('PARETO PRINCIPLE');
    expect(p).toMatch(/"vital_few"/);
  });
  it('builds the Eisenhower prompt', () => {
    expect(buildHeuristicsPrompt('eisenhower', repo, source)).toContain('EISENHOWER MATRIX');
  });
  it('falls back to Pareto for an unknown framework', () => {
    expect(buildHeuristicsPrompt('bogus', repo, source)).toContain('PARETO PRINCIPLE');
  });
});

describe('parseHeuristics', () => {
  it('pareto — parses vital_few + trivial_many with defaults', () => {
    const r = parseHeuristics(
      'pareto',
      '```json\n{"vital_few":[{"factor":"reconciler","impact":"most bugs","share":"~50%"}],"trivial_many":"the rest"}\n```'
    );
    expect(r.vital_few[0].factor).toBe('reconciler');
    expect(r.vital_few[0].share).toBe('~50%');
    expect(r.trivial_many).toBe('the rest');
  });
  it('pareto — defaults missing fields', () => {
    const r = parseHeuristics('pareto', '{"vital_few":[{"factor":"x"}]}');
    expect(r.vital_few[0].impact).toBe('');
    expect(r.trivial_many).toBe('');
  });
  it('eisenhower — four quadrant arrays', () => {
    const r = parseHeuristics(
      'eisenhower',
      '{"do":["a"],"schedule":["b"],"delegate":["c"],"eliminate":["d"]}'
    );
    expect(r.do).toEqual(['a']);
    expect(r.schedule).toEqual(['b']);
    expect(r.delegate).toEqual(['c']);
    expect(r.eliminate).toEqual(['d']);
  });
  it('eisenhower — empty quadrants default to []', () => {
    const r = parseHeuristics('eisenhower', '{"do":["a"]}');
    expect(r.schedule).toEqual([]);
  });
});
