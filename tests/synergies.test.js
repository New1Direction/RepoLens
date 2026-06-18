import { describe, it, expect } from 'vitest';
import { buildSynergiesPrompt, parseSynergies } from '../synergies.js';

const repo = {
  repoId: 'facebook/react',
  description: 'UI lib',
  language: 'JavaScript',
  category: 'UI Framework',
  eli5: 'Build UIs from components.',
};
const candidates = [
  {
    repoId: 'reduxjs/redux',
    category: 'State management',
    language: 'JavaScript',
    eli5: 'Predictable state container.',
  },
  {
    repoId: 'vitejs/vite',
    category: 'Build tool',
    language: 'JavaScript',
    eli5: 'Fast dev server + bundler.',
  },
];

describe('buildSynergiesPrompt', () => {
  it('asks for complements (not alternatives) and includes library candidates', () => {
    const p = buildSynergiesPrompt(repo, candidates);
    expect(p).toContain('facebook/react');
    expect(p).toMatch(/WELL TOGETHER/i);
    expect(p).toContain('reduxjs/redux'); // library candidate seeded
    expect(p).toContain('vitejs/vite');
    expect(p).toMatch(/"synergies"/);
  });
  it('handles an empty library gracefully', () => {
    expect(buildSynergiesPrompt(repo, [])).toContain('not saved many repos');
  });
});

describe('parseSynergies', () => {
  it('parses synergies and coerces in_library to a boolean', () => {
    const r = parseSynergies(
      '```json\n{"synergies":[{"repoId":"reduxjs/redux","category":"State","synergy":"manages app state for React","in_library":true},{"repoId":"tailwindlabs/tailwindcss","synergy":"styling"}]}\n```'
    );
    expect(r.synergies).toHaveLength(2);
    expect(r.synergies[0].in_library).toBe(true);
    expect(r.synergies[1].in_library).toBe(false); // missing → false
    expect(r.synergies[1].category).toBe(''); // missing → ''
  });
  it('defaults to an empty list', () => {
    expect(parseSynergies('{}').synergies).toEqual([]);
  });
});
