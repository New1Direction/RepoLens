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

  const corpus = docs.map((d) => {
    const lines = [`--- ${d.repoId || 'unknown'} ---`];
    if (d.description) lines.push(`Description: ${truncate(d.description, 120)}`);
    if (d.category) lines.push(`Category: ${d.category}`);
    const caps = Array.isArray(d.capabilities) && d.capabilities.length ? d.capabilities.join(', ') : null;
    if (caps) lines.push(`Capabilities: ${caps}`);
    if (d.health) lines.push(`Health: ${d.health}/100`);
    if (d.decision) lines.push(`Decision: ${d.decision}`);
    if (d.eli5) lines.push(`Summary: ${truncate(d.eli5, MAX_ELI5)}`);
    return lines.join('\n');
  }).join('\n\n');

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
