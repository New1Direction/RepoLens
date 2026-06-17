# Output Tab — Four-Act Narrative (Pillar A)

- **Date:** 2026-06-16
- **Status:** Approved (design) — pending implementation plan
- **Surface:** the extension's analysis/verdict view (`output-tab.html` + `output-tab.js`)
- **Part of:** a 3-pillar "make the app simpler to use and digest" effort
  - **Pillar A — Output-tab narrative** ← *this spec, building first*
  - **Pillar B — Cross-app journey** (circular nav, entry points, save/discovery clarity)
  - **Pillar 3 — The Knowledge Game** (library + corkboard + canvas made smooth, juicy, and addictive; mastery + discovery + collection + crafting, in service of "plug pieces together and think in new ways")

## Problem

The output tab is information-rich and genuinely good — the problem is purely presentation and flow. From a current-state audit:

1. **28 flat tabs.** Verdict, ELI5, Technical, Use-Cases, Skip-If, Enables, Pros-Cons, Alternatives, Health, Red-Flags, Tech-Stack, + Deep-Dive/Systems/Ideate/Prioritize/SKTPG, + Docs/Maintenance/License/Diff/Fits-Stack, + Similar/Versus/Synergies/Connections/Combine, + Ask/Canvas. No sense of what to read first or in what order.
2. **No narrative, weak wayfinding.** The Verdict landing tries to be everything (11 stacked sections, flat hierarchy); the **Decision control (Adopt/Trial/Hold/Reject) is buried ~2000px down**; key info is *previewed* on Verdict but *fully* rendered elsewhere with no jump links; fit verdict, red flags, and tech stack each render in two places.
3. **Opaque "lenses," hidden prerequisites.** "Lens" is never explained; Canvas silently needs Deep Dive first; library tabs need 2+ scans; multi-stage runs give no progress/ETA.

## Goals

- Reorganize the output tab into a **four-act narrative**: **Decide → Understand → Go Deeper → Act**.
- Add real hierarchy, wayfinding (preview → jump), and lens clarity (label + prerequisite + time estimate + live progress).
- **Preserve every piece of information**, all functionality, all deep links, and per-repo position recall. Nothing is removed.

## Non-goals

- No rewrite of individual section internals or the analysis pipeline (`background.js` runners, prompts, parsers stay as-is).
- No gamification / motion juice (that is Pillar 3).
- No settings redesign, no new analysis features.
- **One folded-in exception:** the small circular library↔output navigation fix (it is central to "flow" and cheap).

## Structure: chosen approach

**Four Acts, two-tier navigation.** Four primary acts as the top-level nav; each act opens its own focused, bounded view containing its grouped sections. The user always knows which act they are in; never an endless scroll. Keyboard navigation preserved. Cleanest fit for the zero-build codebase.

## The four acts — complete section mapping

Every current destination keeps a home. "Default" = shown immediately after a scan; "On-demand" = user triggers an AI run.

### ① DECIDE — *"should I use this, and what do I do about it?"* (the landing)

| Element | Default/On-demand | Notes |
|---|---|---|
| Fit verdict (level + label + why) | Default | Anchored at top |
| Bottom line (one-liner) | Default | |
| **Decision control** (Adopt/Trial/Hold/Reject + note) | Default | **Moved to the top** (was buried at page bottom) |
| At-a-glance facts (health score, stars/license/language, pros/cons/flag counts) | Default | Compact summary row |
| Top red flags (up to 3) | Default | Distinct "warning" treatment; link to full list in Understand |
| Where-to-start cards (`start_here`) | Default (if present) | |
| Since-last-scan diff callout | Default (if prior scan) | fit/health change |
| "Worth noting" highlights | Default | Now **anchor** to their home section (no context-thrash navigation) |

### ② UNDERSTAND — *deep reading; all pre-computed, no waiting*

| Element | Default/On-demand | Notes |
|---|---|---|
| ELI5 (+ analogies) | Default | |
| Technical | Default | |
| Use Cases (4-grid) | Default | |
| Skip If (4-grid) | Default | |
| Enables | Default | |
| Pros / Cons (full) | Default | Verdict shows counts → jump here |
| Red Flags (full list) | Default | Decide shows top 3 → jump to the canonical full list here |
| Alternatives | Default | |
| Health (full: 4 signals + summary) | Default | **Add metric explanations** (what each signal means) |
| Tech Stack (full: built_with + key_dependencies) | Default | Verdict shows language chips → jump here |

De-duplication rule: where Verdict shows a preview (fit, top flags, tech stack), the **full** version lives here and Verdict links to it. One source of truth per element.

### ③ GO DEEPER — *on-demand lenses about THIS repo; each a labeled card*

Each lens renders as a card with: **name · one-line "what it does" · prerequisite badge (if any) · time estimate · live stage progress.**

| Lens | Prerequisite | Notes |
|---|---|---|
| Deep Dive (atoms → lineage → Feynman) | — | ~90s, 3 stages with progress |
| Canvas / Blueprint | **Needs Deep Dive** | prereq badge shown |
| Systems (PDCA/DMAIC/Loops/TOC) | — | framework chips |
| Ideate (SCAMPER/Lateral/TRIZ/Morph) | — | framework chips |
| Prioritize (Eisenhower/Pareto) | — | framework chips |
| SKTPG | — | auto-run by default (toggle) |
| Docs Quality | — | |
| Maintenance | — | can be slow on large repos; show progress |
| License | library context | |
| Since Last Scan | prior scan | |

### ④ ACT — *do something with it*

| Element | Notes |
|---|---|
| Save | clear saved-state feedback |
| Ask this repo | requires a completed scan — state this up front |
| Share | |
| **Against your library:** Similar · Versus · Synergies · Connections · Combine · Fits-My-Stack | Honest "needs N scans" unlock states. The **deeper, gamified treatment of these is Pillar 3**; here they get a clean home + honest states. |

## Navigation & interaction

- **Persistent header** — repo name, meta pills (stars/license/language), fit chip — always visible across acts.
- **Primary nav** — four acts (`DECIDE · Understand · Go Deeper · Act`). Default landing = **Decide**.
- **Secondary nav within an act** — for Understand, a section list with hierarchy; for Go Deeper / Act, a grid of labeled cards.
- **Keyboard** — `1`–`4` select acts; within-act secondary keys for sections; preserve existing `r` (rerun), `f` (fresh), `l` (library), `o` (open source).
- **Deep-linking** — new hash scheme (`#decide`, `#understand/health`, `#deeper/deep-dive`, `#act/versus`). A **legacy slug map** translates every old `#slug` to its new act/section so existing links and bookmarks still resolve.
- **Per-repo recall** — extend the stored position (`repolens_tab_<repoId>`) to remember act + section.

## Component design (for isolation + testability)

Extract a **pure act-model module** (e.g. `output-acts.js`), no DOM/network, exporting:

- `ACTS` — the ordered acts and the sections grouped under each.
- `sectionToAct(sectionId)` — which act owns a section.
- `routeForHash(hash)` / `hashForRoute(act, section)` — round-trippable hash routing.
- `LEGACY_SLUG_MAP` + `resolveLegacySlug(slug)` — old `#slug` → new route.
- `keyboardMap` — key → act/section.

`output-tab.js` consumes this module to render the act shell and route; section render functions stay as-is and mount into act containers. This keeps the routing/grouping logic unit-testable independently of the DOM.

## Constraints honored

- **Zero-build, zero-dep, vanilla ES modules.** Reorganize `output-tab.html` + `output-tab.js`; no framework, no bundler, no new runtime deps.
- **Brand = Mono Ink**, stop-slop/human voice, **no emoji on product surfaces**, motion behind `prefers-reduced-motion` (reuse `--dur-*` / `--ease-*` tokens).
- **No DOM test environment** — pure logic to vitest; DOM/SW glue via `node --check` + a `*-demo.html` harness.
- **No `background.js` contract changes** — message types (`DEEP_DIVE`, `SKTPG`, `MAINTENANCE`, …) are unchanged; this is a front-end reorganization only.

## Testing

- **vitest (pure):** act-model completeness (every current slug maps to exactly one act/section), legacy-slug resolution, hash round-trip, keyboard map.
- **`node --check`** on `output-tab.js` / HTML glue.
- **Visual:** an `output-tab` demo harness (`*-demo.html`); Playwright screenshots at 320 / 768 / 1024 / 1440; reduced-motion behavior; accessibility (keyboard nav, focus order, contrast).
- Existing suite stays green; `eslint .` 0 errors; HTML parse gate passes.

## Migration / rollout

1. Build the pure act-model module + the act shell + routing (tested first).
2. Move sections into acts group-by-group, keeping tests green at each step.
3. Add the legacy-hash redirect so existing `#slug` links resolve.
4. Preserve auto-save, lens runners, and all message contracts (front-end only).

## Acceptance criteria

- [ ] All ~28 destinations reachable, grouped into the four acts.
- [ ] Decision control lives in Decide, visible without scrolling.
- [ ] No element rendered twice as a source of truth — previews jump to the canonical section.
- [ ] Every lens shows what-it-does + prerequisite + time estimate + live progress.
- [ ] Old deep links resolve via the legacy map; keyboard nav works; per-repo recall works.
- [ ] Verdict landing is scannable with clear hierarchy.
- [ ] All existing tests pass + new act-model tests; `eslint .` 0 errors; HTML gate passes.

## Resolved decisions

- Structure = Four Acts, two-tier nav.
- Decision control → top of Decide.
- Library-relational features → Act (deeper gamified treatment deferred to Pillar 3).
- Circular library↔output nav fix folded into A.
