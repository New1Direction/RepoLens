import { describe, it, expect } from 'vitest';
import {
  TAXONOMY,
  ALL_TAGS,
  layerOf,
  isValidTag,
  layersAdjacent,
  normalizeCapabilities,
  deriveCapabilities,
} from '../taxonomy.js';

describe('taxonomy vocabulary', () => {
  it('exposes layers of tags and a flat ALL_TAGS set incl. "other"', () => {
    expect(Object.keys(TAXONOMY)).toContain('storage');
    expect(TAXONOMY.storage).toContain('vector-index');
    expect(ALL_TAGS.has('vector-index')).toBe(true);
    expect(ALL_TAGS.has('other')).toBe(true);
  });
  it('layerOf maps a tag to its layer, else "other"', () => {
    expect(layerOf('vector-index')).toBe('storage');
    expect(layerOf('fine-tuning')).toBe('ml');
    expect(layerOf('nope')).toBe('other');
  });
  it('isValidTag accepts known tags + "other", rejects unknown', () => {
    expect(isValidTag('agent-runtime')).toBe(true);
    expect(isValidTag('other')).toBe(true);
    expect(isValidTag('totally-made-up')).toBe(false);
  });
});

describe('layersAdjacent', () => {
  it('a layer is adjacent to itself', () => {
    expect(layersAdjacent('ml', 'ml')).toBe(true);
  });
  it('declared neighbours are adjacent, others are not', () => {
    expect(layersAdjacent('storage', 'ml')).toBe(true);
    expect(layersAdjacent('ui', 'storage')).toBe(false);
  });
});

describe('normalizeCapabilities', () => {
  it('keeps only valid tags, lowercases, dedupes, caps at 5', () => {
    expect(normalizeCapabilities(['vector-index', 'BOGUS', 'ui-rendering'])).toEqual([
      'vector-index',
      'ui-rendering',
    ]);
    expect(normalizeCapabilities(['Vector-Index', 'vector-index'])).toEqual(['vector-index']);
    expect(normalizeCapabilities(['cli', 'database', 'cache', 'auth', 'memory', 'rag'])).toHaveLength(5);
  });
  it('returns [] for non-arrays', () => {
    expect(normalizeCapabilities(undefined)).toEqual([]);
    expect(normalizeCapabilities('cli')).toEqual([]);
  });
});

describe('deriveCapabilities (deterministic keyword fallback)', () => {
  it('derives tags from category + eli5 keywords', () => {
    expect(
      deriveCapabilities({ category: 'Vector Index', eli5: 'an approximate nearest neighbor index' })
    ).toContain('vector-index');
    expect(deriveCapabilities({ category: 'Autonomous Agent Runtime' })).toContain('agent-runtime');
    expect(deriveCapabilities({ category: 'CLI Tool' })).toContain('cli');
  });
  it('returns [] when nothing matches and caps at 5', () => {
    expect(deriveCapabilities({})).toEqual([]);
    expect(deriveCapabilities({ eli5: 'nondescript thing with no signal words' })).toEqual([]);
  });
  it('only ever returns valid tags', () => {
    deriveCapabilities({
      category: 'Multimodal Inference Server',
      eli5: 'serving with fine-tuning and rag pipeline and a dashboard',
    }).forEach((t) => expect(isValidTag(t)).toBe(true));
  });
});
