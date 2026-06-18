// Authored "How to use it" + "Common misconceptions" copy per framework / single-shot
// lens. Static — mirrors explainers.js. Rendered as a collapsible strip above each
// lens result. Keyed by the framework key (Systems/Ideate/Prioritize) or lens key
// (deepdive/sktpg).

export const LENS_GUIDE = {
  // ─ Ideate (creative) ─
  triz: {
    howToUse:
      'Reach for it when two goals fight (speed vs richness). Name the contradiction, then use the principles as a menu of escapes, not a verdict.',
    misconceptions: [
      "It's not a ranking of options — it resolves a trade-off without compromising either side.",
      'The principles are prompts to adapt, not patterns to copy literally.',
    ],
  },
  scamper: {
    howToUse:
      'Each letter forces a specific transformation — read them as prompts, not finished answers. Take the 1–2 that spark something and push them further yourself.',
    misconceptions: [
      "It's not free-form brainstorming — each lens is a constraint that forces a different angle.",
      '"Put to another use" ≠ "Modify" — keep them distinct or you get duplicate ideas.',
      "One strong reframe beats six safe ideas; quantity isn't the goal.",
    ],
  },
  lateral: {
    howToUse:
      'Use it when straight logic keeps landing on the obvious. The random provocation is bait — judge the leap it triggers, not the provocation itself.',
    misconceptions: [
      'A weird provocation is not the idea — the value is the bridge from it back to your project.',
      "If nothing leaps, that's fine; lateral thinking misses more than it hits, by design.",
    ],
  },
  morph: {
    howToUse:
      'Use it to escape one-dimensional thinking. Read the axes, then chase the combinations no one would naturally pick.',
    misconceptions: [
      'The value is in the off-diagonal combos, not the obvious one-per-axis defaults.',
      'More axes is not better — 2–4 sharp variables beat ten fuzzy ones.',
    ],
  },
  // ─ Systems ─
  toc: {
    howToUse:
      'Use it to stop optimizing things that do not matter. Fix only the named bottleneck; everything upstream of it is wasted effort until it moves.',
    misconceptions: [
      'There is only ever one binding constraint at a time — improving anything else is noise.',
      'When you relieve it, the constraint moves; the report names where, so expect a new bottleneck, not "done".',
    ],
  },
  loops: {
    howToUse:
      'Use it to see why the system accelerates or stalls. Trace each cycle back to its start; reinforcing loops compound, balancing loops resist.',
    misconceptions: [
      "A loop is a cycle that returns to itself — a one-way chain of effects isn't a loop.",
      'Reinforcing is not "good" and balancing is not "bad" — runaway reinforcement also means collapse.',
    ],
  },
  pdca: {
    howToUse:
      "Use it to judge whether the project actually learns. Look for a real Check step — that's the one teams skip.",
    misconceptions: [
      "It's a loop, not a launch checklist — without Act feeding the next Plan it's just waterfall.",
      'Shipping (Do) is the easy phase; the value is in Check and Act.',
    ],
  },
  dmaic: {
    howToUse:
      'Use it when the problem is variance/defects, not features. Insist on a measurable baseline before any improvement.',
    misconceptions: [
      "Without Measure it's just opinion — a number before and after is the whole point.",
      'Control is not optional — un-held gains regress.',
    ],
  },
  // ─ Prioritize ─
  pareto: {
    howToUse:
      'Use it to find the few factors worth your time. Act on the vital few; consciously defer the long tail.',
    misconceptions: [
      "80/20 is a heuristic, not a law — don't treat the exact split as measured.",
      'The trivial many are deferred, not deleted — some become vital later.',
    ],
  },
  eisenhower: {
    howToUse:
      'Sort honestly by urgency vs importance, then act on the quadrant, not the task: Do, Schedule, Delegate/automate, or Drop.',
    misconceptions: [
      'Urgent ≠ important — most urgent work lands in Delegate or Eliminate.',
      'The high-value work (architecture, hardening) is almost never urgent — it lives in Schedule and gets skipped.',
    ],
  },
  // ─ single-shot lenses ─
  deepdive: {
    howToUse:
      'Run it when you need to actually understand the code, not just decide on it. Read the atoms first, then how they depend on each other.',
    misconceptions: [
      'It reads real source on GitHub; elsewhere it falls back to the README, so depth varies.',
      "The Feynman gaps are the point — they flag what even the analysis isn't sure of.",
    ],
  },
  sktpg: {
    howToUse:
      'Use it to judge trajectory, not present state — where this is heading in 6–18 months and what to do before consensus.',
    misconceptions: [
      "It's a directional bet, not a forecast — the band is confidence, not a guarantee.",
      'Weak signals are weak on purpose; treat them as hypotheses to track, not facts.',
    ],
  },
};

export function guideFor(key) {
  return LENS_GUIDE[key] || null;
}
