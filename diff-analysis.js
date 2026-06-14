// Pure helpers for "Diff Since I Last Looked" — compares two cached analysis snapshots.
// No DOM, no chrome APIs, unit-testable.

const FIT_ORDER = ['strong', 'solid', 'care', 'risky'];
const FIT_RANK = Object.fromEntries(FIT_ORDER.map((f, i) => [f, i]));

export function daysSince(isoTs) {
  if (!isoTs) return null;
  const ms = Date.now() - new Date(isoTs).getTime();
  return ms >= 0 ? Math.floor(ms / 86_400_000) : 0;
}

function _fitLevel(d) {
  if (!d) return null;
  const score = Number(d.health?.score ?? d.health ?? 0);
  const warns = ((d.red_flags) || []).filter(f => f?.severity !== 'ok').length;
  if (score >= 85 && warns === 0) return 'strong';
  if (score >= 70 && warns <= 1) return 'solid';
  if (score >= 50 && warns <= 3) return 'care';
  if (score > 0) return 'risky';
  return warns === 0 ? 'solid' : warns <= 2 ? 'care' : 'risky';
}

function _numDelta(before, after) {
  const delta = after - before;
  return { before, after, delta, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same' };
}

function _versionDelta(before, after) {
  if (!before && !after) return null;
  if (before === after) return { before: before || null, after: after || null, changed: false };
  return { before: before || null, after: after || null, changed: true };
}

/**
 * Compute field-level deltas between two analysis snapshots.
 * Returns null if prev is missing (first scan).
 */
export function diffAnalyses(prev, next) {
  if (!prev || !next) return null;

  const healthPrev = Number(prev.health?.score ?? prev.health ?? 0);
  const healthNext = Number(next.health?.score ?? next.health ?? 0);
  const starsPrev = Number(prev.stars ?? 0);
  const starsNext = Number(next.stars ?? 0);
  const fitPrev = _fitLevel(prev);
  const fitNext = _fitLevel(next);
  const fitRankPrev = FIT_RANK[fitPrev] ?? 2;
  const fitRankNext = FIT_RANK[fitNext] ?? 2;

  const flagsPrev = new Set(((prev.red_flags) || []).map(f => f?.title).filter(Boolean));
  const flagsNext = new Set(((next.red_flags) || []).map(f => f?.title).filter(Boolean));

  return {
    days_since_prev: daysSince(prev.cachedAt),
    star_delta: _numDelta(starsPrev, starsNext),
    health_delta: _numDelta(healthPrev, healthNext),
    fit_delta: {
      before: fitPrev,
      after: fitNext,
      changed: fitPrev !== fitNext,
      direction: fitRankNext < fitRankPrev ? 'up' : fitRankNext > fitRankPrev ? 'down' : 'same',
    },
    new_flags: [...flagsNext].filter(t => !flagsPrev.has(t)),
    removed_flags: [...flagsPrev].filter(t => !flagsNext.has(t)),
    version_delta: _versionDelta(prev.version, next.version),
  };
}
