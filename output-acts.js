// output-acts.js
// Pure act model for the output tab. Groups the existing tab indices (the #t0..#t27
// panels) into four ordered "acts" — Decide, Understand, Go Deeper, Act — for a
// two-tier nav. No DOM, no network, no imports: this is the testable contract the
// nav rendering and show() build on. Tab indices and slugs are unchanged from the
// existing TAB_SLUGS, so deep links and per-repo recall keep working.

export const ACTS = [
  { id: 'decide', label: 'Decide', tabs: [9] },
  { id: 'understand', label: 'Understand', tabs: [0, 1, 2, 3, 4, 5, 8, 6, 7, 15] },
  { id: 'deeper', label: 'Go Deeper', tabs: [10, 27, 11, 12, 13, 14, 21, 22, 23, 24] },
  { id: 'act', label: 'Act', tabs: [25, 16, 17, 18, 19, 20, 26] },
];

export const ACT_ORDER = ACTS.map((a) => a.id);

// Tab index → human label (mirrors the current nav button text; used to render
// the secondary row from the model instead of hardcoded HTML).
export const TAB_LABELS = {
  9: 'Verdict',
  0: 'ELI5',
  1: 'Technical',
  2: 'Use Cases',
  3: 'Skip If',
  4: 'Enables',
  5: 'Pros / Cons',
  8: 'Red Flags',
  6: 'Alternatives',
  7: 'Health',
  15: 'Tech Stack',
  10: 'Deep Dive',
  27: 'Canvas',
  11: 'Systems',
  12: 'Ideate',
  13: 'Prioritize',
  14: 'SKTPG',
  21: 'Docs Quality',
  22: 'Maintenance',
  23: 'License',
  24: 'Since Last Scan',
  25: 'Fits MY Stack?',
  16: 'Similar',
  17: 'Versus',
  18: 'Synergies',
  19: 'Connections',
  20: 'Combine',
  26: 'Ask',
};

const ACT_BY_TAB = (() => {
  const m = {};
  for (const a of ACTS) for (const t of a.tabs) m[t] = a.id;
  return m;
})();

/** @returns {string|null} the act id owning tab `n`, or null. */
export function actForTab(n) {
  return Object.prototype.hasOwnProperty.call(ACT_BY_TAB, n) ? ACT_BY_TAB[n] : null;
}

/** @returns {number[]} the tab indices in an act, in display order. */
export function tabsForAct(id) {
  const a = ACTS.find((x) => x.id === id);
  return a ? a.tabs : [];
}
