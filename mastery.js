// mastery.js
// Pure model for the Knowledge Game's mastery signal. No DOM, no network, no IDB —
// just scoring/leveling/aggregation, so it is fully unit-testable. The signal is
// earned (self-graded) from the deep-dive's self-test questions; store.js persists
// the already-computed record per repo.

export const MASTERY_LEVELS = { NEW: 'new', EXPLORED: 'explored', UNDERSTOOD: 'understood' };

// "understood" = at least two-thirds of questions self-rated "got it". Compare
// against the 2/3 fraction, NOT a rounded 0.67 (2/3 = 0.6667 < 0.67 would wrongly
// require 3-of-3); 2-of-3 must pass.
export const UNDERSTOOD_THRESHOLD = 2 / 3;

const LEVEL_LABELS = { new: 'New', explored: 'Explored', understood: 'Understood' };
const LEVEL_ORDER = { new: 0, explored: 1, understood: 2 };

/** Display label for a level; unknown → 'New'. */
export function levelLabel(level) {
  return LEVEL_LABELS[level] || LEVEL_LABELS.new;
}

/** Numeric rank for ordering (new < explored < understood). */
export function levelRank(level) {
  return LEVEL_ORDER[level] ?? 0;
}

/**
 * Score a self-graded understanding check.
 * @param {{q:string,a:string}[]} questions
 * @param {('gotIt'|'shaky'|'missed')[]} ratings  aligned to questions
 * @returns {{level:string,score:number,gotIt:number,shaky:number,missed:number,total:number,glows:string[],grows:string[]}}
 */
export function deriveCheckResult(questions, ratings) {
  const qs = Array.isArray(questions) ? questions : [];
  const rs = Array.isArray(ratings) ? ratings : [];
  const total = qs.length;
  if (total === 0) {
    return {
      level: MASTERY_LEVELS.NEW,
      score: 0,
      gotIt: 0,
      shaky: 0,
      missed: 0,
      total: 0,
      glows: [],
      grows: [],
    };
  }
  let gotIt = 0,
    shaky = 0,
    missed = 0;
  const glows = [],
    grows = [];
  qs.forEach((q, i) => {
    const text = (q && q.q) || '';
    const r = rs[i];
    if (r === 'gotIt') {
      gotIt++;
      glows.push(text);
    } else if (r === 'shaky') {
      shaky++;
      grows.push(text);
    } else {
      missed++;
      grows.push(text);
    }
  });
  const score = gotIt / total;
  const level = score >= UNDERSTOOD_THRESHOLD ? MASTERY_LEVELS.UNDERSTOOD : MASTERY_LEVELS.EXPLORED;
  return { level, score, gotIt, shaky, missed, total, glows, grows };
}

/**
 * Coverage counts across a map of mastery records (repoId → record).
 * @returns {{total:number,understood:number,explored:number,new:number}}
 */
export function aggregateMastery(records) {
  const out = { total: 0, understood: 0, explored: 0, new: 0 };
  for (const rec of Object.values(records || {})) {
    out.total++;
    const lvl = rec && rec.level;
    if (lvl === MASTERY_LEVELS.UNDERSTOOD) out.understood++;
    else if (lvl === MASTERY_LEVELS.EXPLORED) out.explored++;
    else out.new++;
  }
  return out;
}
