// Pure helpers for AI-powered repo comparison — no DOM, no chrome, fully testable.

const MAX = 200;

function trunc(s, n) {
  const t = String(s || '').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function repoSection(label, a) {
  const lines = [
    `## ${label}: ${a.repoId}`,
    a.description ? `Description: ${trunc(a.description, MAX)}` : '',
    a.language    ? `Language: ${a.language}`                    : '',
    a.license     ? `License: ${a.license}`                      : '',
    a.stars       ? `Stars: ${Number(a.stars).toLocaleString()}` : '',
    a.category    ? `Category: ${a.category}`                    : '',
    (a.health?.score ?? a.health) ? `Health: ${a.health?.score ?? a.health}/100` : '',
    Array.isArray(a.capabilities) && a.capabilities.length
      ? `Capabilities: ${a.capabilities.join(', ')}`
      : '',
    Array.isArray(a.pros) && a.pros.length
      ? `Pros: ${a.pros.slice(0, 4).join('; ')}`
      : '',
    Array.isArray(a.cons) && a.cons.length
      ? `Cons: ${a.cons.slice(0, 3).join('; ')}`
      : '',
    a.eli5 ? `Summary: ${trunc(a.eli5, MAX)}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

/**
 * Build a head-to-head comparison prompt for two repo analysis objects.
 * Returns '' when either analysis is missing a repoId.
 */
export function buildComparePrompt(a, b) {
  if (!a?.repoId || !b?.repoId) return '';

  return [
    'You are RepoLens comparing two open-source repositories head-to-head.',
    'Use ONLY the data below — do not guess or hallucinate.',
    '',
    repoSection('A', a),
    '',
    repoSection('B', b),
    '',
    'Compare these two repositories. Return valid JSON (no markdown fences) with exactly these fields:',
    '{',
    '  "winner": "a" | "b" | "tie",',
    '  "reason": "one sentence explaining why the winner wins, or why it is a tie",',
    '  "verdict": "2–3 sentence overall comparison",',
    '  "pickA": "who should choose A — one short phrase (e.g. \'teams that need X\')",',
    '  "pickB": "who should choose B — one short phrase",',
    '  "tradeoffs": ["key tradeoff 1", "key tradeoff 2", "key tradeoff 3"]',
    '}',
  ].join('\n');
}

/**
 * Parse the raw AI response into a structured compare result.
 * Returns null if parsing fails.
 */
export function parseCompareResult(text) {
  const s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const obj = JSON.parse(s);
    if (!obj || typeof obj !== 'object') return null;
    return {
      winner:    ['a', 'b', 'tie'].includes(obj.winner) ? obj.winner : 'tie',
      reason:    String(obj.reason   || '').trim(),
      verdict:   String(obj.verdict  || '').trim(),
      pickA:     String(obj.pickA    || '').trim(),
      pickB:     String(obj.pickB    || '').trim(),
      tradeoffs: Array.isArray(obj.tradeoffs) ? obj.tradeoffs.map((t) => String(t).trim()).filter(Boolean) : [],
    };
  } catch {
    return null;
  }
}
