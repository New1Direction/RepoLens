import { describe, it, expect } from 'vitest';
import { parseClaudeResponse } from '../parser.js';

const validResponse = {
  eli5: 'Simple explanation.',
  technical: 'Technical detail.',
  use_cases: { core_fit: 'a', good_fit: 'b', works_well: 'c', long_term: 'd' },
  skip_if: { overkill: 'a', wrong_tool: 'b', needs_care: 'c', consider: 'd' },
  enables: 'Enables stuff.',
  pros: ['Pro one', 'Pro two'],
  cons: ['Con one'],
  alternatives: [{ name: 'Vue', when: 'Gentler learning curve.' }],
  health: {
    score: 85,
    commit_activity: 90,
    issue_response: 70,
    pr_merge_rate: 80,
    maintainer_count: 85,
    summary: 'Healthy.',
  },
  red_flags: [{ title: 'Flag', text: 'Detail.', severity: 'warning' }],
  start_here: [{ icon: '📖', title: 'Docs', desc: 'Start here.', tag: 'DOCS' }],
  compare_hooks: 'React beats Vue on ecosystem size.',
  tags: ['javascript', 'ui'],
  category: 'UI Framework',
};

describe('parseClaudeResponse', () => {
  it('passes a valid response through', () => {
    const result = parseClaudeResponse(JSON.stringify(validResponse));
    expect(result.eli5).toBe('Simple explanation.');
    expect(result.tags).toEqual(['javascript', 'ui']);
  });
  it('strips markdown code fences if present', () => {
    const wrapped = '```json\n' + JSON.stringify(validResponse) + '\n```';
    expect(parseClaudeResponse(wrapped).eli5).toBe('Simple explanation.');
  });
  it('throws on invalid JSON', () => {
    expect(() => parseClaudeResponse('not json')).toThrow();
  });
  it('fills missing optional arrays with empty defaults', () => {
    const minimal = { ...validResponse, alternatives: undefined, red_flags: undefined };
    const result = parseClaudeResponse(JSON.stringify(minimal));
    expect(result.alternatives).toEqual([]);
    expect(result.red_flags).toEqual([]);
  });
  it('parses analogies and defaults to an empty array', () => {
    const withA = { ...validResponse, analogies: ['like a kitchen', 'like a switchboard'] };
    expect(parseClaudeResponse(JSON.stringify(withA)).analogies).toEqual([
      'like a kitchen',
      'like a switchboard',
    ]);
    expect(parseClaudeResponse(JSON.stringify(validResponse)).analogies).toEqual([]);
  });
  it('normalizes highlights: defaults empty, drops blanks, clamps severity/tab, caps at 4', () => {
    expect(parseClaudeResponse(JSON.stringify(validResponse)).highlights).toEqual([]);

    const withH = {
      ...validResponse,
      highlights: [
        { text: 'No CI tests', why: 'risk for prod', severity: 'risk', tab: 'red_flags' },
        { text: '', why: 'blank dropped', severity: 'insight', tab: 'eli5' },
        { text: 'Plugin API is the draw', why: 'focus here', severity: 'bogus', tab: 'nope' },
      ],
    };
    const h = parseClaudeResponse(JSON.stringify(withH)).highlights;
    expect(h.length).toBe(2);
    expect(h[0]).toEqual({ text: 'No CI tests', why: 'risk for prod', severity: 'risk', tab: 'red_flags' });
    expect(h[1].severity).toBe('insight'); // bad severity clamped
    expect(h[1].tab).toBe(''); // unknown tab cleared

    const many = {
      ...validResponse,
      highlights: Array.from({ length: 7 }, (_, i) => ({ text: `h${i}`, severity: 'insight', tab: 'eli5' })),
    };
    expect(parseClaudeResponse(JSON.stringify(many)).highlights.length).toBe(4);
  });
  it('parses tech_stack and defaults it when missing', () => {
    const withTs = {
      ...validResponse,
      tech_stack: {
        built_with: ['TypeScript'],
        key_dependencies: [{ name: 'scheduler', purpose: 'scheduling' }],
      },
    };
    expect(parseClaudeResponse(JSON.stringify(withTs)).tech_stack.built_with).toEqual(['TypeScript']);
    expect(parseClaudeResponse(JSON.stringify(validResponse)).tech_stack).toEqual({
      built_with: [],
      key_dependencies: [],
    });
  });
  it('keeps valid AI capabilities and drops unknown tags', () => {
    const withCaps = { ...validResponse, capabilities: ['ui-rendering', 'made-up-tag', 'cli'] };
    expect(parseClaudeResponse(JSON.stringify(withCaps)).capabilities).toEqual(['ui-rendering', 'cli']);
  });
  it('derives capabilities from category/eli5 when the model omits them', () => {
    const noCaps = { ...validResponse, category: 'Vector Index', eli5: 'a nearest neighbor index' };
    expect(parseClaudeResponse(JSON.stringify(noCaps)).capabilities).toContain('vector-index');
  });
  it('defaults capabilities to [] when absent and nothing derivable', () => {
    const blank = { ...validResponse, category: 'Mystery', eli5: 'nondescript', tags: [] };
    expect(parseClaudeResponse(JSON.stringify(blank)).capabilities).toEqual([]);
  });
});

describe('bottom_line field', () => {
  it('parses bottom_line when present', () => {
    const out = parseClaudeResponse(JSON.stringify({ bottom_line: 'Reach for it when X; avoid if Y.' }));
    expect(out.bottom_line).toBe('Reach for it when X; avoid if Y.');
  });
  it('defaults bottom_line to empty string when absent', () => {
    const out = parseClaudeResponse(JSON.stringify({ eli5: 'hi' }));
    expect(out.bottom_line).toBe('');
  });
});
