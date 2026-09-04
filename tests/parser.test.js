import { describe, it, expect } from 'vitest';
import { parseClaudeResponse } from '../src/parser.js';

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

  it('rejects a comma-separated JSON fragment sequence', () => {
    const fragment = '{"name":"reshade","purpose":"hooking"},{"name":"imgui","purpose":"UI"}';
    expect(() => parseClaudeResponse(fragment)).toThrow(/Failed to parse Claude response/);
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
  it('parses actionable verdict fields and clamps invalid enum values', () => {
    const withAction = {
      ...validResponse,
      recommendation: {
        action: 'trial',
        title: 'Run a spike',
        rationale: 'Good fit but verify setup.',
        next: 'Run the quickstart.',
      },
      confidence: { level: 'medium', reason: 'README is detailed but no local source scan yet.' },
      evidence: [
        { claim: 'Has a focused API', why: 'Lowers integration risk.', type: 'strength' },
        { claim: 'Weak docs', why: 'Raises trial cost.', type: 'bogus' },
      ],
      action_plan: {
        goal: 'Know if it fits the stack.',
        steps: [{ time: '10 min', title: 'Install', action: 'Run quickstart', success: 'Demo boots' }],
        validation_checklist: ['Check test coverage'],
        questions: ['Who owns this?'],
      },
    };
    const out = parseClaudeResponse(JSON.stringify(withAction));
    expect(out.recommendation.action).toBe('trial');
    expect(out.confidence.level).toBe('medium');
    expect(out.evidence[1].type).toBe('fit');
    expect(out.action_plan.steps[0].success).toBe('Demo boots');

    const bad = parseClaudeResponse(
      JSON.stringify({ recommendation: { action: 'ship-it' }, confidence: { level: 'certain' } })
    );
    expect(bad.recommendation.action).toBe('');
    expect(bad.confidence.level).toBe('');
    expect(bad.action_plan.steps).toEqual([]);
  });
  it('parses structured judgment fields with safe defaults', () => {
    const withStructured = {
      ...validResponse,
      mental_model: {
        kind: 'library',
        stack_role: 'Runtime UI primitive',
        inputs: ['component props'],
        outputs: ['rendered DOM'],
        core_abstractions: ['component', 'state'],
        extension_points: ['plugins'],
        hidden_assumptions: ['browser runtime'],
        failure_boundaries: ['hydration'],
      },
      risk_register: [
        {
          risk: 'Weak maintenance',
          probability: 'high',
          impact: 'medium',
          evidence: 'Few commits',
          mitigation: 'Pin version',
          validate: 'Check release cadence',
        },
        { risk: 'Unknown ecosystem', probability: 'certain', impact: 'catastrophic' },
      ],
      adoption_simulation: {
        day_1: 'Install',
        week_1: 'Debug edges',
        month_1: 'Own upgrades',
        exit_cost: 'Moderate',
      },
      learning_path: [{ concept: 'State machine', why: 'Core model', exercise: 'Trace one transition' }],
    };
    const out = parseClaudeResponse(JSON.stringify(withStructured));
    expect(out.mental_model.kind).toBe('library');
    expect(out.mental_model.core_abstractions).toEqual(['component', 'state']);
    expect(out.risk_register[0]).toMatchObject({ risk: 'Weak maintenance', probability: 'high' });
    expect(out.risk_register[1]).toMatchObject({ probability: 'medium', impact: 'medium' });
    expect(out.adoption_simulation.exit_cost).toBe('Moderate');
    expect(out.learning_path[0].exercise).toBe('Trace one transition');

    const defaults = parseClaudeResponse(JSON.stringify(validResponse));
    expect(defaults.mental_model.core_abstractions).toEqual([]);
    expect(defaults.risk_register).toEqual([]);
    expect(defaults.learning_path).toEqual([]);
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
