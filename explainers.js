// Static "when to use / when to skip" guidance for each on-demand scan/lens,
// keyed by the data-tab id on its button. Pure data + lookup — no DOM.

export const SCAN_EXPLAINERS = {
  10: { title: 'Deep Dive',  bestFor: 'Understanding HOW it works inside — semantic units, causal lineage, and a from-scratch explanation that self-tests.', skipIf: 'You only need a quick adopt/skip verdict, or the repo is tiny.', cost: '3 chained AI calls · GitHub source' },
  11: { title: 'Systems',     bestFor: 'Seeing the repo as a system in motion — its bottleneck, feedback loops, or improvement cycle.', skipIf: 'A static feature read is enough and dynamics won\'t change your decision.', cost: '1 AI call per framework' },
  12: { title: 'Ideate',      bestFor: 'Generating new directions — TRIZ / SCAMPER / lateral prompts to spark extensions.', skipIf: 'You want an assessment of what exists, not new ideas.', cost: '1 AI call per framework' },
  13: { title: 'Prioritize',  bestFor: 'Deciding what matters most — Pareto 80/20 or an Eisenhower urgent/important split.', skipIf: 'There is nothing to triage yet, or scope is already clear.', cost: '1 AI call per framework' },
  14: { title: 'SKTPG',       bestFor: 'A one-tap directional read — what to know, the pitfalls, and the growth path.', skipIf: 'You already know this space well.', cost: '1 AI call' },
  16: { title: 'Similar',     bestFor: 'Finding repos already in your library that are close to this one.', skipIf: 'Your library is empty or this is your first scan.', cost: 'Instant · local lookup' },
  18: { title: 'Synergies',   bestFor: 'Finding complementary repos that pair well with this one.', skipIf: 'You only care about this repo in isolation.', cost: '1 AI call · grounded in your library' },
  17: { title: 'Versus',      bestFor: 'A head-to-head comparison against a specific other repo.', skipIf: 'You have no concrete alternative in mind to compare.', cost: '1 AI call' },
};

export function explainerFor(tabId) {
  return SCAN_EXPLAINERS[Number(tabId)] ?? null;
}
