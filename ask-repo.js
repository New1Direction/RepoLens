// Pure helpers for Ask This Repo — build a grounded per-repo Q&A prompt from
// the current analysis payload and parse the answer. No DOM, no chrome.

const MAX_SECTION = 300;

function trunc(s, max) {
  const t = String(s || '').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

/**
 * Build a grounded Q&A prompt using the analysis data for one repo.
 * Returns '' when question or repoId are missing.
 * @param {string} question
 * @param {object} analysis
 * @param {Array<{question:string,answer:string}>} [history]
 */
export function buildAskRepoPrompt(question, analysis, history = []) {
  if (!question || !analysis?.repoId) return '';

  const a = analysis;
  const flagTexts = (a.red_flags || [])
    .map((f) => (typeof f === 'string' ? f : f?.text || ''))
    .filter(Boolean);

  const lines = [
    `You are RepoLens. Answer the question about **${a.repoId}** using ONLY the analysis data below. Be specific and cite details. 2–4 sentences unless the question clearly needs more. If the data does not contain enough information to answer, say so.`,
    '',
    `## ${a.repoId}`,
    a.description ? `Description: ${trunc(a.description, 200)}` : '',
    a.language ? `Primary language: ${a.language}` : '',
    a.license ? `License: ${a.license}` : '',
    a.stars ? `Stars: ${Number(a.stars).toLocaleString()}` : '',
    a.category ? `Category: ${a.category}` : '',
    a.eli5 ? `\nSummary: ${trunc(a.eli5, MAX_SECTION)}` : '',
    a.technical ? `\nTechnical: ${trunc(a.technical, MAX_SECTION)}` : '',
    Array.isArray(a.use_cases) && a.use_cases.length
      ? `\nUse cases: ${a.use_cases.slice(0, 5).join('; ')}`
      : '',
    Array.isArray(a.pros) && a.pros.length ? `\nPros: ${a.pros.join('; ')}` : '',
    Array.isArray(a.cons) && a.cons.length ? `\nCons: ${a.cons.join('; ')}` : '',
    flagTexts.length ? `\nRed flags: ${flagTexts.slice(0, 5).join('; ')}` : '',
    Array.isArray(a.capabilities) && a.capabilities.length
      ? `\nCapabilities: ${a.capabilities.join(', ')}`
      : '',
    a.health?.score ? `\nHealth score: ${a.health.score}/100` : '',
    a.alternatives?.length
      ? `\nAlternatives: ${a.alternatives
          .slice(0, 4)
          .map((x) => x.name || x)
          .join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const historySection = history.length
    ? `\n\n## Prior conversation\n${history.map((h) => `Q: ${h.question}\nA: ${trunc(h.answer, 200)}`).join('\n\n')}`
    : '';

  return `${lines}${historySection}\n\nQuestion: ${question}`;
}

/** Trim raw AI text — the model returns plain prose. */
export function parseAskRepoAnswer(text) {
  return String(text || '').trim();
}
