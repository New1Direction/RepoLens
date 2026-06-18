import { describe, it, expect } from 'vitest';
import { buildSktpgPrompt, parseSktpg, SKTPG_DEFAULT_ENABLED, SKTPG_BANDS } from '../sktpg.js';

const repo = { repoId: 'facebook/react', description: 'UI lib', language: 'JavaScript' };
const source = { tree: ['src/index.js'], files: [{ path: 'src/index.js', content: 'export const x=1' }] };

describe('SKTPG constants', () => {
  it('is enabled by default', () => {
    expect(SKTPG_DEFAULT_ENABLED).toBe(true);
  });
  it('has the five score bands', () => {
    expect(SKTPG_BANDS).toEqual(['Noise', 'Interesting', 'Watchlist', 'Actionable', 'Urgent']);
  });
});

describe('buildSktpgPrompt', () => {
  it('includes repo + source and the SKTPG protocol + JSON schema', () => {
    const p = buildSktpgPrompt(repo, source);
    expect(p).toContain('facebook/react');
    expect(p).toContain('src/index.js');
    expect(p).toContain('SKTPG');
    expect(p).toMatch(/base rate/i);
    expect(p).toMatch(/pre-mortem/i);
    expect(p).toMatch(/"thesis"/);
    expect(p).toMatch(/"score"/);
  });
});

describe('parseSktpg', () => {
  it('parses a full read and normalizes evidence + flags', () => {
    const raw = `\`\`\`json
{
  "thesis": { "becoming": "infra", "forced_next": "x", "opportunity": "y", "before_consensus": "z", "wrong_if": "w" },
  "score": { "value": 72, "band": "Actionable" },
  "base_rate": { "reference_class": "OSS agent frameworks", "rate": "~15%", "cause_of_death": "feature not product", "prior": "low", "evidence": "Likely" },
  "weak_signals": [ { "signal": "builders adopting", "why": "early", "evidence": "Confirmed", "forces_next": "tooling" } ],
  "hype_vs_motion": [ { "claim": "agentic", "verdict": "Hype", "evidence": "no usage" } ],
  "bottleneck": { "current": "setup", "weakening": "templates", "next": "trust", "who_profits": "verifiers" },
  "forecast": { "base": "b", "bull": "bu", "bear": "be", "wildcard": "wc" },
  "becomes_obvious": ["it was distribution"],
  "actions": [ { "action": "clone it", "timeframe": "24h", "why_now": "cheap" } ],
  "premortem": [ { "kill_path": "incumbent bundles", "likelihood": "high", "survives": false } ],
  "tracking": [ { "signal": "retention", "flag": "green", "why": "real use" } ]
}
\`\`\``;
    const r = parseSktpg(raw);
    expect(r.thesis.becoming).toBe('infra');
    expect(r.score.value).toBe(72);
    expect(r.score.band).toBe('Actionable');
    expect(r.weak_signals[0].evidence).toBe('Confirmed');
    expect(r.premortem[0].survives).toBe(false);
    expect(r.tracking[0].flag).toBe('green');
  });

  it('clamps the score and derives a band when missing, and defaults bad enums', () => {
    const r = parseSktpg(
      '{"score":{"value":250},"weak_signals":[{"signal":"s","evidence":"bogus"}],"tracking":[{"signal":"t","flag":"purple"}]}'
    );
    expect(r.score.value).toBe(100); // clamped
    expect(r.score.band).toBe('Urgent'); // derived from value
    expect(r.weak_signals[0].evidence).toBe('Unknown'); // bad enum → default
    expect(r.tracking[0].flag).toBe('yellow'); // bad flag → default
  });

  it('defaults to empty structures on a sparse object', () => {
    const r = parseSktpg('{}');
    expect(r.score.value).toBe(0);
    expect(r.score.band).toBe('Noise');
    expect(r.weak_signals).toEqual([]);
    expect(r.thesis.becoming).toBe('');
  });
});
