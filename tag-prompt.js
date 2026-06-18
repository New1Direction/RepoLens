// A focused prompt that (re)tags a saved repo with capabilities from the controlled
// taxonomy — used by the in-extension library backfill. Pure build + parse.
import { TAXONOMY, normalizeCapabilities } from './taxonomy.js';

export function buildTagPrompt(meta) {
  const tagList = Object.values(TAXONOMY).flat().join(', ');
  return `Tag what this software project DOES with 2–5 capability labels chosen ONLY from this list (use the closest fits, "other" if none apply): ${tagList}.

Project: ${meta.repoId || ''}
Category: ${meta.category || '—'}
What it is: ${meta.eli5 || meta.compare_hooks || '—'}

Return ONLY a JSON object, no prose: { "capabilities": ["tag", "tag"] }`;
}

export function parseTags(rawText) {
  const text = String(rawText)
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = text.indexOf('{'),
    end = text.lastIndexOf('}');
  let data = {};
  if (start !== -1 && end !== -1) {
    try {
      data = JSON.parse(text.slice(start, end + 1));
    } catch {
      data = {};
    }
  }
  return normalizeCapabilities(data.capabilities);
}
