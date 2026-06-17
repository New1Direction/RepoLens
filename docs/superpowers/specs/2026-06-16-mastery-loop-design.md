# The Mastery Loop (Pillar 3, Spec 1)

- **Date:** 2026-06-16
- **Status:** Approved (design) — pending implementation plan
- **Surface:** the deep-dive panel of the output tab + the library
- **Part of:** **Pillar 3 — The Knowledge Game** (library/corkboard/canvas made smooth, juicy, addictive). Pillar A (output-tab Four-Act narrative) shipped (PR #36).
  - **Spec 1 — The Mastery Loop** ← *this* (mastery/progression + collection)
  - **Spec 2 — The Knowledge Graph** (anchor-to-library + corkboard concept graph; "plug pieces, think in new ways")
  - Juice (crafting/flow motion) + smalls (re-leveling, spaced repetition, mnemonics) woven in

## Research backbone

Informed by *"Towards an AI-Augmented Textbook"* / Google "Learn Your Way" (https://arxiv.org/html/2509.13348v4): **personalize + multi-represent + embedded assessment**, validated by RCT (better immediate *and* 3-day retention). RepoLens already does multi-representation (lenses) and has latent assessment — the deep-dive Feynman stage already emits self-test questions. This spec turns that latent assessment into an interactive **mastery loop**, the paper's "embedded questions + section quiz with Glows & Grows feedback," adapted to a zero-backend, BYO-key extension (self-graded, no new AI calls).

## The loop

**learn** (run a deep dive) → **prove it** (self-graded flip-card check) → **see it grow** (mastery coverage across your library). This is "evaluations compound" made tangible.

## Goals

- A shared, persisted per-repo **mastery signal** the rest of Pillar 3 builds on.
- An interactive, **self-graded** understand-check built from the deep-dive's existing `{q,a}` questions — no new AI calls.
- A library **mastery view** that shows knowledge coverage growing (the collection/progression payoff).
- Tasteful (Mono Ink, no badge-soup, no confetti); fully local.

## Non-goals

- No AI-graded MCQ / distractor generation (self-graded flip cards only in v1).
- No `background.js` / message-contract changes; no new AI calls; no backend.
- No corkboard knowledge-graph integration (that's Spec 2).
- No spaced-repetition scheduling UI yet (the data model leaves room — `lastCheckedAt` — but the resurfacing UX is a later small).

## Components

### ① The signal — `mastery.js` (new pure module) + IDB persistence

Per-repo record, persisted in IDB via `store.js`:

```
mastery[repoId] = {
  level: 'new' | 'explored' | 'understood',
  lastCheckedAt: ISO string | null,
  lastResult: { gotIt: number, shaky: number, missed: number, total: number } | null,
}
```

Levels:
- **new** — scanned, no check taken.
- **explored** — deep dive run / check attempted but not passed.
- **understood** — passed the check.

`mastery.js` is pure (no DOM, no network) and exports:
- `MASTERY_LEVELS` (ordered: new < explored < understood) + `levelLabel(level)`.
- `deriveCheckResult(questions, ratings)` → `{ level, score, glows, grows }`.
  - `ratings` is an array aligned to `questions`, each `'gotIt' | 'shaky' | 'missed'`.
  - `score` = gotIt / total.
  - `level` = `'understood'` when `score >= UNDERSTOOD_THRESHOLD` where `UNDERSTOOD_THRESHOLD = 2/3` (≈0.667 — e.g. 2 of 3 questions passes; tunable constant). Compare against the `2/3` constant, not a rounded `0.67` (2/3 = 0.6667 < 0.67, so a rounded literal would wrongly require 3-of-3). Else `'explored'`.
  - `glows` = the `q` text of the gotIt questions (what you're solid on); `grows` = the `q` text of shaky/missed questions (what to revisit). No AI — pure reflection of which questions were self-rated low.
- `aggregateMastery(records)` → `{ understood, explored, new, total }` for the library view.

### ② Earn — the Understand-Check (deep-dive panel, "Go Deeper")

The deep-dive output already renders a "self-test questions" section from `deepdive.parseFeynman().questions`. Turn it interactive:
- Each question is a flip card: shows `q`; **Reveal answer** shows `a`; then three self-rating buttons: **Got it · Shaky · Missed**.
- After all cards rated, call `deriveCheckResult(questions, ratings)`, persist to `mastery[repoId]` (via `store.js`), and show a **Glows & Grows** summary ("Solid on: …; revisit: …") + the new level.
- Re-taking is allowed; the latest result replaces the prior one.
- The flip-card UI is DOM glue in `output-tab.js`/HTML/CSS; all scoring/leveling/summary logic lives in `mastery.js` (testable).

### ③ See — the Mastery Map (library)

- Each library card gains a subtle level indicator (small ring/dot — *not* a loud badge): new (faint), explored (half), understood (full/accent).
- One honest aggregate line at the top of the library: e.g. "Understood 12 of 40 · 7 explored."
- A level filter (All / Understood / Explored / New) reusing the existing library filter pattern.
- Rendered in `library.js` from the mastery records; coverage stats from `aggregateMastery`.

## Architecture (files)

- **Create** `mastery.js` — pure model + helpers (one responsibility: the mastery signal + scoring + aggregation).
- **Create** `tests/mastery.test.js` — `deriveCheckResult` thresholds/levels/glows-grows, `aggregateMastery`, level helpers.
- **Modify** `store.js` — add `getMastery(repoId)` / `setMastery(repoId, record)` (IDB; follow the existing scene/library store patterns). Add a store test in `tests/`.
- **Modify** `output-tab.js` (+ `output-tab.html` styles) — render the flip-card check in the deep-dive panel; wire ratings → `deriveCheckResult` → `store.setMastery` → summary + level.
- **Modify** `library.js` (+ styles) — card level indicators, the aggregate line, the level filter.

## Testing

- **vitest (pure):** `mastery.js` — `deriveCheckResult` (understood vs explored at the threshold boundary; glows/grows partition by rating), `aggregateMastery` counts, level ordering/labels.
- **vitest + fake-indexeddb:** `store.js` mastery get/set round-trip (matches existing `store-*.test.js` pattern).
- **DOM glue:** `node --check` on changed JS; `npm run check:html`; manual smoke (run a deep dive → take the check → see the level on the library card + aggregate update).
- Existing suite stays green; `eslint .` 0 errors; HTML parse gate passes.

## Constraints

- Zero-build, zero-dep, vanilla ES modules. No new AI calls, no `background.js` changes, no backend — mastery is local IDB only; BYO-key untouched.
- Mono Ink palette; no emoji on product surfaces; the card-flip/reveal motion gated behind `prefers-reduced-motion` using `--dur-*`/`--ease-*`. Tasteful — no confetti, no badge-soup.

## Acceptance criteria

- [ ] After a deep dive, the self-test questions render as an interactive self-graded check (reveal + Got it / Shaky / Missed).
- [ ] Completing the check persists `mastery[repoId]` and shows a Glows & Grows summary + the earned level.
- [ ] `understood` requires `score >= 2/3` (the `UNDERSTOOD_THRESHOLD` constant, ≈0.667; e.g. 2 of 3 questions); otherwise `explored`.
- [ ] Library cards show their mastery level; the library shows an honest aggregate ("Understood X of Y") and a level filter.
- [ ] `mastery.js` logic is fully unit-tested; mastery persistence is tested with fake-indexeddb.
- [ ] All existing tests pass + new tests; `eslint .` 0 errors; HTML gate passes; no AI calls or `background.js` changes added.

## Resolved decisions

- Earn mechanism = **self-graded flip cards** (no AI-graded MCQ in v1).
- 3 levels (new/explored/understood); understood threshold = ≥⅔ "got it" (tunable constant).
- 3-way self-rating (Got it / Shaky / Missed); "Shaky" doesn't count toward mastered, feeds "grows."
- Mastery map v1 = card indicators + aggregate line + level filter; corkboard/graph integration deferred to Spec 2.
