// Versus — head-to-head comparison of two repos. Side A is the scanned repo;
// side B is a competitor (typed, or picked from your library). One AI
// call produces a decision-oriented comparison. Reuses Deep Dive's extractor.

import { extractJsonObject } from './deepdive.js';

export function buildVersusPrompt(a, b) {
  const block = (r) => `${r.repoId}
Description: ${r.description || '—'} · Language: ${r.language || 'Unknown'} · Stars: ${r.stars ?? '?'}
README (excerpt):
${(r.readme || '(none)').slice(0, 2000)}`;

  return `Compare these two repositories HEAD-TO-HEAD for a developer deciding between them. Be honest and specific — no "it depends" cop-outs.

=== Repo A ===
${block(a)}

=== Repo B ===
${block(b)}

Compare across 4–6 decision dimensions (e.g. maturity, ecosystem, performance, learning curve, flexibility, ideal fit). For each dimension give A's position, B's position, and who wins it (a / b / tie). Then say when to pick each, and a final verdict that names the single deciding factor.

Return ONLY valid JSON, no markdown fences:
{
  "summary_a": "One line characterizing A.",
  "summary_b": "One line characterizing B.",
  "dimensions": [ { "label": "Maturity", "a": "A's position.", "b": "B's position.", "winner": "a|b|tie" } ],
  "pick_a_when": ["A concrete reason to choose A."],
  "pick_b_when": ["A concrete reason to choose B."],
  "verdict": "Overall recommendation and the deciding factor."
}`;
}

const arr = (v) => (Array.isArray(v) ? v : []);

export function parseVersus(rawText) {
  const d = extractJsonObject(rawText);
  return {
    summary_a: d.summary_a || '',
    summary_b: d.summary_b || '',
    dimensions: arr(d.dimensions).map((x) => ({
      label: x.label || '',
      a: x.a || '',
      b: x.b || '',
      winner: ['a', 'b', 'tie'].includes(x.winner) ? x.winner : 'tie',
    })),
    pick_a_when: arr(d.pick_a_when).map(String),
    pick_b_when: arr(d.pick_b_when).map(String),
    verdict: d.verdict || '',
  };
}
