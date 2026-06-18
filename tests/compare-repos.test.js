import { describe, it, expect } from 'vitest';
import { buildComparePrompt, parseCompareResult } from '../compare-repos.js';

const base = {
  repoId: 'owner/alpha',
  description: 'A fast state management library',
  language: 'TypeScript',
  license: 'MIT',
  stars: 12000,
  category: 'State management',
  health: { score: 88 },
  capabilities: ['reactive', 'devtools', 'ssr'],
  pros: ['Tiny bundle', 'Great DX'],
  cons: ['Small ecosystem'],
  eli5: 'Tiny reactive store with great devtools.',
};

const other = {
  repoId: 'team/beta',
  description: 'Full-featured state container',
  language: 'JavaScript',
  license: 'Apache-2.0',
  stars: 25000,
  category: 'State management',
  health: { score: 72 },
  capabilities: ['middleware', 'devtools', 'time-travel'],
  pros: ['Mature ecosystem', 'Huge community'],
  cons: ['Boilerplate heavy', 'Larger bundle'],
  eli5: 'Battle-tested Redux-style store.',
};

describe('buildComparePrompt', () => {
  it('returns empty string when a is missing repoId', () => {
    expect(buildComparePrompt({}, other)).toBe('');
  });

  it('returns empty string when b is missing repoId', () => {
    expect(buildComparePrompt(base, {})).toBe('');
  });

  it('returns empty string when either arg is null', () => {
    expect(buildComparePrompt(null, other)).toBe('');
    expect(buildComparePrompt(base, null)).toBe('');
  });

  it('includes both repo IDs', () => {
    const p = buildComparePrompt(base, other);
    expect(p).toContain('owner/alpha');
    expect(p).toContain('team/beta');
  });

  it('labels repos A and B', () => {
    const p = buildComparePrompt(base, other);
    expect(p).toContain('## A: owner/alpha');
    expect(p).toContain('## B: team/beta');
  });

  it('includes description, language, license', () => {
    const p = buildComparePrompt(base, other);
    expect(p).toContain('fast state management');
    expect(p).toContain('TypeScript');
    expect(p).toContain('MIT');
  });

  it('includes health score', () => {
    const p = buildComparePrompt(base, other);
    expect(p).toContain('88/100');
    expect(p).toContain('72/100');
  });

  it('includes capabilities', () => {
    const p = buildComparePrompt(base, other);
    expect(p).toContain('reactive');
    expect(p).toContain('middleware');
  });

  it('includes pros and cons', () => {
    const p = buildComparePrompt(base, other);
    expect(p).toContain('Tiny bundle');
    expect(p).toContain('Boilerplate heavy');
  });

  it('includes the JSON schema instruction', () => {
    const p = buildComparePrompt(base, other);
    expect(p).toContain('"winner"');
    expect(p).toContain('"pickA"');
    expect(p).toContain('"tradeoffs"');
  });

  it('handles flat health score (number)', () => {
    const a = { ...base, health: 90 };
    const p = buildComparePrompt(a, other);
    expect(p).toContain('90/100');
  });
});

describe('parseCompareResult', () => {
  it('parses a valid JSON response', () => {
    const json = JSON.stringify({
      winner: 'a',
      reason: 'Alpha has better DX.',
      verdict: 'Alpha wins on simplicity; Beta wins on ecosystem.',
      pickA: 'small teams who value DX',
      pickB: 'enterprises needing middleware',
      tradeoffs: ['Bundle size', 'Ecosystem maturity', 'Boilerplate'],
    });
    const r = parseCompareResult(json);
    expect(r.winner).toBe('a');
    expect(r.reason).toBe('Alpha has better DX.');
    expect(r.pickA).toBe('small teams who value DX');
    expect(r.tradeoffs).toHaveLength(3);
  });

  it('strips markdown code fences', () => {
    const wrapped =
      '```json\n{"winner":"b","reason":"Beta wins.","verdict":"Beta is bigger.","pickA":"n/a","pickB":"everyone","tradeoffs":[]}\n```';
    const r = parseCompareResult(wrapped);
    expect(r?.winner).toBe('b');
  });

  it('normalizes an unknown winner to tie', () => {
    const json = JSON.stringify({
      winner: 'unknown',
      reason: '',
      verdict: '',
      pickA: '',
      pickB: '',
      tradeoffs: [],
    });
    const r = parseCompareResult(json);
    expect(r.winner).toBe('tie');
  });

  it('returns null for malformed JSON', () => {
    expect(parseCompareResult('not json')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseCompareResult('')).toBeNull();
    expect(parseCompareResult(null)).toBeNull();
  });

  it('filters empty strings from tradeoffs', () => {
    const json = JSON.stringify({
      winner: 'tie',
      reason: '',
      verdict: '',
      pickA: '',
      pickB: '',
      tradeoffs: ['A', '', 'B'],
    });
    const r = parseCompareResult(json);
    expect(r.tradeoffs).toEqual(['A', 'B']);
  });
});
