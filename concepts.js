// concepts.js
// Pure concept model for the Knowledge Graph. Indexes deep-dive atoms across the
// library and links repos by shared concepts. No DOM/network/AI — the embedding
// VECTORS are produced in background.js (when the provider supports it); this
// module only does the math/matching, so it stays fully unit-testable.

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'for', 'to', 'in', 'on', 'with', 'is', 'it', 'its', 'that', 'this', 'layer', 'module', 'system', 'core']);

/** Canonical lexical key for an atom (lowercase, strip punctuation, drop stopwords). */
export function normalizeConcept(atom) {
  const raw = ((atom && (atom.name || atom.id)) || '').toLowerCase();
  const tokens = raw.replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter((t) => t && !STOPWORDS.has(t));
  return tokens.join('-');
}

/** Cosine similarity of two equal-length numeric vectors; 0 for empty/mismatched. */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export const EMBED_THRESHOLD = 0.82;

const keysOf = (rec) => new Set(((rec && rec.atoms) || []).map(normalizeConcept).filter(Boolean));

/** Lexical concept → repos index. */
export function conceptIndex(records) {
  const idx = {};
  for (const rec of Object.values(records || {})) {
    if (!rec || !rec.repoId) continue;
    for (const k of keysOf(rec)) (idx[k] ||= []).push(rec.repoId);
  }
  return idx;
}

/** Lexical matcher: link repos sharing >=1 normalized concept key. */
export function lexicalMatcher(records) {
  const recs = Object.values(records || {}).filter((r) => r && r.repoId);
  const links = [];
  for (let i = 0; i < recs.length; i++) {
    for (let j = i + 1; j < recs.length; j++) {
      const ka = keysOf(recs[i]);
      const shared = [...keysOf(recs[j])].filter((k) => ka.has(k));
      if (shared.length) links.push({ a: recs[i].repoId, b: recs[j].repoId, shared, score: shared.length });
    }
  }
  return links;
}

/** Best cross-repo atom-pair match by cosine; { score, label } if >= threshold, else null. */
export function bestEmbeddingMatch(recA, recB, threshold = EMBED_THRESHOLD) {
  const va = recA && recA.vectors, vb = recB && recB.vectors;
  if (!Array.isArray(va) || !Array.isArray(vb) || !va.length || !vb.length) return null;
  let best = { score: 0, label: null };
  for (let i = 0; i < va.length; i++) {
    for (let j = 0; j < vb.length; j++) {
      const s = cosineSimilarity(va[i], vb[j]);
      if (s > best.score) best = { score: s, label: `${recA.atoms[i]?.name} ~ ${recB.atoms[j]?.name}` };
    }
  }
  return best.score >= threshold ? best : null;
}

/**
 * Link repos by shared concepts. Per-pair hybrid: when BOTH repos have vectors,
 * use the embedding matcher; otherwise lexical for that pair.
 * @returns {{a:string,b:string,shared:string[],score:number}[]}
 */
export function deriveConceptLinks(records, { threshold = EMBED_THRESHOLD } = {}) {
  const recs = Object.values(records || {}).filter((r) => r && r.repoId);
  const links = [];
  for (let i = 0; i < recs.length; i++) {
    for (let j = i + 1; j < recs.length; j++) {
      const a = recs[i], b = recs[j];
      const bothVec = Array.isArray(a.vectors) && a.vectors.length && Array.isArray(b.vectors) && b.vectors.length;
      if (bothVec) {
        const m = bestEmbeddingMatch(a, b, threshold);
        if (m) links.push({ a: a.repoId, b: b.repoId, shared: [m.label], score: m.score });
      } else {
        const ka = keysOf(a);
        const shared = [...keysOf(b)].filter((k) => ka.has(k));
        if (shared.length) links.push({ a: a.repoId, b: b.repoId, shared, score: shared.length });
      }
    }
  }
  return links;
}
