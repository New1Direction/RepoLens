// library-filters.js — the single source of truth for *which* library rows are
// visible, and in what order. Both the live render() and the export path
// (getVisibleRows) call this, so they can't drift apart. Pure: pass the rows,
// the filter state, and the lookup maps that live in the library module.

import { sortRows, filterRows } from './library-data.js';
import { computeScore } from './evaluations.js';

const FIT_ORDER = ['strong', 'solid', 'care', 'risky'];

/**
 * Filter + sort the library rows for display/export.
 * @param {Array} allRows every library row
 * @param {{ query?: string, sort?: string, collection?: string, decision?: string, lang?: string }} state
 * @param {{ decisionMap?: Map, evalMap?: Map, rubric?: Array, collections?: Array, nlFilter?: object }} ctx
 * @returns {Array} the visible rows, ordered
 */
export function applyFilters(allRows, state, ctx = {}) {
  const { decisionMap, evalMap, rubric, collections, nlFilter } = ctx;
  let rows = sortRows(filterRows(allRows, state), state.sort);

  // 'decided' sort uses decisionMap, which lives in the library module.
  if (state.sort === 'decided' && decisionMap) {
    rows = [...rows].sort((a, b) => {
      const ta = Date.parse(decisionMap.get(a.repoId)?.savedAt) || 0;
      const tb = Date.parse(decisionMap.get(b.repoId)?.savedAt) || 0;
      return tb - ta || a.name.localeCompare(b.name);
    });
  }
  // 'delta' sort: repos with a fitDelta float up; improved before regressed.
  if (state.sort === 'delta') {
    rows = [...rows].sort((a, b) => {
      const ad = a.fitDelta, bd = b.fitDelta;
      if (ad && !bd) return -1;
      if (!ad && bd) return 1;
      if (ad && bd) {
        const aImp = FIT_ORDER.indexOf(ad.to) < FIT_ORDER.indexOf(ad.from);
        const bImp = FIT_ORDER.indexOf(bd.to) < FIT_ORDER.indexOf(bd.from);
        if (aImp !== bImp) return aImp ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }
  // 'eval' sort: weighted rubric score, highest first.
  if (state.sort === 'eval' && evalMap) {
    rows = [...rows].sort((a, b) => {
      const sa = computeScore(evalMap.get(a.repoId) ?? null, rubric) ?? -1;
      const sb = computeScore(evalMap.get(b.repoId) ?? null, rubric) ?? -1;
      return sb - sa || a.name.localeCompare(b.name);
    });
  }
  // Collection membership filter (kept out of the pure filterRows).
  if (state.collection && collections) {
    const active = collections.find((c) => c.id === state.collection);
    const ids = new Set(active ? active.repoIds : []);
    rows = rows.filter((r) => ids.has(r.repoId));
  }
  // Decision filter: 'undecided' shows repos with no saved decision.
  if (decisionMap && state.decision === 'undecided') {
    rows = rows.filter((r) => !decisionMap.has(r.repoId));
  } else if (decisionMap && state.decision) {
    rows = rows.filter((r) => decisionMap.get(r.repoId)?.decision === state.decision);
  }
  // Language filter.
  if (state.lang) {
    const lq = state.lang.toLowerCase();
    rows = rows.filter((r) => (r.language || r.languages?.[0]?.name || '').toLowerCase() === lq);
  }
  // NL filter: restrict to the AI-ranked id list, preserving the AI order.
  if (nlFilter?.ids?.length) {
    const idOrder = new Map(nlFilter.ids.map((id, i) => [id, i]));
    rows = rows.filter((r) => idOrder.has(r.repoId)).sort((a, b) => idOrder.get(a.repoId) - idOrder.get(b.repoId));
  } else if (nlFilter && !nlFilter.ids?.length && !nlFilter.error) {
    rows = []; // AI ran but found nothing
  }
  return rows;
}
