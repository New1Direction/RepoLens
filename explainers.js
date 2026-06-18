// Static "when to use / when to skip" guidance for each on-demand scan/lens,
// keyed by the data-tab id on its button. Pure data + lookup — no DOM.

export const SCAN_EXPLAINERS = {
  10: {
    title: 'Deep Dive',
    bestFor:
      'Understanding HOW it works inside — semantic units, causal lineage, and a from-scratch explanation that self-tests.',
    skipIf: 'You only need a quick adopt/skip verdict, or the repo is tiny.',
    cost: '3 chained AI calls · GitHub source',
  },
  11: {
    title: 'Systems',
    bestFor: 'Seeing the repo as a system in motion — its bottleneck, feedback loops, or improvement cycle.',
    skipIf: "A static feature read is enough and dynamics won't change your decision.",
    cost: '1 AI call per framework',
  },
  12: {
    title: 'Ideate',
    bestFor: 'Generating new directions — TRIZ / SCAMPER / lateral prompts to spark extensions.',
    skipIf: 'You want an assessment of what exists, not new ideas.',
    cost: '1 AI call per framework',
  },
  13: {
    title: 'Prioritize',
    bestFor: 'Deciding what matters most — Pareto 80/20 or an Eisenhower urgent/important split.',
    skipIf: 'There is nothing to triage yet, or scope is already clear.',
    cost: '1 AI call per framework',
  },
  14: {
    title: 'SKTPG',
    bestFor: 'A one-tap directional read — what to know, the pitfalls, and the growth path.',
    skipIf: 'You already know this space well.',
    cost: '1 AI call',
  },
  16: {
    title: 'Similar',
    bestFor: 'Finding repos already in your library that are close to this one.',
    skipIf: 'Your library is empty or this is your first scan.',
    cost: 'Instant · local lookup',
  },
  18: {
    title: 'Synergies',
    bestFor: 'Finding complementary repos that pair well with this one.',
    skipIf: 'You only care about this repo in isolation.',
    cost: '1 AI call · grounded in your library',
  },
  17: {
    title: 'Versus',
    bestFor: 'A head-to-head comparison against a specific other repo.',
    skipIf: 'You have no concrete alternative in mind to compare.',
    cost: '1 AI call',
  },
  19: {
    title: 'Connections',
    bestFor:
      'Walking the semantic map your scans build — alternatives, synergies, versus links, and pinned ideas, one hop at a time.',
    skipIf: 'Your library is nearly empty — the map needs a few scans first.',
    cost: 'Instant · local graph',
  },
  20: {
    title: 'Combine',
    bestFor:
      'Fusing this repo with complementary library repos into concrete new project ideas, scored on novelty and feasibility.',
    skipIf: "You haven't analyzed the ingredients yet — it builds on your library.",
    cost: 'Several AI calls — one per combo',
  },
  21: {
    title: 'Docs Quality',
    bestFor:
      'Answering "can I use this without reading the source?" — scores README completeness, quickstart, code examples, API reference, changelog, and contributing guide.',
    skipIf:
      "The docs are clearly excellent or clearly absent — most useful in the grey zone where you're unsure.",
    cost: '1 AI call · README + file tree',
  },
  22: {
    title: 'Maintenance',
    bestFor:
      "Quickly auditing commit recency, contributor bus-factor, CI presence, and open-issue health — signals a README can't fake.",
    skipIf: "You already know this is actively maintained or that it's abandonware.",
    cost: '1 AI call · GitHub metadata + file tree',
  },
  23: {
    title: 'License Compat',
    bestFor:
      "Checking whether this repo's license conflicts with what's already in your library — flags GPL/AGPL friction with permissive stacks.",
    skipIf: "Your library is empty or you're working purely open-source.",
    cost: 'Instant · no AI · library lookup',
  },
  24: {
    title: 'Since Last Scan',
    bestFor:
      'Seeing exactly what changed between this scan and the last one — star growth, health shift, new or removed red flags, version bump.',
    skipIf: 'This is your first scan of the repo.',
    cost: 'Instant · no AI · cached snapshot diff',
  },
  25: {
    title: 'Fits MY Stack?',
    bestFor:
      'Answering "does this slot in, introduce a paradigm shift, or conflict with what I already use?" — grounded in your actual library.',
    skipIf: 'Your library is empty or this is a completely isolated experiment.',
    cost: '1 AI call · grounded in your library',
  },
};

export function explainerFor(tabId) {
  return SCAN_EXPLAINERS[Number(tabId)] ?? null;
}
