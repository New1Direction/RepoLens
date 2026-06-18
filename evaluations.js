// Evaluations Workbench — per-repo rubric scoring.
// A rubric is a list of user-defined criteria (name + weight). Each repo can be
// scored 1–5 per criterion, with an optional note. Everything persists to
// chrome.storage.local so it survives restarts without an IDB schema bump.

const RUBRIC_KEY = 'repolens_rubric';
const EVALS_KEY = 'repolens_evaluations';

export const DEFAULT_RUBRIC = [
  { id: 'docs', name: 'Documentation', weight: 1 },
  { id: 'types', name: 'Type safety', weight: 1 },
  { id: 'maint', name: 'Maintenance', weight: 1 },
];

/** Load the current rubric (falls back to DEFAULT_RUBRIC). */
export async function loadRubric() {
  try {
    const stored = await chrome.storage.local.get(RUBRIC_KEY);
    const rubric = stored[RUBRIC_KEY];
    return Array.isArray(rubric) && rubric.length ? rubric : [...DEFAULT_RUBRIC];
  } catch {
    return [...DEFAULT_RUBRIC];
  }
}

/** Persist the full rubric array. */
export async function saveRubric(rubric) {
  await chrome.storage.local.set({ [RUBRIC_KEY]: rubric });
}

/** Load all evaluations as a plain object { repoId → {scores, note, savedAt} }. */
async function loadAllEvals() {
  try {
    const stored = await chrome.storage.local.get(EVALS_KEY);
    return stored[EVALS_KEY] || {};
  } catch {
    return {};
  }
}

/** Save or update the evaluation for one repo. */
export async function saveEval(repoId, evaluation) {
  const all = await loadAllEvals();
  all[repoId] = { ...evaluation, savedAt: new Date().toISOString() };
  await chrome.storage.local.set({ [EVALS_KEY]: all });
}

/** Remove the evaluation for one repo. */
export async function clearEval(repoId) {
  const all = await loadAllEvals();
  delete all[repoId];
  await chrome.storage.local.set({ [EVALS_KEY]: all });
}

/** Returns a Map<repoId, evaluation> for all repos. */
export async function listEvals() {
  const all = await loadAllEvals();
  return new Map(Object.entries(all));
}

/**
 * Compute the weighted average score (1–5) for an evaluation against a rubric.
 * Returns null if no criteria are scored.
 */
export function computeScore(evaluation, rubric) {
  if (!evaluation?.scores || !rubric?.length) return null;
  let sum = 0,
    totalWeight = 0;
  for (const crit of rubric) {
    const score = evaluation.scores[crit.id];
    if (score >= 1 && score <= 5) {
      sum += score * (crit.weight || 1);
      totalWeight += crit.weight || 1;
    }
  }
  return totalWeight ? sum / totalWeight : null;
}
