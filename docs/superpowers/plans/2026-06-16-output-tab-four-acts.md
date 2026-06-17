# Output Tab — Four-Act Narrative — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the output tab's flat 28-tab nav into a four-act narrative (Decide → Understand → Go Deeper → Act) — keeping every panel, render function, and deep link — by introducing a pure act-model module and a two-tier nav, then a few targeted UX fixes.

**Architecture:** Keep the existing `#t0`–`#t27` panels, their render functions, and `show(n)` **unchanged in behavior**. Add a pure, unit-tested `output-acts.js` that groups tab indices into four ordered acts. Replace the flat `.tab-nav` markup with a two-tier nav (primary act row + a secondary row showing only the active act's tabs), generated from the act model. Make `show(n)` also highlight the owning act and render its secondary row. Layer on targeted UX fixes (decision-to-top, previews→jumps, highlights-anchor) as isolated tasks. No `background.js` / message-contract changes.

**Tech Stack:** Vanilla ES modules (zero-build, no deps), Vitest (pure logic only — no DOM env), `node --check` for DOM glue, existing `*-demo.html` harness + Playwright for visual checks. Brand: Mono Ink, motion behind `prefers-reduced-motion` (`--dur-*`/`--ease-*` tokens already in `themes.css`).

---

## Why this is lower-risk than a rewrite

Confirmed by reading the current code:
- **Slugs already exist** (`TAB_SLUGS` in `output-tab.js:2200`) and `show()` already writes `#slug` + persists `repolens_tab_<repoId>`. So existing deep links and per-repo recall **already work** — the act model only adds "which act owns this tab" on top.
- **Lens labeling already exists** — `initScanTips()` (`output-tab.js:2257`) shows BEST-FOR / SKIP-IF / COST tooltips per tab, and the `?`-guide lists every lens with cost. Deep Dive already has staged progress (`ddProgressHtml`). So "label lenses" is mostly **surfacing what exists** under the Go-Deeper act, not new work.
- The nav is a single `.tab-nav` block (`output-tab.html:845-885`) and one click handler (`output-tab.js:2231`). Swapping flat→two-tier is contained.

⚠️ **One coupling to fix:** `show(n)` toggles panels via `forEach((c, idx) => ... idx === n)` (`output-tab.js:2212`) — it relies on `.tab-content` DOM order matching the tab index. Today that holds (`#t0`…`#t27` are in order). Task 6 changes this to select by id (`#t${n}`) so it stays correct regardless of DOM order.

---

## File Structure

- **Create** `output-acts.js` — pure act model: `ACTS`, `TAB_LABELS`, `actForTab()`, `tabsForAct()`, `ACT_ORDER`. No DOM, no imports. One responsibility: the tab↔act grouping + labels.
- **Create** `tests/output-acts.test.js` — completeness + helper tests.
- **Modify** `output-tab.html` — replace the `.tab-nav` inner markup (845-885) with two-tier containers (`#act-nav`, `#act-subnav`); keep all `#t0`–`#t27` panels untouched.
- **Modify** `output-tab.js` — import the act model; render the two-tier nav; make `show(n)` select panels by id and set the active act + secondary row; update the nav click handler.
- **Modify** the verdict/decision render in `output-tab.js` (Task 8) — move decision control to the top.
- **Modify** `renderHighlights` in `output-tab.js` (Task 10) — anchor instead of cross-navigate.

---

## Phase 1 — Foundation: the pure act model

### Task 1: Create the act model

**Files:**
- Create: `output-acts.js`
- Test: `tests/output-acts.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/output-acts.test.js
import { describe, it, expect } from 'vitest';
import { ACTS, ACT_ORDER, TAB_LABELS, actForTab, tabsForAct } from '../output-acts.js';

describe('act model', () => {
  it('orders the four acts', () => {
    expect(ACT_ORDER).toEqual(['decide', 'understand', 'deeper', 'act']);
  });

  it('covers every tab index 0..27 exactly once', () => {
    const all = ACTS.flatMap((a) => a.tabs).sort((x, y) => x - y);
    expect(all).toEqual(Array.from({ length: 28 }, (_, i) => i));
    expect(new Set(all).size).toBe(28); // no duplicates
  });

  it('maps a tab to its owning act', () => {
    expect(actForTab(9)).toBe('decide');
    expect(actForTab(7)).toBe('understand'); // Health
    expect(actForTab(10)).toBe('deeper');    // Deep Dive
    expect(actForTab(17)).toBe('act');       // Versus
    expect(actForTab(99)).toBeNull();
  });

  it('lists tabs for an act in display order', () => {
    expect(tabsForAct('decide')).toEqual([9]);
    expect(tabsForAct('understand')[0]).toBe(0); // ELI5 leads
    expect(tabsForAct('nope')).toEqual([]);
  });

  it('has a label for every tab it groups', () => {
    for (const t of ACTS.flatMap((a) => a.tabs)) {
      expect(typeof TAB_LABELS[t]).toBe('string');
      expect(TAB_LABELS[t].length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/output-acts.test.js`
Expected: FAIL — `Cannot find module '../output-acts.js'`.

- [ ] **Step 3: Write the module**

```js
// output-acts.js
// Pure act model for the output tab. Groups the existing tab indices (the #t0..#t27
// panels) into four ordered "acts" — Decide, Understand, Go Deeper, Act — for a
// two-tier nav. No DOM, no network, no imports: this is the testable contract the
// nav rendering and show() build on. Tab indices and slugs are unchanged from the
// existing TAB_SLUGS, so deep links and per-repo recall keep working.

export const ACTS = [
  { id: 'decide',     label: 'Decide',    tabs: [9] },
  { id: 'understand', label: 'Understand', tabs: [0, 1, 2, 3, 4, 5, 8, 6, 7, 15] },
  { id: 'deeper',     label: 'Go Deeper', tabs: [10, 27, 11, 12, 13, 14, 21, 22, 23, 24] },
  { id: 'act',        label: 'Act',       tabs: [25, 16, 17, 18, 19, 20, 26] },
];

export const ACT_ORDER = ACTS.map((a) => a.id);

// Tab index → human label (mirrors the current nav button text; used to render
// the secondary row from the model instead of hardcoded HTML).
export const TAB_LABELS = {
  9: 'Verdict',
  0: 'ELI5', 1: 'Technical', 2: 'Use Cases', 3: 'Skip If', 4: 'Enables',
  5: 'Pros / Cons', 8: 'Red Flags', 6: 'Alternatives', 7: 'Health', 15: 'Tech Stack',
  10: 'Deep Dive', 27: 'Canvas', 11: 'Systems', 12: 'Ideate', 13: 'Prioritize',
  14: 'SKTPG', 21: 'Docs Quality', 22: 'Maintenance', 23: 'License', 24: 'Since Last Scan',
  25: 'Fits MY Stack?', 16: 'Similar', 17: 'Versus', 18: 'Synergies',
  19: 'Connections', 20: 'Combine', 26: 'Ask',
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
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run tests/output-acts.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint the new module**

Run: `npx eslint output-acts.js tests/output-acts.test.js`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add output-acts.js tests/output-acts.test.js
git commit -m "feat(output): pure four-act model for the output tab"
```

---

## Phase 2 — Two-tier nav

### Task 2: Replace the flat nav markup with two-tier containers

**Files:**
- Modify: `output-tab.html:845-885` (the `.tab-nav` block)

- [ ] **Step 1: Replace the markup**

Replace the entire `<div class="tab-nav"> … </div>` block (current lines 845-885, the flat buttons + Lenses/Library menus) with two empty containers that `output-tab.js` will populate from the act model:

```html
  <!-- Tabs: two-tier act nav (primary acts + secondary row), built in output-tab.js -->
  <nav class="act-nav" id="act-nav" aria-label="Sections"></nav>
  <div class="act-subnav" id="act-subnav" role="tablist"></div>
```

- [ ] **Step 2: Add the nav styles**

Add to the `<style>` block (next to the existing `.tab-nav` rules, ~line 48). The secondary row reuses the existing `.tab-btn` styling so panels/active states are consistent:

```css
  .act-nav { background: var(--surface); border-bottom: 1px solid var(--border); padding: 0 32px; display: flex; gap: 4px; }
  .act-tab { padding: 14px 20px; font-size: 13px; font-weight: 700; letter-spacing: -0.01em; color: var(--text-faint); cursor: pointer; background: none; border: none; border-bottom: 2px solid transparent; transition: color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out); }
  .act-tab:hover { color: var(--text-sub); }
  .act-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .act-subnav { background: var(--surface-alt); border-bottom: 1px solid var(--border); padding: 8px 32px; display: flex; gap: 4px; flex-wrap: wrap; }
  .act-subnav:empty { display: none; }
```

- [ ] **Step 3: Verify the file still parses**

Run: `npm run check:html`
Expected: PASS — "HTML parse check passed".

- [ ] **Step 4: Commit**

```bash
git add output-tab.html
git commit -m "feat(output): two-tier act nav containers + styles"
```

### Task 3: Render the two-tier nav from the act model

**Files:**
- Modify: `output-tab.js` — import the act model (top, with the other imports) and add a nav-render function; call it once at startup near the existing `initScanTips()` / `initGuide()` calls (~line 2299).

- [ ] **Step 1: Add the import**

At the top of `output-tab.js` with the other `import` lines, add:

```js
import { ACTS, TAB_LABELS, actForTab, tabsForAct } from './output-acts.js';
```

- [ ] **Step 2: Add the nav renderers**

Add these functions near `show()` (after the `SLUG_TO_TAB` definition, ~line 2208):

```js
// Two-tier act nav: a primary row of acts, and a secondary row of the active
// act's tabs. Both are generated from the act model so the grouping has one
// source of truth. Buttons keep `data-tab` so the existing show() path is reused.
function renderActNav() {
  const nav = document.getElementById('act-nav');
  if (!nav) return;
  nav.innerHTML = ACTS.map(
    (a) => `<button class="act-tab" data-act="${a.id}">${a.label}</button>`,
  ).join('');
}

function renderSubNav(actId) {
  const sub = document.getElementById('act-subnav');
  if (!sub) return;
  const tabs = tabsForAct(actId);
  // A single-tab act (Decide) needs no secondary row.
  sub.innerHTML = tabs.length <= 1
    ? ''
    : tabs.map((n) => `<button class="tab-btn" data-tab="${n}">${TAB_LABELS[n]}</button>`).join('');
}
```

- [ ] **Step 3: Call renderActNav at startup**

Immediately after the `const SLUG_TO_TAB = …` line, or alongside `initScanTips();` (~line 2299), add:

```js
renderActNav();
```

- [ ] **Step 4: Syntax check**

Run: `node --check output-tab.js`
Expected: no output (valid).

- [ ] **Step 5: Commit**

```bash
git add output-tab.js
git commit -m "feat(output): render two-tier act nav from the model"
```

---

## Phase 3 — Make show() act-aware + wire clicks

### Task 4: Select panels by id and set the active act

**Files:**
- Modify: `output-tab.js` — the `show()` function (current lines 2210-2228).

- [ ] **Step 1: Replace show()**

Replace the current `show()` with this version. Changes: (a) panels are selected by id `#t${n}` (removes the fragile `idx === n` DOM-order coupling), (b) it sets the active act button and renders/marks the secondary row, (c) it keeps the existing hash + per-repo persistence verbatim.

```js
function show(n, { updateHash = true } = {}) {
  // Active tab button (in the secondary row) + active panel (by id, not DOM order).
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', Number(b.dataset.tab) === n));
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
  document.getElementById(`t${n}`)?.classList.add('active');

  // Active act: highlight it and render its secondary row (if not already shown).
  const actId = actForTab(n);
  document.querySelectorAll('.act-tab').forEach((b) => b.classList.toggle('active', b.dataset.act === actId));
  const sub = document.getElementById('act-subnav');
  if (sub && sub.dataset.act !== actId) {
    renderSubNav(actId);
    sub.dataset.act = actId || '';
  }
  // Re-mark the active secondary button after a possible re-render.
  document.querySelectorAll('#act-subnav .tab-btn').forEach((b) => b.classList.toggle('active', Number(b.dataset.tab) === n));

  // Blueprint canvas mounts lazily on every activation path (idempotent + null-safe).
  if (n === 27) renderCanvas(lastData).catch((err) => console.error('[canvas] render failed', err));

  if (updateHash && TAB_SLUGS[n]) {
    history.replaceState(null, '', `#${TAB_SLUGS[n]}`);
  }
  if (updateHash && lastData?.repoId) {
    chrome.storage.local.set({ [`repolens_tab_${lastData.repoId}`]: n }).catch(() => {});
  }
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check output-tab.js`
Expected: valid.

- [ ] **Step 3: Commit**

```bash
git add output-tab.js
git commit -m "refactor(output): show() selects panels by id and tracks the active act"
```

### Task 5: Rewrite the nav click handler for two tiers

**Files:**
- Modify: `output-tab.js` — the `.tab-nav` click handler (current lines 2231-2248) and the outside-click handler (2250-2253).

- [ ] **Step 1: Replace the click handlers**

The old handler listened on `.tab-nav` (now removed) and managed dropdown menus (gone). Replace both handlers with act-nav + subnav handling. An act click shows that act's first tab; a secondary `data-tab` click behaves like before. `run-all-lenses` moves to a button rendered inside the Go-Deeper subnav header (Task 11) — for now, keep the existing `runAllLenses()` reachable via a delegated check.

```js
// Primary act row: clicking an act shows its first tab.
document.getElementById('act-nav')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.act-tab');
  if (!btn) return;
  const first = tabsForAct(btn.dataset.act)[0];
  if (first != null) show(first);
});

// Secondary row: clicking a tab switches panels (same contract as before).
document.getElementById('act-subnav')?.addEventListener('click', (e) => {
  if (e.target.closest('#run-all-lenses')) { runAllLenses(); return; }
  const btn = e.target.closest('[data-tab]');
  if (!btn) return;
  const n = Number(btn.dataset.tab);
  show(n);
  if (n === 19) renderConnections(lastData); // Connections: pull fresh on each open
});
```

Delete the old `document.querySelector('.tab-nav')?.addEventListener(...)` block and the outside-click menu-closer (`document.addEventListener('click', … '.tab-nav' …)`), which referenced the removed dropdown menus.

- [ ] **Step 2: Update initScanTips to target the subnav**

`initScanTips()` (line 2257-2299) does `const nav = document.querySelector('.tab-nav')`. Change that one line to:

```js
  const nav = document.getElementById('act-subnav');
```

Tooltips re-bind to whatever is in the subnav; because the subnav re-renders per act, call `initScanTips()` once is not enough — instead make the tip listeners delegate from the persistent `#act-subnav` element (they already use `nav.addEventListener('mouseover', …)` with `closest('.tab-btn[data-tab]')`, which survives subnav re-renders since the listener is on the container). The decorative `ⓘ` marker loop runs only on current buttons; move that marker loop into `renderSubNav()` instead so freshly-rendered buttons get it. Add to the end of `renderSubNav()`:

```js
  sub.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
    if (explainerFor(btn.dataset.tab) && !btn.querySelector('.tip-i')) {
      const i = document.createElement('span');
      i.className = 'tip-i';
      i.textContent = 'ⓘ';
      btn.appendChild(i);
    }
  });
```

(`explainerFor` is already imported/used in `output-tab.js`.)

- [ ] **Step 3: Syntax check**

Run: `node --check output-tab.js`
Expected: valid.

- [ ] **Step 4: Manual smoke via the existing flow**

Run the extension's output tab against a cached/demo analysis (or the `*-demo.html` harness if present for output-tab). Confirm: four act buttons appear; clicking each shows its tabs; clicking a tab shows the panel; `#health` deep-link opens with Understand active; reload restores last position.

- [ ] **Step 5: Commit**

```bash
git add output-tab.js
git commit -m "feat(output): two-tier nav click handling + tooltips on subnav"
```

### Task 6: Verify deep-link + restore still resolve to the right act

**Files:**
- Modify (if needed): wherever `output-tab.js` reads the initial `location.hash` / `repolens_tab_<repoId>` on load and calls `show(...)`.

- [ ] **Step 1: Locate the initial-route code**

Run: `grep -n "location.hash\|repolens_tab_\|SLUG_TO_TAB" output-tab.js`
Read each hit. The on-load path that maps an initial `#slug` or stored index to `show(n)` must run **after** `renderActNav()` so the act buttons exist.

- [ ] **Step 2: Ensure ordering**

Confirm `renderActNav()` (Task 3) runs before the initial `show(...)` call. If the initial route runs earlier in the file, move `renderActNav()` up so the nav exists first. `show()` itself renders the needed subnav, so no further change is required.

- [ ] **Step 3: Syntax check + commit (if changed)**

Run: `node --check output-tab.js`
```bash
git add output-tab.js
git commit -m "fix(output): render act nav before the initial route resolves"
```

---

## Phase 4 — Targeted UX fixes (each isolated)

### Task 7: Move the Decision control to the top of Decide

**Files:**
- Modify: `output-tab.js` — `renderDecisionControl()` (~line 2083) and the verdict render (`verdictDashboard()`, ~line 1895) where the `.dl-block` is appended.

- [ ] **Step 1: Read the current placement**

Run: `grep -n "dl-block\|renderDecisionControl\|verdictDashboard" output-tab.js` and read both functions. Today the decision block is appended at the end of the verdict panel.

- [ ] **Step 2: Re-anchor it near the top**

Move the decision block's insertion so it renders immediately after the fit chip (`.v-fit`) and bottom line (`.v-line`), before `.v-facts`. Keep `renderDecisionControl()`'s internals unchanged — only change where its output is inserted in the verdict panel HTML/assembly. Remove the `margin-top: 28px; border-top` lead-in from `.dl-block` (output-tab.html ~line 306) since it's no longer a trailing block; replace with `margin: 16px 0;`.

- [ ] **Step 3: Verify**

Run: `node --check output-tab.js && npm run check:html`
Manually confirm in the output tab that the Adopt/Trial/Hold/Reject control is visible near the top of Decide without scrolling.

- [ ] **Step 4: Commit**

```bash
git add output-tab.js output-tab.html
git commit -m "feat(output): surface the decision control at the top of Decide"
```

### Task 8: Make "Worth noting" highlights anchor, not cross-navigate

**Files:**
- Modify: `output-tab.js` — `renderHighlights()` (~line 780).

- [ ] **Step 1: Read renderHighlights**

Run: `grep -n "renderHighlights\|hl-row\|hl-jump" output-tab.js` and read it. Today a highlight click calls `show(tabIndex)`, navigating away from Decide.

- [ ] **Step 2: Change the click target**

When a highlight maps to a section, switch to that section's act + tab and scroll the panel into view rather than silently swapping (so the user keeps orientation). Concretely, the click handler should call `show(n)` then `document.getElementById('t' + n)?.scrollIntoView({ behavior: 'smooth', block: 'start' })`. Respect reduced motion: use `{ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }`.

- [ ] **Step 3: Verify + commit**

Run: `node --check output-tab.js`
```bash
git add output-tab.js
git commit -m "feat(output): highlights jump to their section with orientation"
```

### Task 9: Verdict previews link to the canonical section (dedupe)

**Files:**
- Modify: `output-tab.js` — the verdict render's preview blocks (tech stack chips, top flags) and the existing `.v-jumps` row (output-tab.html ~641).

- [ ] **Step 1: Read the verdict jumps**

Run: `grep -n "v-jumps\|v-jump\|v-facts" output-tab.js` and read. A `.v-jumps` row already exists with jump buttons.

- [ ] **Step 2: Ensure each preview has a jump**

Confirm the Verdict tech-stack chips and top-flags previews each have a corresponding jump to their full section (Tech Stack = tab 15, Red Flags = tab 8). If a jump is missing, add a `.v-jump` button calling `show(15)` / `show(8)`. Do not remove the previews — the rule is "preview + jump to canonical," not deletion.

- [ ] **Step 3: Verify + commit**

Run: `node --check output-tab.js`
```bash
git add output-tab.js
git commit -m "feat(output): verdict previews jump to their canonical sections"
```

### Task 10: Surface "Run all lenses" in the Go-Deeper subnav

**Files:**
- Modify: `output-tab.js` — `renderSubNav()` (from Task 3).

- [ ] **Step 1: Add the run-all control for the deeper act**

In `renderSubNav()`, when `actId === 'deeper'`, prepend the existing run-all control so it lives with the lenses (it was previously inside the removed Lenses dropdown):

```js
  if (actId === 'deeper') {
    sub.insertAdjacentHTML('afterbegin',
      `<button class="tab-menu-run" id="run-all-lenses">▸ Run all lenses ` +
      `<span id="lens-progress" style="font:500 10px/1 ui-monospace,monospace;opacity:.7;margin-left:4px"></span></button>`);
  }
```

The Task-5 subnav click handler already routes `#run-all-lenses` to `runAllLenses()`.

- [ ] **Step 2: Verify + commit**

Run: `node --check output-tab.js`
```bash
git add output-tab.js
git commit -m "feat(output): run-all-lenses lives in the Go-Deeper subnav"
```

---

## Phase 5 — Folded-in journey win

### Task 11: Circular library ↔ output navigation

**Files:**
- Modify: `library.js` (or `library.html`) — add an "Output / back to repo" affordance where a repo card opens; and confirm `output-tab.js`'s `open-library` button (`#open-library`, output-tab.html:822) round-trips.

- [ ] **Step 1: Read both ends**

Run: `grep -n "open-library\|library.html\|tabs.create" output-tab.js library.js` and read. Today `#open-library` opens `library.html` in a new tab.

- [ ] **Step 2: Add the return path**

In the library, ensure opening a saved repo's analysis and the library itself can round-trip without orphaning tabs (e.g., reuse/focus an existing output tab for the same repo via `chrome.tabs` query, or add a visible "← Library" control in the output header that focuses the library tab if open). Keep it minimal — one clear, reversible path each way.

- [ ] **Step 3: Verify + commit**

Run: `node --check output-tab.js library.js`
```bash
git add output-tab.js library.js
git commit -m "feat(flow): circular library <-> output navigation"
```

---

## Phase 6 — Verification

### Task 12: Full verification pass

- [ ] **Step 1: Unit tests**

Run: `npx vitest run`
Expected: all pass, including the new `tests/output-acts.test.js` (total = prior 857 + 5).

- [ ] **Step 2: Lint + HTML gate**

Run: `npx eslint . && npm run check:html`
Expected: 0 errors; "HTML parse check passed".

- [ ] **Step 3: Syntax**

Run: `node --check output-tab.js && node --check output-acts.js && node --check library.js`
Expected: valid.

- [ ] **Step 4: Visual (per web testing rules)**

Drive the output tab (cached/demo analysis or `*-demo.html` harness). Playwright screenshots at 320 / 768 / 1024 / 1440. Verify: four acts render and switch; Decide shows decision control without scrolling; deep links (`#health`, `#deep-dive`, `#versus`) open the right act; keyboard nav works; reduced-motion honored; focus ring + contrast OK.

- [ ] **Step 5: Final commit (if any screenshot fixtures/notes)**

```bash
git add -A
git commit -m "test(output): four-act visual + a11y verification"
```

---

## Spec coverage check

- 28 destinations → four acts: **Task 1** (model) + **Tasks 2-5** (nav).
- Decision control to top: **Task 7**.
- Previews jump to canonical (dedupe): **Task 9**; highlights anchor: **Task 8**.
- Lens labeling/prereq/time: already present (BEST-FOR/SKIP-IF/COST tooltips + `?`-guide + in-panel prereq CTAs), surfaced under Go Deeper; run-all relocated in **Task 10**.
  - ⚠️ **Partial vs spec:** "live progress" is real for Deep Dive (`ddProgressHtml`) but Maintenance/Docs only show a "thinking" state. Adding richer per-lens progress would require `background.js` streaming changes, which this spec puts out of scope — so it's a **deliberate follow-up**, not delivered here.
- Deep links + per-repo recall preserved: **Tasks 4, 6** (slugs unchanged).
- Keyboard nav preserved: existing handler unchanged (acts switch via secondary tabs + existing keys); verified in **Task 12**.
- Circular nav (folded-in B win): **Task 11**.
- Constraints (zero-build, Mono Ink, reduced-motion, no `background.js` changes): honored throughout; verified in **Task 12**.

## Out of scope (per spec)

Gamification/juice (Pillar 3), settings redesign, new analysis features, rewriting section internals or the analysis pipeline.
