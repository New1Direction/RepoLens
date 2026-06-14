import { describe, it, expect } from 'vitest';
import { buildAskPrompt, parseAskAnswer } from '../ask-library.js';

const docs = [
  {
    repoId: 'facebook/react',
    description: 'The library for web UIs.',
    category: 'frontend',
    capabilities: ['ui', 'ssr', 'components'],
    health: 94,
    eli5: 'Build UIs from reusable components using a virtual DOM.',
    decision: 'adopt',
  },
  {
    repoId: 'vuejs/vue',
    description: 'Progressive JavaScript framework.',
    category: 'frontend',
    capabilities: ['ui', 'spa'],
    health: 90,
    eli5: 'Gentle learning-curve UI framework with reactive templates.',
    decision: null,
  },
];

describe('buildAskPrompt', () => {
  it('includes the question', () => {
    const p = buildAskPrompt('What is good for SSR?', docs);
    expect(p).toContain('What is good for SSR?');
  });

  it('includes all repo names', () => {
    const p = buildAskPrompt('best frontend?', docs);
    expect(p).toContain('facebook/react');
    expect(p).toContain('vuejs/vue');
  });

  it('includes capabilities', () => {
    const p = buildAskPrompt('SSR options?', docs);
    expect(p).toContain('ui, ssr, components');
  });

  it('includes health score', () => {
    const p = buildAskPrompt('health?', docs);
    expect(p).toContain('94/100');
  });

  it('includes eli5 summary', () => {
    const p = buildAskPrompt('summary?', docs);
    expect(p).toContain('Build UIs from reusable components');
  });

  it('includes decision when set', () => {
    const p = buildAskPrompt('decision?', docs);
    expect(p).toContain('adopt');
  });

  it('omits Decision line when decision is null', () => {
    const p = buildAskPrompt('decision?', [docs[1]]);
    expect(p).not.toContain('Decision:');
  });

  it('includes category', () => {
    const p = buildAskPrompt('category?', docs);
    expect(p).toContain('Category: frontend');
  });

  it('includes description', () => {
    const p = buildAskPrompt('desc?', docs);
    expect(p).toContain('The library for web UIs.');
  });

  it('returns empty string for empty question', () => {
    expect(buildAskPrompt('', docs)).toBe('');
  });

  it('returns empty string for null question', () => {
    expect(buildAskPrompt(null, docs)).toBe('');
  });

  it('returns empty string for empty docs array', () => {
    expect(buildAskPrompt('what?', [])).toBe('');
  });

  it('truncates very long eli5 to stay manageable', () => {
    const long = 'word '.repeat(200);
    const p = buildAskPrompt('q?', [{ repoId: 'x/y', eli5: long }]);
    expect(p.length).toBeLessThan(3000);
    expect(p).toContain('…');
  });

  it('works with minimal doc (repoId only)', () => {
    const p = buildAskPrompt('q?', [{ repoId: 'a/b' }]);
    expect(p).toContain('--- a/b ---');
  });
});

describe('parseAskAnswer', () => {
  it('trims surrounding whitespace', () => {
    expect(parseAskAnswer('  hello  ')).toBe('hello');
  });

  it('handles null gracefully', () => {
    expect(parseAskAnswer(null)).toBe('');
  });

  it('handles undefined gracefully', () => {
    expect(parseAskAnswer(undefined)).toBe('');
  });

  it('returns plain prose unchanged', () => {
    expect(parseAskAnswer('React is your best SSR option.')).toBe('React is your best SSR option.');
  });

  it('preserves internal newlines', () => {
    const t = 'Line 1.\nLine 2.';
    expect(parseAskAnswer(t)).toBe(t);
  });
});
