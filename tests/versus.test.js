import { describe, it, expect } from 'vitest';
import { buildVersusPrompt, parseVersus } from '../versus.js';

const a = {
  repoId: 'facebook/react',
  description: 'UI lib',
  language: 'JavaScript',
  stars: 228000,
  readme: '# React',
};
const b = {
  repoId: 'vuejs/vue',
  description: 'Progressive framework',
  language: 'JavaScript',
  stars: 200000,
  readme: '# Vue',
};

describe('buildVersusPrompt', () => {
  it('includes both repos and asks for the comparison JSON', () => {
    const p = buildVersusPrompt(a, b);
    expect(p).toContain('facebook/react');
    expect(p).toContain('vuejs/vue');
    expect(p).toMatch(/HEAD-TO-HEAD/i);
    expect(p).toMatch(/"dimensions"/);
    expect(p).toMatch(/"verdict"/);
  });
});

describe('parseVersus', () => {
  it('parses summaries, dimensions, pick-when lists, and verdict', () => {
    const raw = `\`\`\`json
{
  "summary_a": "Big ecosystem.",
  "summary_b": "Gentle curve.",
  "dimensions": [ { "label": "Learning curve", "a": "steeper", "b": "gentler", "winner": "b" }, { "label": "Ecosystem", "a": "huge", "b": "large", "winner": "a" } ],
  "pick_a_when": ["You need the biggest ecosystem."],
  "pick_b_when": ["You want to ramp fast."],
  "verdict": "Pick by team experience."
}
\`\`\``;
    const r = parseVersus(raw);
    expect(r.summary_a).toBe('Big ecosystem.');
    expect(r.dimensions).toHaveLength(2);
    expect(r.dimensions[0].winner).toBe('b');
    expect(r.pick_a_when).toEqual(['You need the biggest ecosystem.']);
    expect(r.verdict).toBe('Pick by team experience.');
  });

  it('defaults a bad winner to tie and missing arrays to empty', () => {
    const r = parseVersus('{"dimensions":[{"label":"x","a":"1","b":"2","winner":"maybe"}]}');
    expect(r.dimensions[0].winner).toBe('tie');
    expect(r.pick_a_when).toEqual([]);
    expect(r.verdict).toBe('');
  });
});
