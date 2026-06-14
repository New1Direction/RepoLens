// Pure helpers for "Fits MY Stack?" — library-grounded one-call AI lens.
// No DOM, no chrome APIs, unit-testable.

export const FITS_VERDICTS = ['slots-in', 'new-paradigm', 'conflict'];

/**
 * Build the prompt asking whether the repo slots into the user's existing stack.
 * nearestRepos: [{ repoId, eli5, capabilities }] — top matches from the library.
 */
export function buildFitsStackPrompt(repoData, nearestRepos) {
  if (!repoData?.repoId || !Array.isArray(nearestRepos) || nearestRepos.length === 0) return '';

  const repoBlock = [
    `Repo being evaluated: ${repoData.repoId}`,
    repoData.description ? `What it does: ${repoData.description}` : '',
    repoData.language ? `Language: ${repoData.language}` : '',
    repoData.category ? `Category: ${repoData.category}` : '',
    repoData.capabilities?.length ? `Capabilities: ${repoData.capabilities.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const libBlock = nearestRepos.map(r =>
    `- ${r.repoId}${r.eli5 ? ': ' + r.eli5.slice(0, 100) : ''}${r.capabilities?.length ? ' [' + r.capabilities.slice(0, 4).join(', ') + ']' : ''}`
  ).join('\n');

  return `You are a senior software architect helping a developer decide whether a new repo fits their existing tech stack.

${repoBlock}

Their current stack (most relevant repos):
${libBlock}

Assess whether this repo:
- slots-in: fills a gap and is complementary to the existing tools
- new-paradigm: could replace something or requires a significant mental model shift
- conflict: creates conceptual or practical friction with what they already use

Return a single JSON object:
{
  "verdict": "slots-in" | "new-paradigm" | "conflict",
  "summary": "2-3 sentence explanation",
  "integrations": ["how it interacts with existing tool"],
  "risks": ["friction or concern"],
  "recommendation": "One clear action sentence"
}`;
}

/**
 * Parse the AI response into a structured result.
 * Falls back to a 'new-paradigm' verdict if parsing fails.
 */
export function parseFitsStack(rawText) {
  if (!rawText) return null;
  const m = String(rawText).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const r = JSON.parse(m[0]);
    return {
      verdict: FITS_VERDICTS.includes(r.verdict) ? r.verdict : 'new-paradigm',
      summary: String(r.summary || '').trim(),
      integrations: Array.isArray(r.integrations) ? r.integrations.map(String) : [],
      risks: Array.isArray(r.risks) ? r.risks.map(String) : [],
      recommendation: String(r.recommendation || '').trim(),
    };
  } catch {
    return null;
  }
}
