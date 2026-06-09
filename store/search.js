// Pure client-side ranker — the replacement for VelesDB's /search/text. No DOM, no I/O.
// Scores saved repo payloads by token overlap with a query string and returns the best matches.

const STOP = new Set(['', 'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'is']);

/** Lowercase, split on non-word chars (keeping +#. for things like c++ / c# / node.js), drop stopwords. */
export function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((t) => t && !STOP.has(t));
}

/**
 * Rank repo payloads by token overlap with `query`. Returns the matching payloads, best first.
 * Mirrors the intent of the old text search: queries are usually "<language> <category>".
 */
export function rankRepos(rows, query, { excludeId = null, topK = 3 } = {}) {
  const q = new Set(tokens(query));
  if (!q.size) return [];
  const scored = [];
  for (const r of rows) {
    if (!r || !r.repoId) continue;
    if (excludeId && r.repoId === excludeId) continue;
    const hay = new Set(
      tokens(
        [r.language, r.category, (r.tags || []).join(' '), (r.capabilities || []).join(' '), r.repoId, r.eli5].join(' ')
      )
    );
    let score = 0;
    for (const t of q) if (hay.has(t)) score++;
    if (score > 0) scored.push({ r, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.r);
}
