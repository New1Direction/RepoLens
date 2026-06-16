# Vee Onboarding Walkthrough — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Two Vee-guided tours — a first-run seeded-demo intro (Verdict → Blueprint → Corkboard) and a milestone "power" tour at ≥5 real repos — that make RepoLens welcoming, with narration in Vee's dry, anti-slop voice.

**Architecture:** A reusable DOM **coachmark engine** (veil + spotlight + element-anchored card + Vee) driven by step lists in `onboarding.js`; a seeded **demo repo** fixture so the intro shows real surfaces; flags in `chrome.storage.local`. All copy lives in one **`onboarding-copy.js` deck** guarded by a machine-checked **anti-slop test**. Zero backend, zero telemetry, MV3-safe, theme-token-based.

**Tech Stack:** Vanilla ES modules, no deps, Vitest, IndexedDB (`store.js`), reuses `mascot.js` (Vee), `scene.js`/`validateScene`, the canvas tour's card look.

**Spec:** `docs/superpowers/specs/2026-06-16-vee-onboarding-design.{md,html}`. **Branch:** `feat/vee-onboarding` (off the canvas branch; spec already committed).

---

## Anti-slop ruleset (used by Task 2's test)

Derived from `hexiecs/talk-normal`, `realrossmanngroup/no_ai_slop_writing_rules`, `stephenturner/skill-deslop`. Every Vee line must pass:
- **No banned vocab** (case-insensitive): `unlock, supercharge, elevate, leverage, harness, streamline, empower, revolutionize, showcase, enhance, foster, facilitate, dive in, delve, seamless, effortless, robust, comprehensive, powerful, cutting-edge, game-changer, game-changing, transformative, remarkable, crucial, intricate, meticulous, landscape, tapestry, ecosystem, synergy, supercharge, get ready, the fun stuff, that's it, you're all set, easy, right`.
- **No em dash** (`—`) — the #1 AI tell; use periods/commas.
- **≤ 1 `!`** across the whole deck.
- **The Vee formula:** name a specific thing → say what it means in one adjective-free clause → stop.

## File structure
| File | Responsibility | New/Modify |
|---|---|---|
| `onboarding-copy.js` | The single copy deck: every Vee line, in-voice + de-slopped. Pure data. | New |
| `demo-repo.js` | `honojs/hono` fixture (analysis + atoms/lineage + scene) tagged `__demo__`; `seedDemo`/`clearDemo`/`isDemo`. | New |
| `onboarding.js` | Step lists (intro Stage-A/B + milestone) built from the deck; flag/stage state machine; triggers `maybeStartLibraryOnboarding`/`maybeContinueOnboarding`/`maybeOfferMilestoneTour`/`startOnboarding`. | New |
| `coachmark.js` | DOM coachmark: pure `placeCard()` geometry + `startCoachmark({steps,onExit})` (veil/spotlight/card/Vee/nav). | New |
| `themes.css` | `.cm-veil`/`.cm-spotlight`/`.cm-card`/`.cm-badge-demo` (token-based, reduced-motion). | Modify |
| `library.js` | Wire intro + milestone triggers after init; empty-state chip; ⌘K command; exclude `__demo__` from stats. | Modify |
| `output-tab.js` | `maybeContinueOnboarding()` on init (Stage B). | Modify |
| `options.{js,html}` | "Replay onboarding" button. | Modify |
| `settings-backup.js` | Allowlist `onboardingSeen`, `milestoneTourSeen`. | Modify |
| `store.js`/`backup.js` | Exclude `__demo__` from stats + export/backup. | Modify |
| `CHANGELOG.md`/`README.md` | Note the walkthrough. | Modify |

Shared shapes: copy line = `string`; step = `{ target:string|null, copyKey:string, mascotState:string, before?:()=>Promise<void> }`; flags `onboardingSeen`/`milestoneTourSeen`/`onboardingStage` in `chrome.storage.local`.

---

### Task 1: Demo-repo fixture (`demo-repo.js`)

**Files:** Create `demo-repo.js`, `tests/demo-repo.test.js`.

- [ ] **Step 1 — failing test:**
```js
// tests/demo-repo.test.js
import { describe, it, expect } from 'vitest';
import { DEMO_REPO, demoScene, isDemo } from '../demo-repo.js';
import { validateScene } from '../scene.js';

describe('demo fixture', () => {
  it('is a valid analysis payload tagged __demo__', () => {
    expect(DEMO_REPO.repoId).toBe('honojs/hono');
    expect(DEMO_REPO.__demo__).toBe(true);
    expect(typeof DEMO_REPO.eli5).toBe('string');
    expect(DEMO_REPO.health && typeof DEMO_REPO.health.score).toBe('number');
    expect(Array.isArray(DEMO_REPO.deepDive.atoms)).toBe(true);
    expect(DEMO_REPO.deepDive.atoms.length).toBeGreaterThanOrEqual(4);
    expect(Array.isArray(DEMO_REPO.deepDive.lineage.links)).toBe(true);
  });
  it('builds a valid blueprint scene', () => {
    const s = demoScene();
    expect(validateScene(s).ok).toBe(true);
    expect(s.nodes.length).toBe(DEMO_REPO.deepDive.atoms.length);
  });
  it('isDemo detects the demo and nothing else', () => {
    expect(isDemo(DEMO_REPO)).toBe(true);
    expect(isDemo({ repoId: 'a/b' })).toBe(false);
  });
});
```

- [ ] **Step 2 — run, expect FAIL:** `npx vitest run tests/demo-repo.test.js`

- [ ] **Step 3 — implement `demo-repo.js`:**
```js
// demo-repo.js
// A pre-baked, clearly-marked DEMO scan (honojs/hono) so the first-run tour can
// show real surfaces. Tagged __demo__ so it's excluded from stats/export and torn down.
import { buildBlueprintScene } from './blueprint-adapter.js';

export const DEMO_REPO = {
  repoId: 'honojs/hono',
  __demo__: true,
  platform: 'github', language: 'TypeScript', license: 'MIT', stars: 21000,
  category: 'Web framework', tags: ['edge', 'router'],
  description: 'Small, fast web framework for the edges.',
  saved_at: '2026-01-01T00:00:00.000Z',
  eli5: 'A sample read: a tiny web framework that runs on edge runtimes using web-standard requests.',
  fit: 'strong',
  health: { score: 92 },
  pros: ['Tiny and fast', 'Runs on most runtimes', 'Typed routing'],
  cons: ['Smaller ecosystem than Express'],
  red_flags: [],
  capabilities: ['routing', 'middleware', 'edge'],
  deepDive: {
    atoms: [
      { id: 'app', name: 'Hono app', kind: 'entrypoint', purpose: 'Creates the app and registers routes.' },
      { id: 'router', name: 'router', kind: 'subsystem', purpose: 'Matches a request to a handler.' },
      { id: 'context', name: 'Context', kind: 'subsystem', purpose: 'Wraps request and response per call.' },
      { id: 'middleware', name: 'middleware', kind: 'module', purpose: 'Runs before/after handlers.' },
      { id: 'handler', name: 'handler', kind: 'module', purpose: 'Your route logic.' },
      { id: 'adapter', name: 'runtime adapter', kind: 'module', purpose: 'Binds to a runtime (Workers, Deno, Node).' },
    ],
    lineage: {
      links: [
        { from: 'app', to: 'router', relation: 'depends-on' },
        { from: 'router', to: 'context', relation: 'triggers' },
        { from: 'context', to: 'middleware', relation: 'triggers' },
        { from: 'middleware', to: 'handler', relation: 'triggers' },
        { from: 'app', to: 'adapter', relation: 'depends-on' },
      ],
      roots: ['app'], leaves: ['handler'],
    },
  },
};

/** The blueprint scene for the demo (so the Canvas tab renders real content). */
export function demoScene() {
  return buildBlueprintScene({ deepDive: DEMO_REPO.deepDive, repoId: DEMO_REPO.repoId, title: DEMO_REPO.repoId });
}

/** True only for the seeded demo row. */
export function isDemo(repo) {
  return !!(repo && (repo.__demo__ === true || repo.repoId === DEMO_REPO.repoId && repo.__demo__));
}
```

- [ ] **Step 4 — run, expect PASS:** `npx vitest run tests/demo-repo.test.js`
- [ ] **Step 5 — commit:** `git add demo-repo.js tests/demo-repo.test.js && git commit -m "feat(onboarding): honojs/hono DEMO fixture + demoScene/isDemo"`

---

### Task 2: Copy deck + the anti-slop test (`onboarding-copy.js`)

**Files:** Create `onboarding-copy.js`, `tests/onboarding-copy.test.js`. **This test is the de-slop gate.**

- [ ] **Step 1 — write the anti-slop test FIRST:**
```js
// tests/onboarding-copy.test.js
import { describe, it, expect } from 'vitest';
import { COPY } from '../onboarding-copy.js';

const BANNED = ['unlock','supercharge','elevate','leverage','harness','streamline','empower','revolutionize','showcase','enhance','foster','facilitate','dive in','delve','seamless','effortless','robust','comprehensive','powerful','cutting-edge','game-changer','game-changing','transformative','remarkable','crucial','intricate','meticulous','landscape','tapestry','ecosystem','synergy','get ready','the fun stuff',"that's it","you're all set"];

const lines = Object.entries(COPY); // [key, text]

describe('Vee copy is de-slopped', () => {
  it('uses no banned AI-slop vocab', () => {
    for (const [k, t] of lines) {
      const low = String(t).toLowerCase();
      for (const b of BANNED) expect(low.includes(b), `"${k}": banned "${b}" in: ${t}`).toBe(false);
    }
  });
  it('uses no em dashes (the #1 AI tell)', () => {
    for (const [k, t] of lines) expect(String(t).includes('—'), `"${k}" has an em dash`).toBe(false);
  });
  it('keeps exclamation marks to at most one across the whole deck', () => {
    const total = lines.reduce((n, [, t]) => n + (String(t).match(/!/g) || []).length, 0);
    expect(total).toBeLessThanOrEqual(1);
  });
  it('every line is short (≤ 140 chars) and non-empty', () => {
    for (const [k, t] of lines) { expect(String(t).length, k).toBeGreaterThan(0); expect(String(t).length, k).toBeLessThanOrEqual(140); }
  });
});
```

- [ ] **Step 2 — run, expect FAIL:** `npx vitest run tests/onboarding-copy.test.js`

- [ ] **Step 3 — implement `onboarding-copy.js`** (every line in Vee's voice; `{N}` is interpolated at render):
```js
// onboarding-copy.js
// Vee's narration, in one place. Calm, candid, dry: name a specific thing, say what
// it means in one plain clause, stop. No hype, no em dashes, no exclamation spam.
export const COPY = {
  introGreet: "I'm Vee. I read the source so you don't have to. Two minutes?",
  introCard: 'Every repo you scan lands here. Fit, health, and the notes you take.',
  introCorkboard: 'Your whole library as a board. The lines show how repos relate.',
  introSearch: 'Search by name, or ask the library a question in plain words.',
  introOpen: 'One click opens the full read on a repo.',
  verdict: "The honest answer on whether to use it, before the README's pitch.",
  blueprint: "How it's built, as a map you can drag. The tour button walks you through it.",
  farewell: 'That covers it. Everything stays in your browser, nothing phones home.',
  // milestone "power" tour
  milestoneOffer: "{N} scans in. Your library's deep enough now for the tools that compare and connect repos. Want a look?",
  milestoneAsk: "Ask across everything you've scanned, in plain words.",
  milestoneCorkboard: 'See how your repos relate. Run Alternatives or Synergies to draw more lines.',
  milestoneCompare: 'Select a few, then compare them side by side or wire them into a stack.',
  milestoneOrganize: 'Sort a real library: the radar, auto-organize, and collections.',
  milestoneDiscover: "Find new repos from the ones you've adopted.",
};
```

- [ ] **Step 4 — run, expect PASS:** `npx vitest run tests/onboarding-copy.test.js`
- [ ] **Step 5 — commit:** `git add onboarding-copy.js tests/onboarding-copy.test.js && git commit -m "feat(onboarding): Vee copy deck + machine-checked anti-slop test"`

---

### Task 3: Tour logic (`onboarding.js`)

**Files:** Create `onboarding.js`, `tests/onboarding.test.js`. Pure parts (step builders, milestone threshold, stage machine) are tested; the trigger functions that touch `chrome.storage`/DOM are thin and verified live.

- [ ] **Step 1 — failing test:**
```js
// tests/onboarding.test.js
import { describe, it, expect } from 'vitest';
import { introStageA, introStageB, milestoneSteps, shouldOfferMilestone, MILESTONE_AT } from '../onboarding.js';

describe('onboarding step lists', () => {
  it('intro stages are non-empty, reference real copy keys + selectors', () => {
    for (const list of [introStageA(), introStageB(), milestoneSteps()]) {
      expect(list.length).toBeGreaterThan(0);
      for (const s of list) { expect(typeof s.copyKey).toBe('string'); expect('target' in s).toBe(true); }
    }
  });
  it('milestone offers at the threshold, not before, and not once seen', () => {
    expect(shouldOfferMilestone({ realCount: MILESTONE_AT, milestoneTourSeen: false, onboardingSeen: true })).toBe(true);
    expect(shouldOfferMilestone({ realCount: MILESTONE_AT - 1, milestoneTourSeen: false, onboardingSeen: true })).toBe(false);
    expect(shouldOfferMilestone({ realCount: MILESTONE_AT + 9, milestoneTourSeen: true, onboardingSeen: true })).toBe(false);
    expect(shouldOfferMilestone({ realCount: MILESTONE_AT, milestoneTourSeen: false, onboardingSeen: false })).toBe(false);
  });
});
```

- [ ] **Step 2 — run, expect FAIL:** `npx vitest run tests/onboarding.test.js`

- [ ] **Step 3 — implement `onboarding.js`** (pure builders + gate exported; trigger wrappers below them). Selectors target real Library/output anchors; adapt the exact selectors to the live DOM when wiring (Tasks 6–7), but these are the intended anchors:
```js
// onboarding.js
import { COPY } from './onboarding-copy.js';

export const MILESTONE_AT = 5;

// Each step: { target (CSS selector or null=center), copyKey, mascotState, before? }
export function introStageA() {
  return [
    { target: null, copyKey: 'introGreet', mascotState: 'idle' },
    { target: '[data-node-demo], #grid .lib-card', copyKey: 'introCard', mascotState: 'idle' },
    { target: '#lib-btn-corkboard', copyKey: 'introCorkboard', mascotState: 'thinking' },
    { target: '#search', copyKey: 'introSearch', mascotState: 'idle' },
    { target: '#grid .lib-card', copyKey: 'introOpen', mascotState: 'idle' },
  ];
}
export function introStageB() {
  return [
    { target: '.v-fit, .lc-chip', copyKey: 'verdict', mascotState: 'strong' },
    { target: '[data-tab="27"]', copyKey: 'blueprint', mascotState: 'thinking' },
    { target: null, copyKey: 'farewell', mascotState: 'idle' },
  ];
}
export function milestoneSteps() {
  return [
    { target: '#lib-ask-input', copyKey: 'milestoneAsk', mascotState: 'idle' },
    { target: '#lib-btn-corkboard', copyKey: 'milestoneCorkboard', mascotState: 'thinking' },
    { target: '#lib-btn-select, [data-act="select"]', copyKey: 'milestoneCompare', mascotState: 'idle' },
    { target: '#lib-btn-radar', copyKey: 'milestoneOrganize', mascotState: 'idle' },
    { target: '#lib-btn-discover', copyKey: 'milestoneDiscover', mascotState: 'idle' },
  ];
}

/** Pure gate for the milestone offer. */
export function shouldOfferMilestone({ realCount, milestoneTourSeen, onboardingSeen }) {
  return !!onboardingSeen && !milestoneTourSeen && realCount >= MILESTONE_AT;
}

export { COPY };
```
(The trigger wrappers `maybeStartLibraryOnboarding`/`maybeContinueOnboarding`/`maybeOfferMilestoneTour`/`startOnboarding` are added in Tasks 6–7 where they read `chrome.storage` and call `startCoachmark` — kept out of this pure module's tested surface, or added here as thin async fns that import `coachmark.js` + `demo-repo.js`. Implementer's choice; keep the tested exports above pure.)

- [ ] **Step 4 — run, expect PASS + full suite:** `npx vitest run tests/onboarding.test.js` then `npx vitest run`
- [ ] **Step 5 — commit:** `git add onboarding.js tests/onboarding.test.js && git commit -m "feat(onboarding): step lists + milestone gate (pure)"`

---

### Task 4: Coachmark engine (`coachmark.js`)

**Files:** Create `coachmark.js`, `tests/coachmark.test.js`. Pure `placeCard` geometry is unit-tested; the DOM mount (veil/spotlight/card/Vee/nav) is concrete + verified live.

- [ ] **Step 1 — failing test (pure geometry):**
```js
// tests/coachmark.test.js
import { describe, it, expect } from 'vitest';
import { placeCard } from '../coachmark.js';

const VP = { w: 1000, h: 700 };
const CARD = { w: 320, h: 150 };

describe('placeCard', () => {
  it('places the card BELOW a target near the top', () => {
    const p = placeCard({ x: 400, y: 40, width: 120, height: 36 }, CARD, VP);
    expect(p.side).toBe('below');
    expect(p.top).toBeGreaterThan(40 + 36);
  });
  it('places the card ABOVE a target near the bottom', () => {
    const p = placeCard({ x: 400, y: 650, width: 120, height: 36 }, CARD, VP);
    expect(p.side).toBe('above');
    expect(p.top + CARD.h).toBeLessThanOrEqual(650);
  });
  it('keeps the card within the viewport horizontally', () => {
    const p = placeCard({ x: 980, y: 300, width: 40, height: 36 }, CARD, VP);
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + CARD.w).toBeLessThanOrEqual(VP.w - 8);
  });
  it('centers when target is null', () => {
    const p = placeCard(null, CARD, VP);
    expect(p.side).toBe('center');
    expect(Math.round(p.left)).toBe(Math.round((VP.w - CARD.w) / 2));
  });
});
```

- [ ] **Step 2 — run, expect FAIL:** `npx vitest run tests/coachmark.test.js`

- [ ] **Step 3 — implement `coachmark.js`:**
```js
// coachmark.js
// DOM coachmark tour: a dimming veil, a spotlight around a target element, a card
// (with Vee) anchored beside it, Back/Next/Skip + keyboard. No deps, MV3-safe.
import { renderMascot, setMascotState } from './mascot.js';

const GAP = 12, MARGIN = 8;

/** Pure: where to put the card relative to a target rect (or center if null). */
export function placeCard(rect, card, vp) {
  if (!rect) return { side: 'center', left: (vp.w - card.w) / 2, top: (vp.h - card.h) / 2 };
  const below = rect.y + rect.height + GAP, above = rect.y - GAP - card.h;
  const side = (below + card.h <= vp.h) ? 'below' : (above >= 0 ? 'above' : 'below');
  const top = side === 'below' ? below : above;
  let left = rect.x + rect.width / 2 - card.w / 2;
  left = Math.max(MARGIN, Math.min(left, vp.w - card.w - MARGIN));
  return { side, left, top: Math.max(MARGIN, Math.min(top, vp.h - card.h - MARGIN)) };
}

/**
 * @param {{steps:Array, copy:object, autoplay?:boolean, onExit?:fn}} args
 *   step = { target:selector|null, copyKey, mascotState, before? }
 * @returns {{ next, prev, exit }}
 */
export function startCoachmark({ steps, copy, onExit }) {
  let i = 0;
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const veil = document.createElement('div'); veil.className = 'cm-veil';
  const spot = document.createElement('div'); spot.className = 'cm-spotlight';
  const card = document.createElement('div'); card.className = 'cm-card';
  const veeSlot = document.createElement('div'); veeSlot.className = 'cm-vee';
  const vee = renderMascot(veeSlot);
  const text = document.createElement('p'); text.className = 'cm-text';
  const ctl = document.createElement('div'); ctl.className = 'cm-ctl';
  const back = document.createElement('button'); back.textContent = 'Back';
  const next = document.createElement('button'); next.textContent = 'Next';
  const skip = document.createElement('button'); skip.textContent = 'Skip'; skip.className = 'cm-skip';
  ctl.append(skip, back, next);
  card.append(veeSlot, text, ctl);
  veil.append(spot); document.body.append(veil, card);

  async function render() {
    const s = steps[i];
    if (s.before) { try { await s.before(); } catch { /* step action best-effort */ } }
    setMascotState(vee, s.mascotState || 'idle');
    text.textContent = copy[s.copyKey] || '';
    back.disabled = i === 0;
    next.textContent = i === steps.length - 1 ? 'Done' : 'Next';
    const el = s.target ? document.querySelector(s.target) : null;
    const vp = { w: innerWidth, h: innerHeight };
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      const r = el.getBoundingClientRect();
      spot.style.cssText = `display:block;left:${r.x - 6}px;top:${r.y - 6}px;width:${r.width + 12}px;height:${r.height + 12}px`;
      const p = placeCard({ x: r.x, y: r.y, width: r.width, height: r.height }, { w: card.offsetWidth || 320, h: card.offsetHeight || 150 }, vp);
      card.style.left = p.left + 'px'; card.style.top = p.top + 'px';
    } else {
      spot.style.display = 'none';
      const p = placeCard(null, { w: card.offsetWidth || 320, h: card.offsetHeight || 150 }, vp);
      card.style.left = p.left + 'px'; card.style.top = p.top + 'px';
    }
  }
  function go(n) { i = Math.max(0, Math.min(steps.length - 1, n)); render(); }
  function step(d) { (i + d >= steps.length) ? exit() : go(i + d); }
  function exit() { veil.remove(); card.remove(); removeEventListener('keydown', onKey); onExit && onExit(); }
  const onKey = (e) => { if (e.key === 'Escape') exit(); else if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1); };
  back.onclick = () => step(-1); next.onclick = () => step(1); skip.onclick = exit;
  addEventListener('keydown', onKey);
  render();
  return { next: () => step(1), prev: () => step(-1), exit };
}
```

- [ ] **Step 4 — run, expect PASS:** `npx vitest run tests/coachmark.test.js` then `npx vitest run`
- [ ] **Step 5 — commit:** `git add coachmark.js tests/coachmark.test.js && git commit -m "feat(onboarding): coachmark engine (pure placeCard + veil/spotlight/card/Vee)"`

---

### Task 5: Coachmark styles (`themes.css`)

**Files:** Modify `themes.css` (append, token-based, reduced-motion-guarded).

- [ ] **Step 1 — append:**
```css
/* ── Onboarding coachmark ── */
.cm-veil { position: fixed; inset: 0; z-index: 9000; background: color-mix(in srgb, var(--text, #000) 55%, transparent); }
.cm-spotlight { position: fixed; border-radius: 10px; box-shadow: 0 0 0 9999px color-mix(in srgb, var(--text,#000) 55%, transparent), 0 0 0 2px var(--accent, #c2691c); transition: all .2s var(--ease-out, ease); pointer-events: none; }
.cm-card { position: fixed; z-index: 9001; width: 320px; max-width: 92vw; background: var(--surface, #fffdf6); color: var(--text, #211c14); border: 1px solid var(--border, #b9a273); border-radius: 12px; padding: 14px 16px; box-shadow: 0 12px 30px rgba(0,0,0,.3); }
.cm-vee { width: 56px; height: 56px; float: right; margin: 0 0 6px 10px; }
.cm-text { margin: 2px 0 12px; font-size: 14.5px; line-height: 1.5; }
.cm-ctl { display: flex; gap: 8px; align-items: center; }
.cm-ctl button { padding: 6px 12px; border-radius: 8px; font-size: 13px; cursor: pointer; border: 1px solid var(--border, #b9a273); background: var(--surface, #fffdf6); color: var(--text); }
.cm-ctl .cm-skip { margin-right: auto; border: none; background: transparent; color: var(--text-sub, #6b5a36); }
.cm-badge-demo { font: 700 9px/1 ui-monospace, monospace; letter-spacing: .1em; color: #fff; background: var(--accent, #c2691c); border-radius: 4px; padding: 2px 5px; margin-left: 6px; vertical-align: middle; }
@media (prefers-reduced-motion: reduce) { .cm-spotlight { transition: none; } }
```

- [ ] **Step 2 — verify** braces balanced (`node -e` brace count) + `npx vitest run` green.
- [ ] **Step 3 — commit:** `git add themes.css && git commit -m "feat(onboarding): coachmark styles (token-based, reduced-motion)"`

---

### Task 6: Wire the Library (intro trigger, milestone offer, replay chip, ⌘K, demo seed/teardown)

**Files:** Modify `library.html`, `library.js`. DOM glue — verified live (no unit test). **Read `library.js` init/render, the `chrome.storage.local` usage (the `guideSeen` pattern), `allRows`, the stats render, the ⌘K palette command list, and `openRow` before editing.**

- [ ] **Step 1 — add the demo badge + empty-state chip in `library.html`** (the chip lives in the empty-state markup library.js renders, so add it in the `#empty` template inside `library.js` instead — see Step 2). In `library.html` no structural change is required beyond confirming `#empty` exists.

- [ ] **Step 2 — `library.js`:** import and wire. Add near the other imports:
```js
import { introStageA, shouldOfferMilestone, milestoneSteps, COPY } from './onboarding.js';
import { startCoachmark } from './coachmark.js';
import { DEMO_REPO, demoScene, isDemo } from './demo-repo.js';
import { saveRepo, deleteRepo, saveScene } from './store.js';
```
After `init()` + first `render()`, add:
```js
async function checkOnboarding() {
  const { onboardingSeen, milestoneTourSeen } = await chrome.storage.local.get(['onboardingSeen','milestoneTourSeen']);
  const real = (allRows || []).filter((r) => !isDemo(r));
  if (!onboardingSeen) {
    if (real.length === 0) return startIntro();         // brand-new → run intro
    await chrome.storage.local.set({ onboardingSeen: true }); // returning user, skip
  }
  if (shouldOfferMilestone({ realCount: real.length, milestoneTourSeen: !!milestoneTourSeen, onboardingSeen: true })) {
    offerMilestone(real.length);
  }
}
async function startIntro() {
  await saveRepo(DEMO_REPO); await saveScene(demoScene());   // seed demo (real surfaces)
  await refreshRows(); render();                              // re-render so the demo card shows
  startCoachmark({
    steps: introStageA(), copy: COPY,
    onExit: async () => { await chrome.storage.local.set({ onboardingStage: 'verdict' }); openRow(DEMO_REPO.repoId); },
  });
}
function offerMilestone(n) {
  startCoachmark({
    steps: [{ target: null, copyKey: 'milestoneOffer', mascotState: 'idle' }],
    copy: { ...COPY, milestoneOffer: COPY.milestoneOffer.replace('{N}', n) },
    onExit: async () => { /* offer card's Next leads into the tour */ startCoachmark({ steps: milestoneSteps(), copy: COPY, onExit: () => chrome.storage.local.set({ milestoneTourSeen: true }) }); },
  });
}
```
> Adapt: the demo teardown — on intro completion (Stage B's farewell) clear the demo; on any Library load when `onboardingSeen` is true, sweep stray demos: `for (const r of allRows) if (isDemo(r)) await deleteRepo(r.repoId)`. Make `offerMilestone` a 3-button prompt (Show me / Maybe later / Don't ask) rather than auto-running — wire "Maybe later" to re-offer at ≥10, "Don't ask"/complete → set `milestoneTourSeen`. Exclude `isDemo` rows from the stats counts in the stats render. Add a "Take the tour" command to the ⌘K palette and a "👋 New here? Take the tour" chip to the `#empty` template, both calling `startIntro()`.

- [ ] **Step 3 — verify:** `node --check library.js`; `npx vitest run` (all green); reload the extension, confirm the intro fires on an empty library and the demo card appears.
- [ ] **Step 4 — commit:** `git add library.html library.js && git commit -m "feat(onboarding): Library intro trigger + milestone offer + replay + demo seed/teardown"`

---

### Task 7: Wire Stage B in output-tab (`output-tab.js`)

**Files:** Modify `output-tab.js`. DOM glue — verified live. **Read how output-tab gets its data + the Canvas tab (Task-14 of the canvas plan: `data-tab="27"`, `renderCanvas`).**

- [ ] **Step 1 — `output-tab.js`:** import + call on init:
```js
import { introStageB, COPY } from './onboarding.js';
import { startCoachmark } from './coachmark.js';
import { clearDemoEverywhere } from './demo-repo.js'; // small helper: delete demo repo + scene
```
After the page renders a repo, add:
```js
async function maybeContinueOnboarding(d) {
  const { onboardingStage } = await chrome.storage.local.get('onboardingStage');
  if (onboardingStage !== 'verdict') return;
  await chrome.storage.local.remove('onboardingStage');
  startCoachmark({
    steps: introStageB(), copy: COPY,
    onExit: async () => {
      await clearDemoEverywhere();                        // remove the seeded demo
      await chrome.storage.local.set({ onboardingSeen: true });
    },
  });
}
```
> `introStageB()` step 2 has `before: () => show(27)` to open the Canvas tab before spotlighting the Blueprint — add that `before` hook in `onboarding.js`'s `introStageB` (it can call the page's tab-switch). Add `clearDemoEverywhere()` to `demo-repo.js` (deletes the demo repo via `deleteRepo` + its scene via `deleteScene`). Guard each step's target so it no-ops if absent.

- [ ] **Step 2 — verify:** `node --check output-tab.js`; `npx vitest run`; reload + run the intro through to Stage B.
- [ ] **Step 3 — commit:** `git add output-tab.js demo-repo.js && git commit -m "feat(onboarding): output-tab Stage-B continuation + demo teardown"`

---

### Task 8: Flags allowlist, replay button, demo exclusions

**Files:** Modify `settings-backup.js`, `options.{js,html}`, `store.js`, `backup.js`.

- [ ] **Step 1 — `settings-backup.js`:** add `'onboardingSeen'`, `'milestoneTourSeen'` to `SAFE_SETTING_KEYS`. `node --check`.
- [ ] **Step 2 — `options.html`/`options.js`:** add a **"Replay onboarding"** button → `chrome.storage.local.set({ onboardingSeen: false, milestoneTourSeen: false }); chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });`
- [ ] **Step 3 — `store.js`/`backup.js`:** exclude `__demo__` rows from `exportStores`/`buildBackup` and from any library-stats count (filter `!isDemo(r)` / `!r.payload?.__demo__`). Add a tiny test in `tests/backup-scenes.test.js` or a new test asserting a `__demo__` repo is dropped from `buildBackup`.
- [ ] **Step 4 — verify + commit:** `npx vitest run`; `git add -A && git commit -m "feat(onboarding): allowlist flags, replay button, exclude __demo__ from export/stats"`

---

### Task 9: De-slop voice review + docs + demo harness

**Files:** `onboarding-copy.js` (review only), `CHANGELOG.md`, `README.md`, `onboarding-demo.html` (new, standalone).

- [ ] **Step 1 — copy-reviewer gate:** dispatch a code/copy reviewer over `onboarding-copy.js` with the anti-slop ruleset (banned vocab, em dash, exclamation cap, the Vee formula). Apply any fixes; the `tests/onboarding-copy.test.js` machine-check must still pass. (This is the human-judgment layer the test can't cover: does each line sound like a dry senior engineer, not a brochure?)
- [ ] **Step 2 — `onboarding-demo.html`:** a standalone page that mounts `coachmark.js` over a few fake target elements with the real `COPY`, so the look can be screenshotted without the extension context (mirrors `canvas-demo.html`).
- [ ] **Step 3 — docs:** CHANGELOG entry + README "What you get" note: a Vee-guided first-run tour + a milestone power tour. Commit.

---

## Final verification
- [ ] `npx vitest run` — all green (new: demo-repo, onboarding-copy [the anti-slop gate], onboarding, coachmark).
- [ ] `node --check` on every new/changed `.js`.
- [ ] **Live smoke:** fresh profile → open Library → intro fires, demo seeds, Vee walks Stage A → opens demo → Stage B (Verdict + Blueprint) → demo cleared, `onboardingSeen` set. Scan 5 real repos → milestone offer appears. Replay from chip / ⌘K / Settings. Reduced-motion + a couple themes. Screenshot via `onboarding-demo.html`.

## Out of scope
- Telemetry of any kind. Branching tours by persona. Voiced/audio Vee.
