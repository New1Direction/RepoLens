// SKTPG — "Skate Where The Puck Is Going." A one-tap directional-intelligence
// skill (github.com/New1Direction/SKTPG) run on the repo: base-rate anchoring,
// weak-signal detection, hype-vs-motion, bottleneck shift, 6–18mo forecast,
// pre-mortem, tracking signals, a 0–100 score, and a final thesis. One AI call.
// On by default (see SKTPG_DEFAULT_ENABLED); reuses Deep Dive's JSON extractor.

import { extractJsonObject } from './deepdive.js';

export const SKTPG_DEFAULT_ENABLED = true;
export const SKTPG_BANDS = ['Noise', 'Interesting', 'Watchlist', 'Actionable', 'Urgent'];

function sourceContext(repoData, source) {
  const tree = source?.tree?.length
    ? `File tree (truncated):\n${source.tree.join('\n')}`
    : '(no file tree — work from the README + description)';
  const files = source?.files?.length
    ? source.files.map((f) => `=== ${f.path} ===\n${f.content}`).join('\n\n')
    : '(no source files available)';
  return `Repository: ${repoData.repoId}
Description: ${repoData.description || '—'}
Language: ${repoData.language || 'Unknown'}

${tree}

Key source files:
${files}`;
}

export function buildSktpgPrompt(repoData, source) {
  return `${sourceContext(repoData, source)}

Apply the SKTPG protocol ("Skate Where The Puck Is Going") to this repository. Do NOT summarize what it is — answer what it is BECOMING, what it forces next, what that unlocks, and what to do before the market sees it.

Reason through this chain: outside-view base rate → weak signals → hype vs real motion → bottleneck shift → 6–18 month forecast → what becomes obvious later → action map → pre-mortem (argue the bear case as hard as the bull case) → tracking signals → thesis.

Rules:
- Outside view FIRST: anchor on how often things of this reference class actually pan out; the default prior is usually low. Signals adjust the prior, they don't override a bad base rate.
- Classify evidence as one of: Confirmed, Likely, Speculative, Contradicted, Unknown.
- The pre-mortem must bite: list real kill-paths. If 2+ high-likelihood kill-paths are unaddressed, cap the score.
- Use directional language ("the evidence suggests…", "this becomes interesting if…"), never "this will definitely / guaranteed / the future".
- Score 0–100 and assign a band: Noise (0–20), Interesting (21–40), Watchlist (41–60), Actionable (61–80), Urgent (81–100).

Return ONLY valid JSON, no markdown fences:
{
  "thesis": { "becoming": "This is becoming…", "forced_next": "The forced next move is…", "opportunity": "The non-obvious opportunity is…", "before_consensus": "The thing to do before consensus is…", "wrong_if": "The forecast is wrong if…" },
  "score": { "value": 0, "band": "Noise|Interesting|Watchlist|Actionable|Urgent" },
  "base_rate": { "reference_class": "The honest comparison set.", "rate": "e.g. ~15% become what the bull case claims", "cause_of_death": "How things in this class normally die.", "prior": "low|moderate|high", "evidence": "Confirmed|Likely|Speculative|Contradicted|Unknown" },
  "weak_signals": [ { "signal": "…", "why": "Why it matters.", "evidence": "Likely", "forces_next": "What it may force." } ],
  "hype_vs_motion": [ { "claim": "A narrative claim.", "verdict": "Hype|Motion|Mixed", "evidence": "Why." } ],
  "bottleneck": { "current": "The bottleneck limiting adoption now.", "weakening": "What's weakening it.", "next": "The next bottleneck if it succeeds.", "who_profits": "Who profits from solving that next one." },
  "forecast": { "base": "Base case.", "bull": "Bull case.", "bear": "Bear case.", "wildcard": "The surprising event that changes the trajectory." },
  "becomes_obvious": ["What becomes obvious 6–18 months out that's non-obvious today."],
  "actions": [ { "action": "…", "timeframe": "24h|7d|30d|pre-consensus", "why_now": "Why now." } ],
  "premortem": [ { "kill_path": "A concrete failure mechanism.", "likelihood": "low|moderate|high", "survives": false } ],
  "tracking": [ { "signal": "What to watch.", "flag": "green|yellow|red", "why": "Why it matters." } ]
}`;
}

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' ? v : {});
const EVIDENCE = new Set(['Confirmed', 'Likely', 'Speculative', 'Contradicted', 'Unknown']);
const FLAGS = new Set(['green', 'yellow', 'red']);

function evidence(v) {
  return EVIDENCE.has(v) ? v : 'Unknown';
}

export function parseSktpg(rawText) {
  const d = extractJsonObject(rawText);
  const t = obj(d.thesis),
    s = obj(d.score),
    b = obj(d.base_rate),
    bn = obj(d.bottleneck),
    fc = obj(d.forecast);
  let value = Number(s.value);
  if (!Number.isFinite(value)) value = 0;
  value = Math.max(0, Math.min(100, Math.round(value)));
  const band = SKTPG_BANDS.includes(s.band) ? s.band : SKTPG_BANDS[Math.min(4, Math.floor(value / 20.0001))];

  return {
    thesis: {
      becoming: t.becoming || '',
      forced_next: t.forced_next || '',
      opportunity: t.opportunity || '',
      before_consensus: t.before_consensus || '',
      wrong_if: t.wrong_if || '',
    },
    score: { value, band },
    base_rate: {
      reference_class: b.reference_class || '',
      rate: b.rate || '',
      cause_of_death: b.cause_of_death || '',
      prior: b.prior || 'low',
      evidence: evidence(b.evidence),
    },
    weak_signals: arr(d.weak_signals).map((w) => ({
      signal: w.signal || '',
      why: w.why || '',
      evidence: evidence(w.evidence),
      forces_next: w.forces_next || '',
    })),
    hype_vs_motion: arr(d.hype_vs_motion).map((h) => ({
      claim: h.claim || '',
      verdict: h.verdict || 'Mixed',
      evidence: h.evidence || '',
    })),
    bottleneck: {
      current: bn.current || '',
      weakening: bn.weakening || '',
      next: bn.next || '',
      who_profits: bn.who_profits || '',
    },
    forecast: { base: fc.base || '', bull: fc.bull || '', bear: fc.bear || '', wildcard: fc.wildcard || '' },
    becomes_obvious: arr(d.becomes_obvious).map(String),
    actions: arr(d.actions).map((a) => ({
      action: a.action || '',
      timeframe: a.timeframe || '',
      why_now: a.why_now || '',
    })),
    premortem: arr(d.premortem).map((p) => ({
      kill_path: p.kill_path || '',
      likelihood: p.likelihood || 'moderate',
      survives: p.survives === true,
    })),
    tracking: arr(d.tracking).map((t2) => ({
      signal: t2.signal || '',
      flag: FLAGS.has(t2.flag) ? t2.flag : 'yellow',
      why: t2.why || '',
    })),
  };
}
