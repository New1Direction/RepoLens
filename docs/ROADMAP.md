# RepoLens Roadmap — From Explainer to Workbench

> Generated 2026-06-13 from a multi-agent analysis of the codebase (UI, scan engine,
> data layer, positioning) plus five idea tracks: new scans, productivity/creation
> features, UX friendliness, a mascot concept, and an animation audit. Proposal, not
> commitment — sequencing is a starting point.
>
> **✅ Shipped 2026-06-13 (this session):** the subtle-motion pass (§8), the
> actionable-error + loading-microcopy quick win (§3 #1), the **Collections / Boards**
> persistence keystone (§3 #2, §5), and the **Vee mascot** wired in behind a Settings
> toggle (§7). 458 unit tests passing. Still open: Decision Log, Tech-Stack Builder,
> the new scans, and the rest of the UX list.

## 1. The big idea

RepoLens already nails "should I use this repo?" with a verdict-first briefing. The next
chapter turns that one-shot answer into **kept artifacts and a reasoned-over library**:
the user records a decision, groups repos into a stack, queries everything they've saved,
and walks out with a Markdown brief, a shareable card, or a scaffold — all still
client-side, no backend, no telemetry. The **north-star theme is "your evaluations
compound."** Every scan should leave a durable, portable trace (a decision, a collection,
an annotation, a connection) so the library stops being a scan history and becomes a
workbench that gets more valuable the more you use it.

## 2. Impact × Effort matrix

| Bucket                          | Ideas                                                                                                                                                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Quick Wins** (S, high impact) | Actionable error states (route fix by `errors.js` kind) · Subtle-motion pass: `:active` press states + token set in `themes.css` · Loading microcopy fix (kills wrong "Asking Claude…" for non-Claude providers) · Keyboard-reachable lens tooltips + inline `1–9` shortcut hints                |
| **Big Bets** (L, high impact)   | **Collections (Boards)** — the organizing primitive everything scopes to · **Ask Across My Library** (client-side RAG over BM25) · **Tech-Stack Builder** (directed multi-repo synthesis) · **Scaffold Export** (the first true generative output)                                               |
| **Fill-ins** (S/M, medium)      | Decision Log · License Compatibility check · Diff Since I Last Looked · Maintenance & Abandonment lens · Guided empty states · Skeleton shimmer · Progressive-disclosure Verdict · Command palette (Cmd/Ctrl-K) · Saved Searches · Annotations · Comparison export · Narrow-width responsive CSS |
| **Skip / Later**                | Weekly Digest (needs `chrome.alarms`) · Idea Canvas drag board (heavy) · Framework Synthesis meta-lens · API Surface / Migration / Red-Team / Security-Posture lenses (lens-fatigue risk — ship ≤2 new lenses per version) · Mascot as default-on (see §7)                                       |

The strongest lever is **persistence primitives (Collections + Decision Log)**, because
they unlock the creation features and the library-grounded scans. Adding more _lenses_ is
the lowest-leverage track — RepoLens already has 8.

## 3. Recommended next 5 (in order)

| #   | Build                                         | Why it serves the "creation/idea tool" goal                                                                                                                                                                                                                                                      | Files                                                                                                                                                                                                | Effort |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | **Subtle-motion + actionable-error pass**     | Foundation polish before adding surfaces. Press states make every new button/chip feel real; routing errors by kind (`categorizeError` → "Open Settings" / "Retry" / "Pick a model") removes dead-ends new features will multiply. Ships the missing `--ease-*`/`--dur-*` tokens once, globally. | `themes.css`, `output-tab.html`, `library.html`, `options.html`, `output-tab.js` (error branch), `errors.js`                                                                                         | **S**  |
| 2   | **Collections (Boards)**                      | The keystone. A named, color-tagged group becomes an _input_ to generation (digest, stack-builder, ask-across all scope to it). Turns the flat library into a curated workspace.                                                                                                                 | `store/idb.js` (bump `DB_VERSION` 1→2, add `'collections'`), `store.js`, new `collections.js`, `library.{js,html}`, `library-data.js`, `backup.js`, `tests/collections.test.js`                      | **M**  |
| 3   | **Decision Log**                              | Records the human's call (Adopt/Trial/Hold/Reject + note + timestamp) beside the AI fit chip, then exports a Markdown/CSV table. The first _kept artifact_ — a defensible evaluation trail.                                                                                                      | `store.js` (additive `decision`), new `decision-log.js`, `output-tab.js` (header control → `SET_DECISION`), `background.js`, `library.js`, `library-data.js`, `tests/decision-log.test.js`           | **M**  |
| 4   | **Tech-Stack Builder** (generative)           | Pick 2–6 repos (from a Collection or multi-select), get roles + wiring + glue + gaps + layout, exportable. Directed synthesis vs. Combinator's random pairings — the decisive move into creation, reusing `runCombinator` plumbing and `layouts.js`.                                             | new `stack-prompt.js`, `background.js` (`STACK_BUILD`), `library.js`, `output-tab.js`, `exporter.js` (`toStackMarkdown`), `models.js` (PARTS `'stack'`), `routing.js`, `tests/stack-prompt.test.js`  | **L**  |
| 5   | **Maintenance & Abandonment lens** (new scan) | The highest-value _factual_ lens: fuses `pushed_at`/`archived`/`open_issues_count` + contributor bus-factor + runner CI/test facts into one Active/Slowing/Stale/Abandoned band. Grounded in signals a README can't fake; works even with a weak model.                                          | new `maintenance.js`, `fetcher.js` (capture `pushed_at`/`archived` + `/contributors`), `background.js` (`MAINTENANCE`), `models.js` (PARTS `'maintenance'`), `explainers.js`, `output-tab.{js,html}` | **M**  |

## 4. New scans worth adding

- **Maintenance & Abandonment** — Active/Slowing/Stale/Abandoned band + bus-factor + watch-list, from GitHub metadata + contributor share + CI/test facts. _Runner optional._ **Ship first.**
- **License Compatibility (vs MY stack)** — Mostly deterministic: a small SPDX bucket table compares the repo's license against licenses already in your library. Instant, zero-token, offline. _No runner._ Uniquely library-grounded.
- **Diff Since I Last Looked** — On re-scan, `cache.js` already holds the "before"; `diffAnalyses(prev, next)` computes factual deltas (stars/version/deps/health/fit) for free, with an optional 1-call "did the verdict move" summary. _No runner._
- **Fits MY Stack?** — Personalized adoption verdict from `libraryStats`/`allCapabilities`/`taxonomy.layerOf` + BM25 nearest repos: slots-in / new-paradigm / conflicts-with-X. _No runner._ The best differentiator no per-page tool can match.
- **Red-Team / What Could Bite Me In Prod** — Deliberately pessimistic ops checklist (secret-scan, missing CI/tests, unpinned deps, bus-factor) with likelihood + trigger + mitigation. _Runner strongly recommended._

Guardrail: cap at **2 new lenses per release** to avoid lens-fatigue.

## 5. Productivity & creation features

Framed around _artifacts the user keeps or shares_:

- **Collections (Boards)** — Decision-scoped groups ("Our 2026 stack", "Eval: vector DBs") that double as inputs to every generative feature. The workbench primitive.
- **Decision Log** — Your recorded call + rationale beside the AI fit, exported as a Markdown/CSV evaluation trail.
- **Tech-Stack Builder → Scaffold Export** — Builder turns "I evaluated these" into "here's how they wire together"; Scaffold turns that into downloadable fenced-file Markdown (README + manifest + stubbed integration files), mirroring the existing offline-HTML export ethos. No backend, no zip.
- **Ask Across My Library** — Natural-language Q&A grounded by the shipped BM25 ranker (`store/search.js`) as retriever; answers with citation chips linking back to each verdict. Client-side RAG, zero infra.
- **Annotations & Highlights** — Notes anchored to specific sections (a flag, an atom, a dependency) that travel into Markdown/share exports.
- **Shareable Verdict Cards** — Verdict serialized into a URL fragment that re-renders client-side in `share.html` — zero-backend sharing that keeps the no-server promise.

## 6. UX friendliness upgrades

**Onboarding / empty states** — First-scan coachmark (gated on a `firstScanSeen` flag, mirroring the `guideSeen` pattern); guided empty states using `.dd-cta`-styled "what this does + cost + run" cards from `SCAN_EXPLAINERS`.

**Clarity / progressive disclosure** — Progressive Verdict: TL;DR above the fold (fit chip · bottom line · health ring), facts/flags/entries/jumps behind a `<details>` "See the full read"; persist the open/closed choice.

**Keyboard / command palette** — Cmd/Ctrl-K + `/` fuzzy palette: jump to any tab, run a lens, switch theme/tone, open Library/Settings, quick-capture a URL — reuse the `.guide-veil` modal CSS. Visible superscript `1–9` hints on the first nine tabs.

**Errors / loading** — Actionable errors routed by `categorizeError` kind, rendering `userMessage`. Fix the hardcoded "Asking Claude to read this…" to interpolate repo name + the _actually routed_ provider. Per-lens skeleton shimmer during runs.

**Accessibility** — Keyboard-reachable tooltips (tab-order + Esc + `aria-describedby`); a `:focus` background tint via `color-mix` for dark themes; narrow-width CSS (`@media (max-width:640px)`) so the verdict survives split-screen.

## 7. Mascot: "Vee" (the verdict-lens)

**Recommendation: ship it, but optional and motion-restrained.** A mascot fits the 🔭 brand
and warms a dense dashboard — but only as opt-in, reduced-motion-safe accent, never a
blocking or chatty assistant.

- **Concept** — _Vee_, a telescope/lens character: a stroked lens-disc with one expressive
  aperture "eye", a pupil/catch-light, and four faint cardinal ticks (reads as an
  _instrument_, not a cartoon eye). It **is** the lens metaphor, so it's on-brand, not bolted-on.
- **Personality** — Calm, candid, dry. The senior engineer who read the source so you
  don't have to; honest about risk, never hype. Speaks in observation, not encouragement.
- **Expression set** — `idle`, `scanning` (loading), `verdict-strong` (wide/green),
  `verdict-risky` (narrowed/red/tilted), `thinking` (deep dive), `empty` (sleepy/inviting),
  `error` (sheepish tilt — **not** red; red is reserved for verdicts).

| Moment                     | State                              | Location                                  |
| -------------------------- | ---------------------------------- | ----------------------------------------- |
| Scan loading               | `scanning`                         | `#loading-state` (replaces the pulse box) |
| Verdict rendered           | `verdict-strong` / `verdict-risky` | beside `.v-fit`                           |
| Deep dive running          | `thinking`                         | drive while request in flight             |
| Unrun lens / empty Library | `empty`                            | guided empty-state card / `.lib-empty`    |
| Error                      | `error`                            | `#error-state`                            |

- **Implementation** — Inline SVG + CSS only (no asset pipeline). Lens/aperture/pupil use
  `currentColor` + `--accent`/status tokens, so Vee re-skins across all 13 themes for free
  (verified on dark _and_ light). Expressions are CSS-class swaps on one SVG; a tiny
  `mascot.js` exposes `setMascotState(el, state)` / `setMascotFromFit(el, fit)`.
- **Accessibility + guardrails** — `aria-hidden="true"` (decorative; never the sole carrier
  of meaning). All motion behind `@media (prefers-reduced-motion: no-preference)` → static
  glyph under reduced-motion. Settings toggle `mascotEnabled` (default on, allowlist in
  `settings-backup.js`). No idle fidgeting, no cursor-following, no audio, never blocks.
- **Preview** — see `mascot-preview.html` (standalone; not yet wired into the extension).
  Screenshots in `docs/mascot/`.

## 8. Animation: audit + subtle-motion pass — ✅ IMPLEMENTED 2026-06-13

The motion pass (next-5 item #1, animation half) shipped this session. Findings fixed:

| Finding                                                                | Fix                                                                                                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Zero `:active` press states across all 3 surfaces (HIGH×3)             | Uniform `:active { scale(0.97) }` on tabs/buttons/chips (chips 0.96, cards 0.99, swatch 0.95) — instant for everyone          |
| `--dur` referenced but never defined; no `--ease-*` tokens             | Added `--dur-fast/--dur/--dur-slow` + `--ease-out/--ease-in/--ease-spring` to `themes.css :root` (inherited by all 13 themes) |
| `.tab-btn { transition: all .15s }` (over-broad `all`, symmetric ease) | Enumerated props + `var(--ease-out)`                                                                                          |
| Health/score bars set width with no fill motion                        | `.health-fill`/`.score-fill` fill in via `scaleX` keyframe                                                                    |
| `.tab-content.active` instant `display:block` pop                      | Staged `tab-in` fade + 4px rise on each switch                                                                                |
| `.guide-veil` modal toggled `display` (instant)                        | Veil fades, dialog rises (opacity+visibility), reduced-motion falls back to display toggle                                    |
| `.saved-badge` `fadeup .4s` (>300ms), never exits                      | `badge-in` spring entrance at `--dur-slow`                                                                                    |
| `.swatch:hover` scale 1.15 (>1.05 ceiling), no active                  | Tamed to 1.05 hover / 0.95 active                                                                                             |
| `.token-panel`/`.model-row` "slides in" comment but instant            | Real `panel-in` ease-out reveal                                                                                               |
| Library grid pops in                                                   | Capped `:nth-child` stagger (≤270ms total), `backwards` fill so hover lift survives                                           |

Every enhancement is wrapped in `@media (prefers-reduced-motion: no-preference)` (press
states excepted — they're instant, not motion); the existing aggressive reduce-motion
resets remain authoritative. All 427 unit tests still pass.

**Reuse rule going forward:** any new motion must use the `--dur-*` / `--ease-*` tokens and
sit behind the reduced-motion guard.

## 9. Sequencing

| Version                               | Theme                            | Ships                                                                                                                                                                                 |
| ------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v1.7 — "Feels alive & honest"**     | Polish + first persistence       | ✅ Motion pass · Actionable error routing · Loading-microcopy fix · **Collections** · **Decision Log** · First-scan coachmark + guided empty states                                   |
| **v1.8 — "Reason over your library"** | Library becomes a knowledge base | **Ask Across My Library** · **Maintenance** + **License Compatibility** lenses · Saved Searches · Command palette · Annotations · Progressive Verdict · narrow-width CSS              |
| **v1.9 — "Build, not just browse"**   | Move into creation               | **Tech-Stack Builder** → **Scaffold Export** · Comparison/Decision exports · Shareable Verdict Cards · **Diff** + **Fits MY Stack?** lenses · Mascot "Vee" (optional) · Weekly Digest |
