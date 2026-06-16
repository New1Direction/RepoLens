# Vee's First-Run Walkthrough — Design Spec

> Status: **Draft for review** · 2026-06-16 · Branch: continue on `feat/canvas-engine`.
> Goal: make RepoLens *welcoming* and obvious by having the **Vee mascot guide two tours** — a **first-run intro** (seeded demo, shows Verdict → Blueprint → Corkboard in ~30s) and a **milestone "power" tour** that fires once the user has scanned a few real repos, unlocking the multi-repo features that only become useful with a populated library. Zero backend, zero telemetry.

## 1. Idea in one paragraph

On a brand-new user's **first open of the Library**, Vee offers a guided walkthrough. Because the library is empty, the tour **seeds one rich demo scan** (a real, recognizable repo — `honojs/hono` — clearly badged **DEMO**) so Vee can spotlight *real* surfaces: the Library card, the **Corkboard**, search/Ask, then hand off to the repo's **Verdict** and **Blueprint** (which live on the separate output-tab page). When the tour ends (finish, skip, or first real scan), the demo is removed and `onboardingSeen` is set. It's replayable forever from three entry points. Everything is client-side; nothing leaves the browser.

## 2. Goals / Non-goals

**Goals**
- A delightful, skippable first-run tour that *demonstrates* (not just describes) the verdict, the canvas Blueprint, and the Corkboard.
- Reuse existing assets: the **Vee mascot** (`mascot.js`), the **`guideSeen` first-run-flag pattern**, the canvas tour's **card/step look**, and the **demo fixtures** we already built.
- Zero backend, zero telemetry, MV3-safe, theme-token-based, reduced-motion-safe, all 13 themes.
- Replayable from an empty-state chip, the ⌘K palette, and Settings.

**Non-goals**
- No analytics/telemetry of any kind (no "tour completion" tracking off-device).
- No new animation dependencies (reuse what's vendored + CSS).
- Not a per-feature help system (that's `LENS_GUIDE`); this is a one-time orientation.
- No changes to the scan/LLM pipeline.

## 3. The two-stage flow (the key architectural fact)

The Verdict and Blueprint render in **`output-tab.html`** (opened as its own tab when you open a repo), while the Library + Corkboard are **`library.html`**. A single-page coachmark can't span both, so the tour is **two chained stages**, coordinated by an `onboardingStage` flag in `chrome.storage.local`:

**Stage A — Library (`library.js`):**
1. Vee greets, center: *"Hi, I'm Vee — I read the source so you don't have to. Quick tour?"* `[Take the tour] [Skip]`
2. **Seed the demo** (`honojs/hono`, badged DEMO) → it appears in the grid. Spotlight the demo **card**: *"Every repo you scan lands here — fit, health, the works."* (Vee `idle`.)
3. Switch to the **Corkboard** view; spotlight it: *"Your whole library becomes a red-string board of how things relate."* (Vee `thinking`.)
4. Spotlight **Search + Ask**: *"Find anything, or ask your library in plain English."*
5. Final Stage-A beat — spotlight the demo card / a "See the full read →" prompt: *"Let's open one."* → sets `onboardingStage='verdict'` and **opens the demo's output-tab** (`output-tab.html?key=…` for the demo). Stage A ends.

**Stage B — output-tab (`output-tab.js`), continues automatically when `onboardingStage==='verdict'`:**
6. Spotlight the **Verdict** fit-chip + bottom line: *"The straight answer — should you use it — before the README's pitch."* (Vee `strong`.)
7. Open the **Canvas tab → Blueprint**; spotlight it: *"And here's how it's built, as a map you can drag — try the Guided Tour button."* (Vee `thinking`.)
8. Vee waves: *"You're set — all in your browser, zero telemetry."* → **clear the demo**, set `onboardingSeen=true`, clear `onboardingStage`.

If the user skips at any point: clear the demo, set `onboardingSeen`, clear stage. Reduced-motion → instant cuts, no eased scroll/fades.

## 3B. The milestone "power" tour (second tour)

Once the library has real depth, a second optional tour unlocks the multi-repo features — and it runs on the user's **real** repos, so **no demo seeding/teardown** is needed (simpler than the intro: single-stage, all on the Library page).

- **Trigger:** on Library load, when real (non-`__demo__`) repo count **≥ 5**, `!milestoneTourSeen`, and the intro is done (`onboardingSeen`). Shows a **non-blocking Vee prompt** (a toast/coachmark, not a forced modal): *"Wow, you've been busy — {N} repos scanned! Ready for the fun stuff? Want a tour of what your library can do now?"* `[Show me] [Maybe later] [Don't ask again]`.
- **Snooze:** "Maybe later" re-offers at **≥ 10**; "Don't ask again" — or completing the tour — sets `milestoneTourSeen`. (Threshold 5/10 is a constant, easy to tune.)
- **Content (spotlights, on real data):**
  1. **Ask** bar — *"Now ask across your whole library in plain English."*
  2. **Corkboard** — *"See how your repos relate — run Alternatives / Synergies / Versus to draw more red string."*
  3. **Select → Compare** (side-by-side decision matrix) and **Stack Studio** (wire 2–6 into a system).
  4. **Radar / Auto-organize / Collections** — *"Organize a real library."*
  5. **Discover** — *"Recommendations from what you've adopted."*
- **Architecture:** same `coachmark.js` engine; a **second step list** in `onboarding.js`; single-stage; no demo. Replayable from the same three entries (offered as a "Power-features tour").

## 3C. Vee's voice & the anti-slop pass

Vee's narration is the soul of the tour — it must read like a person, not an AI. **All tour copy lives in one editable deck in `onboarding.js`** so the voice stays consistent and tunable, and every line passes a **de-slop pass** before it ships.

- **Voice (the bible):** calm, candid, dry. The senior engineer who read the source so you don't have to — honest about risk, allergic to hype. Observation, not encouragement. Short declaratives; a little dry wit; never exclamatory cheerleading.
- **Banned slop:** hype verbs (unlock, supercharge, elevate, seamless, effortless, leverage, harness, "dive in", game-changer), manufactured excitement ("Wow!", "Get ready to…", "the fun stuff"), filler ("in today's world", "simply", "just", "that's it!"), exclamation spam, the em-dash-rule-of-three cadence, generic praise.
- **In-voice rewrites** (replacing the slop-adjacent sketches above):
  - Intro greet → *"I'm Vee. I read the source so you don't have to. Two minutes?"*
  - Verdict → *"The straight answer — should you use this — before the README starts selling."*
  - Milestone → *"{N} scans deep. Your library's big enough now for the tools that compare and connect them. Want a look?"*
- **Process:** write in-voice → run the **de-slop ruleset/tool** (the "stop-the-slop" checklist, sourced in the plan) over every line → a **copy-reviewer subagent** flags any remaining AI-tell before merge.

## 4. Architecture / components (reuse-first)

| File | Responsibility | New/Modify |
|---|---|---|
| `coachmark.js` | NEW. Reusable DOM coachmark: a dimming **veil**, a **spotlight** cut-out around a target element (from its bounding rect), a **narration card anchored near the target** (with Vee inside via `renderMascot`/`setMascotState`), Back/Next/Skip + keyboard (←/→/Esc), scroll-into-view. `startCoachmark({steps, onExit, onDone})` → `{next,prev,exit}`. Shares the visual language + step shape with the canvas `tour-runner`, but DOM-targeted (card anchors to elements, not bottom-center — the one real difference that warrants a dedicated module). | New |
| `onboarding.js` | NEW. Defines the intro step lists (Stage-A/Stage-B) **and the milestone "power" tour step list**, the flag logic, and the entry points: `maybeStartLibraryOnboarding()` (library init), `maybeContinueOnboarding()` (output-tab init), `maybeOfferMilestoneTour()` (library init, ≥5 real repos), and `startOnboarding(which)` (manual replay of either tour). `before?` is an async hook a step runs before spotlighting (e.g. switch to Corkboard, open the Canvas tab). | New |
| `demo-repo.js` | NEW. The `honojs/hono` fixture: a full analysis payload (verdict fields + `deepDive.atoms`/`lineage`) tagged `__demo__`. `seedDemo()` (write to the repos store + build its scene, only if the library is empty and no `__demo__` exists), `clearDemo()` (remove the repo + scene + any session entry), `isDemo(repo)`. The DEMO badge renders on the card. | New |
| `mascot.js` | Reuse `renderMascot`, `setMascotState`. No change (the tour shows Vee regardless of the verdict-header `mascotEnabled` toggle — Vee is the guide here). | Reuse |
| `library.js` | After init+render, call `maybeStartLibraryOnboarding()` (gated: `!onboardingSeen` && library empty → run; `!onboardingSeen` && non-empty → set `onboardingSeen` and skip, user isn't new). Add the **empty-state "👋 Take the tour" chip** and a ⌘K **"Take the tour"** command → `startOnboarding()`. Exclude `__demo__` from stats counts. | Modify |
| `output-tab.js` | On init, call `maybeContinueOnboarding()` (runs Stage B when `onboardingStage==='verdict'`). | Modify |
| `options.js` / `options.html` | A **"Replay onboarding"** button → clears `onboardingSeen` (+ `onboardingStage`) and opens the Library / starts the tour. | Modify |
| `settings-backup.js` | Add `onboardingSeen` **and `milestoneTourSeen`** to `SAFE_SETTING_KEYS` (so "I've seen it" travels with settings export). | Modify |
| `backup.js` / `store.js` | Exclude `__demo__`-tagged repos from `exportStores`/`buildBackup` and from the grid stats, so the demo never pollutes a real library/share. | Modify |
| `themes.css` | Coachmark styles: `.cm-veil` (token-dimmed backdrop), `.cm-spotlight` (highlight ring around target), `.cm-card` (narration card + Vee slot), `.cm-badge-demo`. Token-based, reduced-motion-guarded. | Modify |
| `tests/*` | `onboarding.test.js` (step lists non-empty, ordered, target selectors are strings; flag/stage transitions), `demo-repo.test.js` (fixture validity: valid analysis shape + `validateScene` on its scene; `isDemo`), `coachmark` pure helpers (target-rect → card-position math, if extracted). DOM glue verified live. | New |

## 5. Demo fixture (`honojs/hono`)

A crafted, **honest** sample with a clear DEMO marker. Shape mirrors a real scan payload (`repoId`, `fit`/verdict fields, `health`, `pros`/`cons`, `eli5`, …) plus `deepDive.atoms` (≈6: router/context/middleware/handler/adapter/helpers) + `lineage.links` so the Blueprint renders, plus a corkboard scene. Marked `__demo__: true`. Wording is sample-flavored ("a representative read") to avoid mis-stating the real project. Removed on teardown.

## 6. Trigger, teardown, replay, gating

- **Trigger:** first `library.html` open with `!onboardingSeen` && empty library. Non-empty + unseen → silently set `onboardingSeen` (returning user).
- **Teardown:** on finish/skip → `clearDemo()` + `onboardingSeen=true` + clear `onboardingStage`. Defensive: on any Library load, if `onboardingSeen` is true, sweep any stray `__demo__`. Also clear demo on the user's first **real** scan.
- **Replay:** empty-state chip · ⌘K command · Settings button — all call `startOnboarding()` (re-seeds demo, runs Stage A). Replays don't require clearing `onboardingSeen`.
- **a11y:** veil + card are focus-managed; Esc skips; Back/Next are real buttons; targets are scrolled into view; all motion behind `prefers-reduced-motion`.
- **Security:** all narration + labels via `escapeHtml`/`textContent`; no inline handlers (MV3 CSP); no network.

## 7. Testing

Pure logic is unit-tested (Vitest): the step-list builders (non-empty, sequential, valid target selectors), the flag/stage state machine, the demo fixture (valid analysis shape; its scene passes `validateScene`; `isDemo` true/false), and any extracted coachmark geometry (target rect → card placement). The DOM coachmark glue (veil/spotlight/card mount, cross-page handoff) is verified **live** in the extension, per the repo's no-DOM-test convention — plus a standalone `onboarding-demo.html` harness for a screenshot pass.

## 8. Risks & mitigations

- **Cross-page handoff fragility** (Stage A → output-tab Stage B) → coordinate via one `onboardingStage` flag; each page guards "does my target exist?" and exits gracefully if not.
- **Demo pollutes the real library/backup** → `__demo__` tag excluded from export/backup/stats + aggressive teardown sweep.
- **Targets that don't exist** (e.g. Corkboard button hidden in a narrow window) → each step checks its target; skip the step (and its app-action) if absent.
- **Tour fires for returning users** → gated on empty library + `onboardingSeen`.
- **Over-staying its welcome** → ≤8 beats, Skip always visible, never re-fires once seen.

## 9. Open questions

1. Should Stage B (Verdict/Blueprint in output-tab) be **mandatory** or optional (Stage A could end with "open it yourself")? (Provisional: **chained, but Stage A's last beat is a clear opt-in "See the full read →"** so a user who stops at Stage A still got value.)
2. Seed the demo into the **persistent repos store** (tagged, excluded) vs an **in-memory/session** demo. (Provisional: **persistent + `__demo__`-tagged + excluded from export/stats**, since both pages must read it; teardown is robust.)
