import { describe, it, expect } from 'vitest';
import { IDEATE_FRAMEWORKS, isIdeateFramework, buildIdeatePrompt, parseIdeate } from '../ideate.js';

const repo = { repoId: 'facebook/react', description: 'UI lib', language: 'JavaScript' };
const source = { tree: ['src/index.js'], files: [{ path: 'src/index.js', content: 'export const x=1' }] };

describe('IDEATE_FRAMEWORKS / isIdeateFramework', () => {
  it('exposes the four frameworks', () => {
    expect(IDEATE_FRAMEWORKS.map((f) => f.key)).toEqual(['triz', 'scamper', 'lateral', 'morph']);
  });
  it('validates keys', () => {
    expect(isIdeateFramework('scamper')).toBe(true);
    expect(isIdeateFramework('nope')).toBe(false);
  });
});

describe('buildIdeatePrompt', () => {
  it('includes repo + source and the framework instruction', () => {
    const p = buildIdeatePrompt('triz', repo, source);
    expect(p).toContain('facebook/react');
    expect(p).toContain('src/index.js');
    expect(p).toContain('TRIZ');
    expect(p).toMatch(/"contradiction"/);
  });
  it('builds distinct prompts per framework', () => {
    expect(buildIdeatePrompt('scamper', repo, source)).toContain('SCAMPER');
    expect(buildIdeatePrompt('lateral', repo, source)).toContain('LATERAL THINKING');
    expect(buildIdeatePrompt('morph', repo, source)).toContain('MORPHOLOGICAL ANALYSIS');
  });
  it('falls back to TRIZ for an unknown framework', () => {
    expect(buildIdeatePrompt('bogus', repo, source)).toContain('TRIZ');
  });
});

describe('parseIdeate', () => {
  it('triz — parses contradiction/principles/idea with defaults', () => {
    const r = parseIdeate(
      'triz',
      '```json\n{"contradiction":{"improving":"depth"},"principles":[{"number":15,"name":"Dynamics","application":"adapt"}],"idea":"X"}\n```'
    );
    expect(r.contradiction.improving).toBe('depth');
    expect(r.contradiction.worsening).toBe('');
    expect(r.principles[0].number).toBe(15);
    expect(r.idea).toBe('X');
  });
  it('scamper — keeps lens + idea per item', () => {
    const r = parseIdeate(
      'scamper',
      '{"items":[{"lens":"Substitute","idea":"a"},{"lens":"Reverse","idea":"b"}]}'
    );
    expect(r.items).toHaveLength(2);
    expect(r.items[1].lens).toBe('Reverse');
  });
  it('lateral — provocation/leap/ideas', () => {
    const r = parseIdeate('lateral', '{"provocation":"a jellyfish","leap":"drift","ideas":["i1","i2"]}');
    expect(r.provocation).toBe('a jellyfish');
    expect(r.ideas).toEqual(['i1', 'i2']);
  });
  it('morph — dimensions + combinations', () => {
    const r = parseIdeate(
      'morph',
      '{"dimensions":[{"axis":"UI","options":["cli","gui"]}],"combinations":[{"picks":["cli"],"concept":"c"}]}'
    );
    expect(r.dimensions[0].axis).toBe('UI');
    expect(r.dimensions[0].options).toEqual(['cli', 'gui']);
    expect(r.combinations[0].picks).toEqual(['cli']);
    expect(r.combinations[0].concept).toBe('c');
  });
});
