// collections.js — pure, immutable helpers for Library Collections ("Boards").
// A collection groups repos the user is evaluating together ("Our 2026 stack",
// "Eval: vector DBs"). No IndexedDB, no chrome, no DOM — the IO glue lives in
// store.js and the UI in library.js. id + timestamps are injected so this module
// is deterministic and fully unit-testable (mirrors backup.js's `exportedAt`).
//
// Shape: { id, name, color, repoIds: string[], createdAt, updatedAt }

export const COLLECTION_COLORS = [
  '#818cf8',
  '#22c55e',
  '#38bdf8',
  '#f59e0b',
  '#ef4444',
  '#c084fc',
  '#f472b6',
  '#2dd4bf',
];

const MAX_NAME = 60;

/** A color for the Nth collection, cycling the palette. */
export function nextColor(existingCount) {
  const n = Number.isFinite(existingCount) ? existingCount : 0;
  return COLLECTION_COLORS[
    ((n % COLLECTION_COLORS.length) + COLLECTION_COLORS.length) % COLLECTION_COLORS.length
  ];
}

/** Build a new, empty collection. id/color/now are injected by the caller. */
export function makeCollection(name, { id = '', color, now = '' } = {}) {
  return {
    id,
    name: String(name || '').trim(),
    color: color || COLLECTION_COLORS[0],
    repoIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Validate a proposed collection name against the existing set (case-insensitive,
 * non-empty, bounded). Returns { ok, error }.
 */
export function validateCollectionName(name, existing = []) {
  const clean = String(name || '').trim();
  if (!clean) return { ok: false, error: 'Name can’t be empty.' };
  if (clean.length > MAX_NAME) return { ok: false, error: `Name is too long (${MAX_NAME} max).` };
  const dup = (existing || []).some(
    (c) => c && typeof c.name === 'string' && c.name.trim().toLowerCase() === clean.toLowerCase()
  );
  if (dup) return { ok: false, error: 'A collection with that name already exists.' };
  return { ok: true, error: '' };
}

/** Rename a collection (immutable, trims, bumps updatedAt). */
export function renameCollection(col, name, { now } = {}) {
  return { ...col, name: String(name || '').trim(), updatedAt: now || col.updatedAt };
}

/** Does this collection hold the repo? */
export function collectionContains(col, repoId) {
  return Array.isArray(col && col.repoIds) && col.repoIds.includes(repoId);
}

/** Add a repo (immutable; a no-op returning the same ref if already present). */
export function addRepoToCollection(col, repoId, { now } = {}) {
  if (collectionContains(col, repoId)) return col;
  return { ...col, repoIds: [...(col.repoIds || []), repoId], updatedAt: now || col.updatedAt };
}

/** Remove a repo (immutable; a no-op returning the same ref if absent). */
export function removeRepoFromCollection(col, repoId, { now } = {}) {
  if (!collectionContains(col, repoId)) return col;
  return {
    ...col,
    repoIds: (col.repoIds || []).filter((id) => id !== repoId),
    updatedAt: now || col.updatedAt,
  };
}

/** Toggle a repo's membership. */
export function toggleRepoInCollection(col, repoId, opts = {}) {
  return collectionContains(col, repoId)
    ? removeRepoFromCollection(col, repoId, opts)
    : addRepoToCollection(col, repoId, opts);
}

/** Collections ordered by name (drops falsy entries), without mutating input. */
export function sortedCollections(cols) {
  return [...(cols || [])].filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** Every collection that holds the given repo. */
export function repoCollections(cols, repoId) {
  return (cols || []).filter((c) => collectionContains(c, repoId));
}
