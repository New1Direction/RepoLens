# The Mastery Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-graded mastery loop — earn a per-repo mastery signal from the deep-dive's existing self-test questions, persist it locally, and surface coverage growing across the library.

**Architecture:** A new pure module `mastery.js` holds all scoring/leveling/aggregation (fully unit-tested). `store.js` gains CRUD persistence for a new IDB `mastery` store. The deep-dive panel's existing "Test Yourself" block becomes an interactive flip-card check that computes a result via `mastery.js` and persists it. The library reads the mastery map to show per-card level indicators, an honest aggregate, and a single-select level filter. No `background.js` changes, no new AI calls, fully local.

**Tech Stack:** Vanilla ES modules (zero-build, no deps), Vitest (+ `fake-indexeddb` for store tests), `node --check` + `npm run check:html` for DOM/HTML glue. Brand: Mono Ink; motion behind `prefers-reduced-motion`.

---

## File Structure

- **Create** `mastery.js` — pure model: `MASTERY_LEVELS`, `UNDERSTOOD_THRESHOLD`, `levelLabel`, `levelRank`, `deriveCheckResult`, `aggregateMastery`. No DOM/network/IDB.
- **Create** `tests/mastery.test.js` — full unit coverage.
- **Modify** `store/idb.js` — register the `mastery` store (+ version bump).
- **Modify** `store.js` — `getMastery(repoId)`, `getAllMastery()`, `setMastery(repoId, record)` (CRUD; mirror the `decisions` store).
- **Create** `tests/store-mastery.test.js` — persistence round-trip with `fake-indexeddb`.
- **Modify** `output-tab.js` (+ `output-tab.html` styles) — interactive flip-card check in the deep-dive panel.
- **Modify** `library.js` (+ `library-data.js`, `library-filters.js`, `library.html` styles) — per-card level indicator, aggregate line, single-select level filter.

---

## Phase 1 — The pure model

### Task 1: `mastery.js` + tests

**Files:**
- Create: `mastery.js`
- Test: `tests/mastery.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/mastery.test.js
import { describe, it, expect } from 'vitest';
import {
  MASTERY_LEVELS, UNDERSTOOD_THRESHOLD, levelLabel, levelRank,
  deriveCheckResult, aggregateMastery,
} from '../mastery.js';

const Q = (n) => Array.from({ length: n }, (_, i) => ({ q: `q${i}`, a: `a${i}` }));

describe('deriveCheckResult', () => {
  it('marks understood at exactly 2 of 3 (the 2/3 boundary, not a rounded 0.67)', () => {
    const r = deriveCheckResult(Q(3), ['gotIt', 'gotIt', 'missed']);
    expect(r.level).toBe('understood');
    expect(r.score).toBeCloseTo(2 / 3);
    expect(r.gotIt).toBe(2);
  });

  it('marks explored below the threshold', () => {
    expect(deriveCheckResult(Q(3), ['gotIt', 'missed', 'missed']).level).toBe('explored');
    expect(deriveCheckResult(Q(2), ['gotIt', 'shaky']).level).toBe('explored'); // 0.5 < 2/3
  });

  it('marks understood at 4 of 6', () => {
    expect(deriveCheckResult(Q(6), ['gotIt', 'gotIt', 'gotIt', 'gotIt', 'shaky', 'missed']).level).toBe('understood');
  });

  it('partitions glows (gotIt) from grows (shaky/missed) by question text', () => {
    const r = deriveCheckResult(Q(3), ['gotIt', 'shaky', 'missed']);
    expect(r.glows).toEqual(['q0']);
    expect(r.grows).toEqual(['q1', 'q2']);
    expect({ gotIt: r.gotIt, shaky: r.shaky, missed: r.missed, total: r.total }).toEqual({ gotIt: 1, shaky: 1, missed: 1, total: 3 });
  });

  it('returns level new with zero counts for an empty check (no accidental promotion)', () => {
    const r = deriveCheckResult([], []);
    expect(r).toEqual({ level: 'new', score: 0, gotIt: 0, shaky: 0, missed: 0, total: 0, glows: [], grows: [] });
  });
});

describe('aggregateMastery', () => {
  it('counts levels across a records map', () => {
    const recs = {
      'a/b': { level: 'understood' }, 'c/d': { level: 'understood' },
      'e/f': { level: 'explored' }, 'g/h': { level: 'new' },
    };
    expect(aggregateMastery(recs)).toEqual({ total: 4, understood: 2, explored: 1, new: 1 });
  });
  it('treats unknown/missing levels as new and tolerates empty input', () => {
    expect(aggregateMastery({})).toEqual({ total: 0, understood: 0, explored: 0, new: 0 });
    expect(aggregateMastery({ 'x/y': {} }).new).toBe(1);
  });
});

describe('level helpers', () => {
  it('labels and ranks levels', () => {
    expect(levelLabel('understood')).toBe('Understood');
    expect(levelLabel('whatever')).toBe('New');
    expect(levelRank('new')).toBeLessThan(levelRank('explored'));
    expect(levelRank('explored')).toBeLessThan(levelRank('understood'));
  });
  it('exposes the 2/3 threshold constant', () => {
    expect(UNDERSTOOD_THRESHOLD).toBeCloseTo(2 / 3);
    expect(MASTERY_LEVELS.UNDERSTOOD).toBe('understood');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/mastery.test.js`
Expected: FAIL — `Cannot find module '../mastery.js'`.

- [ ] **Step 3: Write the module**

```js
// mastery.js
// Pure model for the Knowledge Game's mastery signal. No DOM, no network, no IDB —
// just scoring/leveling/aggregation, so it is fully unit-testable. The signal is
// earned (self-graded) from the deep-dive's self-test questions; store.js persists
// the already-computed record per repo.

export const MASTERY_LEVELS = { NEW: 'new', EXPLORED: 'explored', UNDERSTOOD: 'understood' };

// "understood" = at least two-thirds of questions self-rated "got it". Compare
// against the 2/3 fraction, NOT a rounded 0.67 (2/3 = 0.6667 < 0.67 would wrongly
// require 3-of-3); 2-of-3 must pass.
export const UNDERSTOOD_THRESHOLD = 2 / 3;

const LEVEL_LABELS = { new: 'New', explored: 'Explored', understood: 'Understood' };
const LEVEL_ORDER = { new: 0, explored: 1, understood: 2 };

/** Display label for a level; unknown → 'New'. */
export function levelLabel(level) {
  return LEVEL_LABELS[level] || LEVEL_LABELS.new;
}

/** Numeric rank for ordering (new < explored < understood). */
export function levelRank(level) {
  return LEVEL_ORDER[level] ?? 0;
}

/**
 * Score a self-graded understanding check.
 * @param {{q:string,a:string}[]} questions
 * @param {('gotIt'|'shaky'|'missed')[]} ratings  aligned to questions
 * @returns {{level:string,score:number,gotIt:number,shaky:number,missed:number,total:number,glows:string[],grows:string[]}}
 */
export function deriveCheckResult(questions, ratings) {
  const qs = Array.isArray(questions) ? questions : [];
  const rs = Array.isArray(ratings) ? ratings : [];
  const total = qs.length;
  if (total === 0) {
    return { level: MASTERY_LEVELS.NEW, score: 0, gotIt: 0, shaky: 0, missed: 0, total: 0, glows: [], grows: [] };
  }
  let gotIt = 0, shaky = 0, missed = 0;
  const glows = [], grows = [];
  qs.forEach((q, i) => {
    const text = (q && q.q) || '';
    const r = rs[i];
    if (r === 'gotIt') { gotIt++; glows.push(text); }
    else if (r === 'shaky') { shaky++; grows.push(text); }
    else { missed++; grows.push(text); }
  });
  const score = gotIt / total;
  const level = score >= UNDERSTOOD_THRESHOLD ? MASTERY_LEVELS.UNDERSTOOD : MASTERY_LEVELS.EXPLORED;
  return { level, score, gotIt, shaky, missed, total, glows, grows };
}

/**
 * Coverage counts across a map of mastery records (repoId → record).
 * @returns {{total:number,understood:number,explored:number,new:number}}
 */
export function aggregateMastery(records) {
  const out = { total: 0, understood: 0, explored: 0, new: 0 };
  for (const rec of Object.values(records || {})) {
    out.total++;
    const lvl = rec && rec.level;
    if (lvl === MASTERY_LEVELS.UNDERSTOOD) out.understood++;
    else if (lvl === MASTERY_LEVELS.EXPLORED) out.explored++;
    else out.new++;
  }
  return out;
}
```

- [ ] **Step 4: Run tests and confirm pass**

Run: `npx vitest run tests/mastery.test.js`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Lint + commit**

Run: `npx eslint mastery.js tests/mastery.test.js` (expect 0 errors)
```bash
git add mastery.js tests/mastery.test.js
git commit -m "feat(mastery): pure mastery model (scoring, levels, aggregation)"
```

---

## Phase 2 — Persistence

### Task 2: Register the `mastery` IDB store + store CRUD

**Files:**
- Modify: `store/idb.js:9-10` (version + STORES)
- Modify: `store.js` (add mastery functions after the decisions section, ~line 252)
- Test: `tests/store-mastery.test.js`

- [ ] **Step 1: Register the store**

In `store/idb.js`, bump the version and add the store. Replace lines 9-10:

```js
// v2 added 'collections'. v3 added 'decisions'. v4 added 'snapshots'. v5 added
// 'scenes'. v6 added 'mastery' (the Knowledge Game signal). Each upgrade is
// additive — onupgradeneeded creates any new store, so existing data survives.
const DB_VERSION = 6;
const STORES = ['repos', 'nodes', 'edges', 'collections', 'decisions', 'snapshots', 'scenes', 'mastery'];
```

- [ ] **Step 2: Write the failing store test**

```js
// tests/store-mastery.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { setMastery, getMastery, getAllMastery } from '../store.js';

describe('mastery persistence', () => {
  it('round-trips a record by repoId', async () => {
    const rec = { level: 'understood', lastCheckedAt: '2026-06-16T00:00:00.000Z', lastResult: { gotIt: 2, shaky: 1, missed: 0, total: 3 } };
    await setMastery('honojs/hono', rec);
    expect(await getMastery('honojs/hono')).toEqual(rec);
  });

  it('returns null for an unknown repo', async () => {
    expect(await getMastery('nope/none')).toBeNull();
  });

  it('getAllMastery returns a repoId→record map', async () => {
    await setMastery('a/b', { level: 'explored' });
    await setMastery('c/d', { level: 'understood' });
    const map = await getAllMastery();
    expect(map['a/b'].level).toBe('explored');
    expect(map['c/d'].level).toBe('understood');
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run tests/store-mastery.test.js`
Expected: FAIL — `setMastery is not a function` (not yet exported).

- [ ] **Step 4: Add the store functions**

In `store.js`, after the decisions section (after `listDecisions`, ~line 252), add (mirrors the `decisions` store; keyed by raw repoId):

```js
// ─── mastery: per-repo Knowledge-Game signal ─────────────────────────────────

/** Persist a repo's mastery record (already computed by mastery.js). Throws on failure. */
export async function setMastery(repoId, record) {
  if (!repoId) throw new Error('setMastery needs a repoId');
  await idbPut('mastery', { id: repoId, payload: record });
}

/** Get a repo's mastery record, or null if none / on store error. */
export async function getMastery(repoId) {
  try {
    const row = await idbGet('mastery', repoId);
    return (row && row.payload) || null;
  } catch {
    return null;
  }
}

/** All mastery records as a { repoId: record } map. Best-effort — {} on failure. */
export async function getAllMastery() {
  try {
    const rows = await idbGetAll('mastery');
    const out = {};
    for (const r of rows || []) if (r && r.id) out[r.id] = r.payload;
    return out;
  } catch {
    return {};
  }
}
```

- [ ] **Step 5: Run tests + confirm pass**

Run: `npx vitest run tests/store-mastery.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Guard the new store in backup (consistency with existing stores)**

`exportStores`/`importStores`/`clearLibrary` enumerate stores explicitly. For v1, mastery does NOT need to be in the backup envelope (it's derivable by re-taking checks, and adding it widens scope). Leave backup as-is. *(Noted deliberately so a reviewer doesn't flag it as a gap.)*

- [ ] **Step 7: Full suite + lint + commit**

Run: `npx vitest run` (all pass), `npx eslint store.js store/idb.js tests/store-mastery.test.js` (0 errors)
```bash
git add store/idb.js store.js tests/store-mastery.test.js
git commit -m "feat(mastery): IDB mastery store + CRUD persistence"
```

---

## Phase 3 — Earn (the deep-dive check)

### Task 3: Interactive flip-card understand-check

**Files:**
- Modify: `output-tab.js` — the deep-dive render (`renderDeepDive`, ~line 967) where `questionsBlock` is built (line 988-989); add the check renderer + rating handler.
- Modify: `output-tab.html` — styles for the check (next to the `.dd-q` rules, ~line 240).

- [ ] **Step 1: Read the current deep-dive render**

Run: `grep -n "renderDeepDive\|questionsBlock\|fey.questions\|dd-q\|t10\|#t10" output-tab.js` and read `renderDeepDive` (~960-1010). Confirm: `fey.questions` is `[{q,a}]`, the block renders into the Deep Dive panel, and `lastData.repoId` is in scope.

Also confirm the persistence path: run `grep -n "saveDecision\|from './store.js'\|import .* store" output-tab.js` to see whether the output tab already writes IDB **directly via `store.js`** (e.g. the Decision Log's `saveDecision`) or routes through a `background.js` message. Mirror that path for mastery. A direct `store.js` call from the output-tab page is correct here (extension pages share the `repolens` IDB origin, so `library.html` reads what `output-tab.html` writes) and keeps the spec's "no `background.js` changes" constraint.

- [ ] **Step 2: Add check styles**

In `output-tab.html`, after the `.dd-q` rules (~line 242), add:

```css
  .uc { margin-top: 8px; }
  .uc-progress { font: 600 11px/1 var(--mono, monospace); letter-spacing:.08em; color: var(--text-faint); margin-bottom: 10px; }
  .uc-q { font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 12px; }
  .uc-a { font-size: 13px; color: var(--text-sub); line-height: 1.6; margin: 10px 0 14px; }
  .uc-btn { font: 600 12px/1 inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border-2); background: var(--surface); color: var(--text-sub); cursor: pointer; margin-right: 8px; transition: color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out); }
  .uc-btn:hover { color: var(--text); border-color: var(--accent); }
  .uc-btn:active { transform: scale(0.97); }
  .uc-done .uc-level { font: 800 13px/1 inherit; padding: 6px 12px; border-radius: 8px; display: inline-block; margin-bottom: 12px; }
  .uc-done .uc-level.understood { background: var(--ok-bg); color: var(--ok-ink); }
  .uc-done .uc-level.explored { background: var(--warn-bg); color: var(--warn-ink); }
  .uc-gg-title { font: 700 10px/1 var(--mono, monospace); letter-spacing:.13em; text-transform: uppercase; color: var(--text-muted); margin: 10px 0 6px; }
  .uc-gg li { font-size: 13px; color: var(--text-sub); line-height: 1.6; }
  .uc-saved { font-size: 11px; color: var(--ok-ink); margin-top: 10px; }
```

- [ ] **Step 3: Add the check renderer + handler in `output-tab.js`**

Add near `renderDeepDive` (and import the model + store at the top of the file with the other imports):

```js
import { deriveCheckResult, levelLabel } from './mastery.js';
import { setMastery } from './store.js';
```

```js
// Self-graded "Check your understanding": one card at a time (reveal → rate →
// auto-advance). Persists mastery only on completion. Pure scoring is in mastery.js.
function renderUnderstandCheck(host, questions, repoId) {
  if (!host || !questions?.length) return;           // zero questions → no check, no write
  const ratings = [];
  let i = 0;

  const drawCard = () => {
    const q = questions[i];
    host.innerHTML = `<div class="uc">
      <div class="uc-progress">Question ${i + 1} of ${questions.length}</div>
      <div class="uc-q">${esc(q.q)}</div>
      <button class="uc-btn" data-uc="reveal">Reveal answer</button>
    </div>`;
  };

  const drawAnswer = () => {
    const q = questions[i];
    host.querySelector('.uc').innerHTML = `
      <div class="uc-progress">Question ${i + 1} of ${questions.length}</div>
      <div class="uc-q">${esc(q.q)}</div>
      <div class="uc-a">${esc(q.a)}</div>
      <button class="uc-btn" data-uc="gotIt">Got it</button>
      <button class="uc-btn" data-uc="shaky">Shaky</button>
      <button class="uc-btn" data-uc="missed">Missed</button>`;
  };

  const finish = async () => {
    const result = deriveCheckResult(questions, ratings);
    const record = {
      level: result.level,
      lastCheckedAt: new Date().toISOString(),
      lastResult: { gotIt: result.gotIt, shaky: result.shaky, missed: result.missed, total: result.total },
    };
    const list = (items) => items.length ? `<ul class="uc-gg">${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
    host.innerHTML = `<div class="uc uc-done">
      <span class="uc-level ${result.level}">${esc(levelLabel(result.level))}</span>
      ${result.glows.length ? `<div class="uc-gg-title">Solid on</div>${list(result.glows)}` : ''}
      ${result.grows.length ? `<div class="uc-gg-title">Revisit</div>${list(result.grows)}` : ''}
      <div class="uc-saved" hidden>Saved to your library</div>
    </div>`;
    try {
      await setMastery(repoId, record);
      const saved = host.querySelector('.uc-saved');
      if (saved) saved.hidden = false;
    } catch (err) {
      console.error('[mastery] save failed', err);
    }
  };

  host.addEventListener('click', (e) => {
    const action = e.target.closest('[data-uc]')?.dataset.uc;
    if (!action) return;
    if (action === 'reveal') { drawAnswer(); return; }
    ratings[i] = action;          // gotIt | shaky | missed
    i++;
    if (i < questions.length) drawCard();
    else finish();                // persist only here, when every card is rated
  });

  drawCard();
}
```

- [ ] **Step 4: Wire it into the deep-dive render**

Replace the static `questionsBlock` (line 988-989) with a placeholder host, and mount the check after the panel HTML is set. Concretely: keep a container `<div class="dd-section-title">Check your understanding</div><div id="dd-understand-check"></div>` in place of the old "Test Yourself" block, then after the deep-dive panel's `innerHTML` is assigned, call:

```js
const ucHost = document.getElementById('dd-understand-check');
renderUnderstandCheck(ucHost, fey.questions || [], lastData?.repoId);
```

(Read the surrounding assignment to place this call right after the panel HTML is written, like `renderCanvas`'s mount pattern.)

- [ ] **Step 5: Verify**

Run: `node --check output-tab.js && npm run check:html`
Manual smoke: run a deep dive → the "Check your understanding" card appears → reveal → rate through all → see the level + Glows/Grows + "Saved to your library"; close mid-way → nothing saved.

- [ ] **Step 6: Commit**

```bash
git add output-tab.js output-tab.html
git commit -m "feat(mastery): interactive self-graded understand-check in the deep dive"
```

---

## Phase 4 — See (the library mastery map)

### Task 4: Per-card mastery indicator

**Files:**
- Modify: `library.js` — load the mastery map where rows are loaded; pass level into `card()` (~line 152); render the indicator.
- Modify: `library-data.js` — thread a `mastery` level onto the row shape (or merge in `library.js`).
- Modify: `library.html` — indicator styles.

- [ ] **Step 1: Read the load + card render path**

Run: `grep -n "getAllMastery\|allRows\|libraryRow\|scrollPoints\|function card\|render(" library.js library-data.js` and read `card()` (~152-192) + where `allRows` is populated. Determine the single place the mastery map should be fetched (once, on library load) and merged onto rows by `repoId`.

- [ ] **Step 2: Indicator styles**

In `library.html`, add:

```css
  .lib-mastery { display:inline-block; width:11px; text-align:center; margin-right:6px; vertical-align:baseline; }
  .lib-mastery.m-new { color: var(--text-faint); }
  .lib-mastery.m-explored { color: var(--warn-ink); }
  .lib-mastery.m-understood { color: var(--accent); }
```

- [ ] **Step 3: Load mastery + merge onto rows**

Where the library loads its rows (the function that fills `allRows`), `import { getAllMastery } from './store.js';` and `import { levelLabel } from './mastery.js';`, fetch the map once and set `row.masteryLevel = (masteryMap[row.repoId]?.level) || 'new'` on each row. (Do this in `library.js` at load — keep `library-data.js` pure if it doesn't already touch the store.)

- [ ] **Step 4: Render the glyph in `card()`**

In `card(r, i)` (~line 152), before the repo title, add a glyph mapped from `r.masteryLevel` (`new → ○`, `explored → ◐`, `understood → ●`) with the level as the `title` (hover label):

```js
const M_GLYPH = { new: '○', explored: '◐', understood: '●' };
const mLevel = r.masteryLevel || 'new';
const masteryDot = `<span class="lib-mastery m-${mLevel}" title="${esc(levelLabel(mLevel))}">${M_GLYPH[mLevel]}</span>`;
```

Insert `${masteryDot}` immediately before the card's title text in the returned template.

- [ ] **Step 5: Verify + commit**

Run: `node --check library.js library-data.js && npm run check:html`
Manual: a repo you marked understood shows ● on its card.
```bash
git add library.js library-data.js library.html
git commit -m "feat(mastery): per-card mastery indicator in the library"
```

### Task 5: Aggregate line + single-select level filter

**Files:**
- Modify: `library.js` — render the aggregate line; add the level-filter control + state.
- Modify: `library-filters.js` — apply the level filter in `applyFilters`.
- Modify: `library.html` — filter control markup/styles (near the existing sort/lang filters).

- [ ] **Step 1: Read the filter architecture**

Run: `grep -n "applyFilters\|state\.\|capability\|lang-filter\|lib-sort\|libraryStats" library.js library-filters.js library-data.js` and read `applyFilters` (in `library-filters.js`) + how an existing filter (e.g. `capability` or `lang`) is wired end-to-end: the `state` field, the control that sets it, and where `applyFilters` reads it. Mirror that exact pattern for `state.mastery`.

- [ ] **Step 2: Aggregate line**

Using `aggregateMastery` (`import { aggregateMastery } from './mastery.js';`) over the loaded mastery map, render one line near the library header:

```js
const agg = aggregateMastery(masteryMap);
const masteryLine = agg.total
  ? `Understood ${agg.understood} of ${agg.total}${agg.explored ? ` · ${agg.explored} explored` : ''}`
  : '';
```

Insert into the header area as plain text (no percentage). (Read where the existing header/stats render to place it.)

- [ ] **Step 3: Add a single-select level filter**

Add a control (mirroring the existing language/sort `<select>` pattern) with options All / Understood / Explored / New that sets `state.mastery` (`'' | 'understood' | 'explored' | 'new'`) and re-renders. In `library-filters.js applyFilters`, after the existing filters, add:

```js
  if (state.mastery) rows = rows.filter((r) => (r.masteryLevel || 'new') === state.mastery);
```

(Match the file's existing `rows = rows.filter(...)` style; if it uses a different accumulator name, follow that.)

- [ ] **Step 4: Verify + commit**

Run: `node --check library.js library-filters.js && npm run check:html && npx eslint library.js library-filters.js library-data.js`
Manual: the aggregate line shows real counts; the level filter narrows the grid.
```bash
git add library.js library-filters.js library.html
git commit -m "feat(mastery): library aggregate line + level filter"
```

---

## Phase 5 — Verification

### Task 6: Full pass

- [ ] **Step 1:** `npx vitest run` — all pass (prior total + `mastery.test.js` + `store-mastery.test.js`).
- [ ] **Step 2:** `npx eslint .` — 0 errors.
- [ ] **Step 3:** `npm run check:html` — all files parse.
- [ ] **Step 4:** `node --check` on `mastery.js`, `store.js`, `store/idb.js`, `output-tab.js`, `library.js`, `library-filters.js`, `library-data.js`.
- [ ] **Step 5: Manual smoke** (no DOM test env): deep dive → take the check → mark understood → library card shows ●, aggregate updates, level filter works; partial check saves nothing; zero-question deep dive shows no check.

---

## Spec coverage check

- Shared `mastery[repoId]` model + persistence: Tasks 1, 2.
- Self-graded flip-card check from existing Feynman questions, no AI: Task 3.
- Persist only on completion; zero-question → no write: Task 3 (handler gates `finish()` on all-rated; `renderUnderstandCheck` returns early on no questions) + Task 1 (`deriveCheckResult([])` → `new`).
- 2/3 threshold (2-of-3 passes): Task 1.
- Completion shows level + Glows/Grows, not a %: Task 3.
- Library indicators (○/◐/●, hover label): Task 4. Aggregate ("X of Y", no %) + single-select filter: Task 5.
- `mastery.js` fully unit-tested; persistence with fake-indexeddb: Tasks 1, 2.
- No `background.js` changes, no new AI calls: honored throughout (verify Task 6).

## Out of scope (per spec)

AI-graded MCQ, spaced-repetition resurfacing UI, corkboard knowledge-graph (Spec 2), mastery in the backup envelope.
