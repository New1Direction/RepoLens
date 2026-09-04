import { describe, expect, it } from 'vitest';

import { parseGoalResponse } from '../mcp/evaluate-for-goal.js';
import { assertPublicUrl, parseProductResponse } from '../mcp/analyze-product.js';

describe('evaluate_for_goal parsing', () => {
  it('normalizes a decision-grade response', () => {
    const parsed = parseGoalResponse(
      JSON.stringify({
        decision: 'adopt',
        fit_score: 91,
        confidence: 'high',
        bottom_line: 'Strong fit.',
        blockers: ['One migration detail'],
        integration_cost: 'low',
        replacement_cost: 'medium',
        dependency_risk: 'low',
        evidence: [{ claim: 'Small API surface', source: 'base_scan', verified: false }],
        trial_plan: ['Wire one endpoint', 'Run a failure test'],
      })
    );

    expect(parsed.decision).toBe('adopt');
    expect(parsed.fit_score).toBe(91);
    expect(parsed.confidence).toBe('high');
    expect(parsed.integration_cost).toBe('low');
    expect(parsed.trial_plan).toHaveLength(2);
  });

  it('fails closed to conservative normalized values for unknown enums', () => {
    const parsed = parseGoalResponse(
      JSON.stringify({
        decision: 'YOLO',
        fit_score: 999,
        confidence: 'certain',
        integration_cost: 'tiny',
      })
    );

    expect(parsed.decision).toBe('trial');
    expect(parsed.fit_score).toBe(100);
    expect(parsed.confidence).toBe('low');
    expect(parsed.integration_cost).toBe('unknown');
  });
});

describe('analyze_product parsing', () => {
  it('keeps website claims explicitly structured', () => {
    const parsed = parseProductResponse(
      JSON.stringify({
        product_model: 'Fees become compute credits.',
        core_loop: ['trade', 'credit', 'claim'],
        dependencies: ['chain', 'model provider'],
        strengths: ['simple loop'],
        critical_systems: ['accounting'],
        failure_modes: ['double claim'],
        claims: [
          {
            claim: 'Credits are proportional to fees',
            website_evidence: 'The product page says so',
            verification_status: 'website_only',
            needs: ['accounting', 'code'],
            confidence: 'medium',
          },
        ],
        verdict: 'Interesting, but source verification is required.',
        confidence: 'medium',
      })
    );

    expect(parsed.claims[0].verification_status).toBe('website_only');
    expect(parsed.critical_systems).toEqual(['accounting']);
    expect(parsed.confidence).toBe('medium');
  });
});

describe('analyze_product URL boundary', () => {
  it.each([
    'http://127.0.0.1/admin',
    'http://10.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://192.168.1.1/',
    'http://[::1]/',
  ])('rejects private address %s', async (url) => {
    await expect(assertPublicUrl(url)).rejects.toThrow('public hosts');
  });

  it('rejects embedded credentials before fetching', async () => {
    await expect(assertPublicUrl('https://user:pass@example.com/')).rejects.toThrow('embedded credentials');
  });
});
