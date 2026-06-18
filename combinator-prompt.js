// Synthesis step for the Combinator: given 2–3 repos, invent ONE fused project and
// self-score it. Pure string/parse functions (mirrors synergies.js / versus.js).

export function buildCombinatorPrompt(repos) {
  const block = repos
    .map((r) => `- ${r.repoId} [${(r.capabilities || []).join(', ')}]: ${r.eli5 || ''}`)
    .join('\n');

  return `Invent ONE concrete project that fuses these repositories into something none of them is alone. Be specific and buildable — name what each one actually contributes. Reward genuine novelty, but stay grounded: it should be something a capable team could start this week.

${block}

Return ONLY a valid JSON object. No markdown fences, no explanation — raw JSON only.
{
  "title": "Short, memorable product name.",
  "pitch": "One vivid sentence: what you'd build and why this combination is new.",
  "contributions": [ { "repoId": "owner/name", "role": "What this repo provides in the combo." } ],
  "novelty": 0,
  "feasibility": 0,
  "first_step": "The single most concrete first thing to build."
}`;
}

export function parseCombinator(rawText, inputRepoIds = []) {
  const text = String(rawText)
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = text.indexOf('{'),
    end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in combinator response');
  const data = JSON.parse(text.slice(start, end + 1));
  const clamp = (n) => Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  const idset = new Set(inputRepoIds);
  return {
    title: String(data.title ?? ''),
    pitch: String(data.pitch ?? ''),
    contributions: Array.isArray(data.contributions)
      ? data.contributions
          .filter((c) => c && idset.has(c.repoId))
          .map((c) => ({ repoId: c.repoId, role: String(c.role ?? '') }))
      : [],
    novelty: clamp(data.novelty),
    feasibility: clamp(data.feasibility),
    first_step: String(data.first_step ?? ''),
  };
}
