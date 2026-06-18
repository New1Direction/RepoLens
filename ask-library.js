// Pure helpers for Ask Across My Library — build the grounded prompt and parse
// the answer. No DOM, no chrome, no I/O — fully unit-testable.

const MAX_ELI5 = 180;

function truncate(s, max) {
  const t = String(s || '').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

/**
 * Build a grounded Q&A prompt from a question and up to N ranked repo docs.
 * Each doc: { repoId, description?, category?, capabilities?, health?, eli5?, decision? }
 * Returns '' when question or docs are missing.
 */
export function buildAskPrompt(question, docs) {
  if (!question || !Array.isArray(docs) || !docs.length) return '';

  const corpus = docs
    .map((d) => {
      const lines = [`--- ${d.repoId || 'unknown'} ---`];
      if (d.description) lines.push(`Description: ${truncate(d.description, 120)}`);
      if (d.category) lines.push(`Category: ${d.category}`);
      const caps = Array.isArray(d.capabilities) && d.capabilities.length ? d.capabilities.join(', ') : null;
      if (caps) lines.push(`Capabilities: ${caps}`);
      if (d.health) lines.push(`Health: ${d.health}/100`);
      if (d.decision) lines.push(`Decision: ${d.decision}`);
      if (d.eli5) lines.push(`Summary: ${truncate(d.eli5, MAX_ELI5)}`);
      return lines.join('\n');
    })
    .join('\n\n');

  return [
    "You are RepoLens, a developer assistant. Answer the question below using ONLY the repositories listed here — these are from the user's own analyzed library. Cite repo names in your answer. Keep it to 2–4 sentences unless the question clearly needs more. If none of these repos address the question, say so briefly.",
    '',
    corpus,
    '',
    `Question: ${question}`,
  ].join('\n');
}

/** Trim the raw AI text. The model returns plain prose — no parsing needed. */
export function parseAskAnswer(text) {
  return String(text || '').trim();
}

/**
 * Build a filtering prompt that asks the AI to rank matching repo IDs for a
 * natural-language query. Returns '' when inputs are missing.
 */
export function buildFilterPrompt(question, docs) {
  if (!question || !Array.isArray(docs) || !docs.length) return '';

  const corpus = docs
    .map((d) => {
      const lines = [`--- ${d.repoId || 'unknown'} ---`];
      if (d.description) lines.push(`Description: ${truncate(d.description, 120)}`);
      if (d.category) lines.push(`Category: ${d.category}`);
      const caps = Array.isArray(d.capabilities) && d.capabilities.length ? d.capabilities.join(', ') : null;
      if (caps) lines.push(`Capabilities: ${caps}`);
      if (d.health) lines.push(`Health: ${d.health}/100`);
      if (d.decision) lines.push(`Decision: ${d.decision}`);
      if (d.eli5) lines.push(`Summary: ${truncate(d.eli5, MAX_ELI5)}`);
      return lines.join('\n');
    })
    .join('\n\n');

  return [
    "You are RepoLens filtering a user's repository library.",
    `The user wants to find: "${question}"`,
    '',
    'Return a JSON array of repoId strings (from the list below) that best match the request, sorted by relevance (most relevant first). Include only repos that clearly match. Return [] if none match. Return ONLY valid JSON — no prose, no markdown, no explanation.',
    '',
    corpus,
  ].join('\n');
}

/**
 * Parse the raw AI filter response into an array of repoId strings.
 * Returns [] on any parsing failure.
 */
export function parseFilterResult(text) {
  const s = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    return [];
  }
}
