// Synergies — complementary repos that work WELL TOGETHER with the scanned one
// (not alternatives — things you'd use alongside it). Grounded in the user's
// library: candidate repos are pulled from the library, then one AI call
// identifies the real pairings and suggests a few notable complements.

import { extractJsonObject } from './deepdive.js';

export function buildSynergiesPrompt(repoData, candidates) {
  const lib = candidates.length
    ? candidates.map(c => `- ${c.repoId}${c.category ? ` (${c.category})` : ''}: ${c.eli5 || ''}`).join('\n')
    : '(the user has not saved many repos yet)';

  return `Find COMPLEMENTARY repositories that work WELL TOGETHER with ${repoData.repoId} — tools you'd reach for ALONGSIDE it, not alternatives that replace it.

Target repo: ${repoData.repoId}
What it is: ${repoData.eli5 || repoData.description || '—'}
Category: ${repoData.category || '?'} · Language: ${repoData.language || '?'}

Repos already in the user's saved library (prefer these where they genuinely pair):
${lib}

Identify 4–8 synergies. For each: the repo (use a library repoId when it fits, otherwise suggest a well-known complementary tool), its role/category, how it pairs with the target (the synergy — what the combination unlocks), and whether it's already in the user's library.

Return ONLY valid JSON, no markdown fences:
{
  "synergies": [
    { "repoId": "owner/name or tool name", "category": "e.g. State management", "synergy": "How they pair and what the combo unlocks.", "in_library": true }
  ]
}`;
}

const arr = (v) => (Array.isArray(v) ? v : []);

export function parseSynergies(rawText) {
  const d = extractJsonObject(rawText);
  return {
    synergies: arr(d.synergies).map(s => ({
      repoId: s.repoId || '',
      category: s.category || '',
      synergy: s.synergy || '',
      in_library: s.in_library === true,
    })),
  };
}
