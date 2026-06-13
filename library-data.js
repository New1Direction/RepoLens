// Pure helpers for the Library Home triage grid: turn a saved analysis payload into a row,
// and sort/filter rows. No DOM, no chrome — unit-tested.

import { deriveFit, firstSentence } from './verdict.js';

/** A saved analysis payload → a compact library row (fit chip, health, category, caps, langs).
 * Accepts both store payloads (saved_at) and local-cache analyses (cachedAt, unix ms). */
export function libraryRow(payload) {
  const p = payload || {};
  const repoId = p.repoId || '';
  // Only repos saved with the triage fields can get a real fit verdict; older/trimmed
  // payloads are "Unrated" rather than a misleading default.
  const hasTriage = !!(
    (p.health && p.health.score) ||
    (p.red_flags && p.red_flags.length) ||
    (p.pros && p.pros.length) ||
    (p.cons && p.cons.length)
  );
  return {
    repoId,
    name: repoId.split('/').pop() || repoId,
    platform: p.platform || '',
    fit: hasTriage ? deriveFit(p) : { level: 'unrated', label: 'Unrated', why: 'Re-scan for a fit verdict' },
    health: p.health?.score ?? 0,
    category: p.category || '',
    capabilities: Array.isArray(p.capabilities) ? p.capabilities : [],
    languages: (p.languages || []).slice(0, 3),
    blurb: p.description || firstSentence(p.eli5) || '',
    savedAt: p.saved_at || (p.cachedAt ? new Date(p.cachedAt).toISOString() : ''),
  };
}

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR, MONTH = 30 * DAY, YEAR = 365 * DAY;

/**
 * Compact "scanned N ago" label from an ISO timestamp. `now` is injectable for
 * deterministic tests. Returns '' for missing/unparseable input; future stamps
 * (clock skew) clamp to "just now" rather than showing a negative age.
 */
export function relativeTime(iso, now = Date.now()) {
  const t = Date.parse(iso || '');
  if (Number.isNaN(t)) return '';
  const ms = now - t;
  if (ms < MIN) return 'just now';
  if (ms < HOUR) return `${Math.floor(ms / MIN)}m ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`;
  if (ms < MONTH) return `${Math.floor(ms / DAY)}d ago`;
  if (ms < YEAR) return `${Math.floor(ms / MONTH)}mo ago`;
  return `${Math.floor(ms / YEAR)}y ago`;
}

const FIT_RANK = { strong: 0, solid: 1, care: 2, risky: 3, unrated: 4 };

/** Return a NEW sorted array. by: 'fit' (default) | 'health' | 'name'. */
export function sortRows(rows, by) {
  const r = [...rows];
  if (by === 'health') {
    return r.sort((a, b) => b.health - a.health || a.name.localeCompare(b.name));
  }
  if (by === 'name') {
    return r.sort((a, b) => a.repoId.localeCompare(b.repoId));
  }
  // 'fit': strong → risky, then health desc, then name
  return r.sort(
    (a, b) =>
      (FIT_RANK[a.fit.level] ?? 9) - (FIT_RANK[b.fit.level] ?? 9) ||
      b.health - a.health ||
      a.name.localeCompare(b.name)
  );
}

export function filterRows(rows, { query = '', capability = '' } = {}) {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (q && !row.repoId.toLowerCase().includes(q)) return false;
    if (capability && !row.capabilities.includes(capability)) return false;
    return true;
  });
}

/** Aggregate counts for the Library stats bar. Pure — tallies rows by fit level
 * and the mean health of the rows that actually carry one. */
const FIT_LEVELS = ['strong', 'solid', 'care', 'risky', 'unrated'];

export function libraryStats(rows) {
  const list = rows || [];
  const byFit = { strong: 0, solid: 0, care: 0, risky: 0, unrated: 0 };
  let healthSum = 0, healthCount = 0;
  for (const r of list) {
    const level = r.fit?.level;
    const key = FIT_LEVELS.includes(level) ? level : 'unrated';
    byFit[key] += 1;
    if (r.health > 0) { healthSum += r.health; healthCount += 1; }
  }
  return {
    total: list.length,
    byFit,
    avgHealth: healthCount ? Math.round(healthSum / healthCount) : null,
  };
}

/** Sorted unique capabilities across all rows (for the filter chips). */
export function allCapabilities(rows) {
  const set = new Set();
  for (const row of rows) {
    for (const c of row.capabilities) set.add(c);
  }
  return [...set].sort();
}

/** Where this repo lives, by platform; bare names fall back to a GitHub search. */
export function sourceUrl(platform, repoId) {
  const id = String(repoId || '');
  if (platform === 'gitlab') return `https://gitlab.com/${id}`;
  if (platform === 'npm') return `https://www.npmjs.com/package/${id}`;
  if (platform === 'pypi') return `https://pypi.org/project/${id}/`;
  if (id.includes('/')) return `https://github.com/${id}`;
  return `https://github.com/search?q=${encodeURIComponent(id)}&type=repositories`;
}

/** Union two row lists by repoId — primary rows win, secondary fills the gaps.
 * Returns a NEW array; neither input is mutated. */
export function mergeRows(primary, secondary) {
  const seen = new Set(primary.map((r) => r.repoId));
  return [...primary, ...secondary.filter((r) => r.repoId && !seen.has(r.repoId))];
}
