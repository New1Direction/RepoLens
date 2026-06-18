import { describe, it, expect } from 'vitest';
import { buildCombinatorPrompt, parseCombinator } from '../combinator-prompt.js';

const repos = [
  { repoId: 'o/vec', capabilities: ['vector-index'], eli5: 'an ANN index' },
  { repoId: 'o/tune', capabilities: ['fine-tuning'], eli5: 'LoRA fine-tuning' },
];

describe('buildCombinatorPrompt', () => {
  it('lists each repo with its capabilities and asks for fused-idea JSON', () => {
    const p = buildCombinatorPrompt(repos);
    expect(p).toContain('o/vec');
    expect(p).toContain('vector-index');
    expect(p).toContain('"title"');
    expect(p).toContain('"novelty"');
    expect(p.toLowerCase()).toContain('valid json');
  });
});

describe('parseCombinator', () => {
  const good = JSON.stringify({
    title: 'Self-tuning Search',
    pitch: 'A search kit that fine-tunes itself.',
    contributions: [
      { repoId: 'o/vec', role: 'the index' },
      { repoId: 'ghost/x', role: 'not in input' },
    ],
    novelty: 4,
    feasibility: 3,
    first_step: 'wire the index to the trainer',
  });
  it('parses fields and clamps scores to 0–5', () => {
    const r = parseCombinator(JSON.stringify({ title: 'T', novelty: 9, feasibility: -2 }), ['o/vec']);
    expect(r.title).toBe('T');
    expect(r.novelty).toBe(5);
    expect(r.feasibility).toBe(0);
  });
  it('drops contributions whose repoId is not in the input set', () => {
    const r = parseCombinator(good, ['o/vec', 'o/tune']);
    expect(r.contributions).toEqual([{ repoId: 'o/vec', role: 'the index' }]);
  });
  it('tolerates markdown code fences', () => {
    expect(parseCombinator('```json\n' + good + '\n```', ['o/vec']).title).toBe('Self-tuning Search');
  });
  it('throws when no JSON object is present', () => {
    expect(() => parseCombinator('no json here', [])).toThrow();
  });
});
