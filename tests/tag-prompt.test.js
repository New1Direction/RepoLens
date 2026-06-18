import { describe, it, expect } from 'vitest';
import { buildTagPrompt, parseTags } from '../tag-prompt.js';

describe('buildTagPrompt', () => {
  it('offers the taxonomy and the repo context, asks for capabilities JSON', () => {
    const p = buildTagPrompt({ repoId: 'o/x', category: 'Vector Index', eli5: 'an ANN index' });
    expect(p).toContain('o/x');
    expect(p).toContain('Vector Index');
    expect(p).toContain('vector-index'); // a real taxonomy tag offered
    expect(p).toContain('"capabilities"');
  });
});

describe('parseTags', () => {
  it('returns only valid taxonomy tags from the JSON', () => {
    expect(parseTags(JSON.stringify({ capabilities: ['vector-index', 'made-up', 'cli'] }))).toEqual([
      'vector-index',
      'cli',
    ]);
  });
  it('tolerates code fences and returns [] on junk', () => {
    expect(parseTags('```json\n{"capabilities":["rag"]}\n```')).toEqual(['rag']);
    expect(parseTags('not json')).toEqual([]);
  });
});
