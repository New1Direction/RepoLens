// tests/concepts.test.js
import { describe, it, expect } from 'vitest';
import {
  normalizeConcept, cosineSimilarity, conceptIndex,
  lexicalMatcher, bestEmbeddingMatch, deriveConceptLinks,
} from '../concepts.js';

const rec = (repoId, names, vectors = null) => ({
  repoId, vectors,
  atoms: names.map((n, i) => ({ id: `a${i}`, name: n, purpose: `does ${n}` })),
});

describe('normalizeConcept', () => {
  it('lowercases, strips punctuation, drops stopwords', () => {
    expect(normalizeConcept({ name: 'The Routing Layer!' })).toBe('routing');
    expect(normalizeConcept({ name: 'Auth/Session' })).toBe('auth-session');
  });
});

describe('cosineSimilarity', () => {
  it('is 1 for identical, 0 for orthogonal, 0 for mismatched/empty', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe('conceptIndex (lexical)', () => {
  it('maps each normalized concept to the repos that have it', () => {
    const recs = { x: rec('a/x', ['Router', 'Cache']), y: rec('c/y', ['router', 'Queue']) };
    const idx = conceptIndex(recs);
    expect(idx['router'].sort()).toEqual(['a/x', 'c/y']);
    expect(idx['cache']).toEqual(['a/x']);
  });
});

describe('lexicalMatcher', () => {
  it('links repos sharing a normalized concept, scored by overlap', () => {
    const recs = { x: rec('a/x', ['Router', 'Cache']), y: rec('c/y', ['Routing', 'Cache']) };
    const links = lexicalMatcher(recs);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ a: 'a/x', b: 'c/y', shared: ['cache'], score: 1 });
  });
});

describe('bestEmbeddingMatch', () => {
  it('returns the best atom-pair label when above threshold, else null', () => {
    const a = rec('a/x', ['Router'], [[1, 0]]);
    const b = rec('c/y', ['Dispatch'], [[1, 0]]);
    const m = bestEmbeddingMatch(a, b, 0.82);
    expect(m.score).toBeCloseTo(1);
    expect(m.label).toBe('Router ~ Dispatch');
    const far = rec('e/z', ['X'], [[0, 1]]);
    expect(bestEmbeddingMatch(a, far, 0.82)).toBeNull();
  });
});

describe('deriveConceptLinks (per-pair hybrid)', () => {
  it('uses embeddings when BOTH repos have vectors', () => {
    const recs = {
      x: rec('a/x', ['Router'], [[1, 0]]),
      y: rec('c/y', ['Dispatch'], [[1, 0]]),
    };
    const links = deriveConceptLinks(recs, { threshold: 0.82 });
    expect(links).toHaveLength(1);
    expect(links[0].score).toBeCloseTo(1);
    expect(links[0].shared).toEqual(['Router ~ Dispatch']);
  });

  it('falls back to lexical when either repo lacks vectors', () => {
    const recs = {
      x: rec('a/x', ['Cache'], [[1, 0]]),   // has vectors
      y: rec('c/y', ['Cache'], null),        // no vectors → lexical for this pair
    };
    const links = deriveConceptLinks(recs, { threshold: 0.82 });
    expect(links).toHaveLength(1);
    expect(links[0].shared).toEqual(['cache']);
  });
});
