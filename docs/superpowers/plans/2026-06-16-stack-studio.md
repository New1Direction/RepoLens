# Stack Studio (Canvas Phase 3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Render the existing **Tech-Stack Builder** result on the interactive canvas — repos as layer-colored cards, integrations as "integrates" string, gaps as dashed gap-cards — via a "View on canvas" toggle in the stack result page.

**Architecture:** Pure adapter + layout + a DOM toggle. **Reuses** the existing generation (`STACK_BUILD` → `parseStack` → session `result`), the canvas engine (`mountCanvas`, scene scope `'stack'`), and routing. No new AI path.

**Tech Stack:** Vanilla ES modules, no deps, Vitest (pure logic only; DOM toggle verified live). **Branch:** continue on `feat/canvas-engine`.

**Existing stack result shape** (from `stack-prompt.js` `parseStack`):
```js
// { title, roles:[{repoId, role, layer}], integrations:[{from, to, glue}], gaps:[string], order:[repoId], summary }
// layer ∈ frontend|backend|data|infra|testing|tooling
```
Result lives in `chrome.storage.session[sessionKey]` (`.result`), shown by `stack-tab.html?key=<sessionKey>` via `stack-tab.js`. Repos chosen via Library bulk-select (2–6) → `STACK_BUILD`.

**Decisions:** gaps render as **gap-kind nodes** (the live engine renders nodes/edges, not free annotations); layout is **adoption-order left→right**; the canvas is a **toggle inside the existing stack page** (not a new route).

## File map
| File | Change |
|---|---|
| `stack-scene.js` | NEW — `buildStackScene(result, title)` → `'stack'` scene |
| `canvas-layout.js` | + `layoutStack(nodes, order)` |
| `themes.css` | + `.stack-canvas` styles (layer-colored repo cards, gap cards, integrates edge) |
| `stack-tab.html` | + a "View on canvas" toggle button + `#stack-canvas` host; ensure `themes.css` is linked |
| `stack-tab.js` | + build scene from session `result` and mount the engine on toggle |
| `CHANGELOG.md`/`README.md` | + Stack Studio note |

---

### Task 1: `stack-scene.js`

**Files:** Create `stack-scene.js`; Test `tests/stack-scene.test.js`.

- [ ] **Step 1 — failing test:**
```js
import { describe, it, expect } from 'vitest';
import { buildStackScene } from '../stack-scene.js';

const result = {
  title: 'Edge API stack',
  roles: [
    { repoId: 'honojs/hono', role: 'HTTP router', layer: 'backend' },
    { repoId: 'drizzle-team/drizzle-orm', role: 'data layer', layer: 'data' },
  ],
  integrations: [{ from: 'honojs/hono', to: 'drizzle-team/drizzle-orm', glue: 'handlers call the ORM' }],
  gaps: ['no auth layer'],
  order: ['honojs/hono', 'drizzle-team/drizzle-orm'],
  summary: 'A minimal edge API.',
};

describe('buildStackScene', () => {
  it('maps roles→repo nodes (with layer), integrations→edges (glue note), gaps→gap nodes', () => {
    const s = buildStackScene(result);
    expect(s.scope).toBe('stack');
    const hono = s.nodes.find((n) => n.id === 'honojs/hono');
    expect(hono.kind).toBe('repo');
    expect(hono.layer).toBe('backend');
    expect(hono.ref.role).toBe('HTTP router');
    expect(s.edges[0]).toMatchObject({ from: 'honojs/hono', to: 'drizzle-team/drizzle-orm', rel: 'integrates', note: 'handlers call the ORM' });
    const gap = s.nodes.find((n) => n.kind === 'gap');
    expect(gap.label).toBe('no auth layer');
    expect(s.source.order).toEqual(['honojs/hono', 'drizzle-team/drizzle-orm']);
  });
  it('drops integrations whose endpoints are not roles', () => {
    const s = buildStackScene({ roles: [{ repoId: 'a/b', role: 'x', layer: 'tooling' }], integrations: [{ from: 'a/b', to: 'ghost', glue: 'g' }], gaps: [], order: [] });
    expect(s.edges).toHaveLength(0);
  });
  it('handles a missing/empty result without throwing', () => {
    const s = buildStackScene(null);
    expect(s.scope).toBe('stack');
    expect(s.nodes).toEqual([]);
  });
});
```

- [ ] **Step 2 — run, expect FAIL:** `npx vitest run tests/stack-scene.test.js`

- [ ] **Step 3 — implement** `stack-scene.js`:
```js
// stack-scene.js
// Tech-Stack Builder result → a 'stack'-scope canvas scene.
import { createScene } from './scene.js';

/**
 * @param {{title?:string, roles?:any[], integrations?:any[], gaps?:any[], order?:string[]}} result
 * @param {string} [title]
 * @returns {object} stack scene
 */
export function buildStackScene(result, title) {
  const roles = (result && result.roles) || [];
  const integrations = (result && result.integrations) || [];
  const gaps = (result && result.gaps) || [];
  const order = (result && result.order) || [];

  const nodes = roles.map((r) => ({
    id: String(r.repoId),
    label: String(r.repoId).split('/').pop() || String(r.repoId),
    kind: 'repo',
    layer: r.layer || null,
    x: 0, y: 0, pinned: false,
    ref: { repoId: r.repoId, role: r.role || null },
  }));
  const repoIds = new Set(nodes.map((n) => n.id));

  gaps.forEach((g, i) => nodes.push({
    id: `gap:${i}`, label: String(g), kind: 'gap', layer: null,
    x: 0, y: 0, pinned: false, ref: { gap: true },
  }));

  const edges = integrations
    .filter((it) => it && repoIds.has(String(it.from)) && repoIds.has(String(it.to)))
    .map((it, i) => ({ id: `int:${i}`, from: String(it.from), to: String(it.to), rel: 'integrates', note: it.glue || null, userDrawn: false }));

  const scene = createScene({ scope: 'stack', repoId: null, title: title || (result && result.title) || 'Stack' });
  scene.nodes = nodes;
  scene.edges = edges;
  scene.source = { ...scene.source, order };
  return scene;
}
```

- [ ] **Step 4 — run, expect PASS + full suite:** `npx vitest run tests/stack-scene.test.js` then `npx vitest run`
- [ ] **Step 5 — commit:** `git add stack-scene.js tests/stack-scene.test.js && git commit -m "feat(stack-studio): buildStackScene — stack result → canvas scene"`

---

### Task 2: `layoutStack()` in `canvas-layout.js`

**Files:** Modify `canvas-layout.js` (append; leave `layoutBlueprint`/`layoutCorkboard` untouched); Test `tests/stack-layout.test.js`.

- [ ] **Step 1 — failing test:**
```js
import { describe, it, expect } from 'vitest';
import { layoutStack } from '../canvas-layout.js';
const repo = (id) => ({ id, label: id, kind: 'repo', layer: null, x: 0, y: 0, pinned: false, ref: {} });
const gap = (id) => ({ id, label: id, kind: 'gap', layer: null, x: 0, y: 0, pinned: false, ref: {} });

describe('layoutStack', () => {
  it('places repos left→right by adoption order', () => {
    const nodes = [repo('b'), repo('a')];
    const placed = layoutStack(nodes, ['a', 'b']);
    const by = Object.fromEntries(placed.map((n) => [n.id, n]));
    expect(by.a.x).toBeLessThan(by.b.x);
    expect(by.a.y).toBe(by.b.y); // repos share the top row
  });
  it('puts gap cards in a row below the repos', () => {
    const placed = layoutStack([repo('a'), gap('gap:0')], ['a']);
    const by = Object.fromEntries(placed.map((n) => [n.id, n]));
    expect(by['gap:0'].y).toBeGreaterThan(by.a.y);
  });
  it('keeps pinned nodes', () => {
    const placed = layoutStack([{ ...repo('a'), x: 9, y: 9, pinned: true }], ['a']);
    expect(placed[0]).toMatchObject({ x: 9, y: 9 });
  });
});
```

- [ ] **Step 2 — run, expect FAIL:** `npx vitest run tests/stack-layout.test.js`

- [ ] **Step 3 — append to `canvas-layout.js`** (reuses the `CARD_W/CARD_H/GAP_X/GAP_Y/ORIGIN` constants already defined for `layoutCorkboard`):
```js

/** Stack layout: repos left→right by adoption `order`, gap cards in a row below. Pinned kept. Pure. */
export function layoutStack(nodes, order = []) {
  const rank = Object.fromEntries((order || []).map((id, i) => [String(id), i]));
  const repos = nodes.filter((n) => n.kind !== 'gap');
  const gaps = nodes.filter((n) => n.kind === 'gap');
  const sorted = repos.slice().sort((a, b) =>
    ((rank[a.id] ?? 999) - (rank[b.id] ?? 999)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const pos = {};
  sorted.forEach((n, i) => { pos[n.id] = { x: ORIGIN + i * (CARD_W + GAP_X), y: ORIGIN }; });
  gaps.forEach((n, i) => { pos[n.id] = { x: ORIGIN + i * (CARD_W + GAP_X), y: ORIGIN + 2 * (CARD_H + GAP_Y) }; });
  return nodes.map((n) => (n.pinned ? { ...n } : { ...n, x: pos[n.id].x, y: pos[n.id].y }));
}
```
> If `CARD_W` etc. are not in module scope where you append, reference the same literals used by `layoutCorkboard` (read the file to confirm the constant names).

- [ ] **Step 4 — run, expect PASS:** `npx vitest run tests/stack-layout.test.js`
- [ ] **Step 5 — commit:** `git add canvas-layout.js tests/stack-layout.test.js && git commit -m "feat(stack-studio): layoutStack — adoption-order rows"`

---

### Task 3: Stack-canvas styles in `themes.css`

**Files:** Modify `themes.css`.

- [ ] **Step 1 — append:**
```css
/* ── Stack Studio (canvas view of a tech-stack) ── */
.stack-canvas { position: relative; height: 60vh; min-height: 420px; border: 1px solid var(--border, #b9a273); border-radius: 14px; overflow: hidden; background: var(--bg, #fbf6ea); }
.stack-canvas.hidden { display: none; }
.stack-canvas .rl-canvas { height: 100%; }
.stack-canvas .rl-kind-repo rect { fill: var(--surface, #fffdf6); stroke: var(--text, #211c14); }
/* layer accent on the card's left edge via stroke colour */
.stack-canvas .rl-layer-frontend rect { stroke: #3b6ea5; stroke-width: 2.5; }
.stack-canvas .rl-layer-backend  rect { stroke: #2f7d34; stroke-width: 2.5; }
.stack-canvas .rl-layer-data     rect { stroke: #c2691c; stroke-width: 2.5; }
.stack-canvas .rl-layer-infra    rect { stroke: #7a5bb0; stroke-width: 2.5; }
.stack-canvas .rl-layer-testing  rect { stroke: #b3372f; stroke-width: 2.5; }
.stack-canvas .rl-layer-tooling  rect { stroke: #6b5a36; stroke-width: 2.5; }
.stack-canvas .rl-kind-gap rect { fill: #fbeae6; stroke: #b3372f; stroke-dasharray: 5 3; }
.stack-canvas .rl-kind-gap text { fill: #8a2f25; }
.stack-canvas .rl-integrates { stroke: #3b6ea5; stroke-width: 1.8; }
```
> The engine sets a node class `rl-kind-<kind>` and (Phase-2) `rl-fit-<fit>`; it does NOT emit a layer class today. So in Task 1 the scene carries `layer`, but for the layer stroke to apply, the engine must add `rl-layer-<layer>`. **Add that to `nodeClass` in `canvas-engine.js`** as part of Task 3 (one line): after the fit clause, `if (n.layer) c += ' rl-layer-' + n.layer;`. Update the `nodeClass` unit test in `tests/canvas-engine.test.js` to assert the layer class (e.g. `nodeClass({kind:'repo', layer:'backend', ref:{}})` → `'rl-node rl-kind-repo rl-layer-backend'`).

- [ ] **Step 2 — verify:** braces balanced (node brace-count one-liner) + `node --check canvas-engine.js` + `npx vitest run` green.
- [ ] **Step 3 — commit:** `git add themes.css canvas-engine.js tests/canvas-engine.test.js && git commit -m "feat(stack-studio): layer-colored cards + gap/integrates styles (+ nodeClass layer class)"`

---

### Task 4: "View on canvas" toggle (`stack-tab.html` + `stack-tab.js`)

**Files:** Modify `stack-tab.html`, `stack-tab.js`. DOM glue — NO unit test (verified live).

**Before editing:** read `stack-tab.js` to see how it reads the session `result` (the `key` query param → `chrome.storage.session[key].result`), how it renders the text view, and its render entry point. Read `stack-tab.html` for the layout + confirm whether it links `themes.css` (the engine's `.rl-*` classes live there — **add `<link rel="stylesheet" href="themes.css">` if missing**).

- [ ] **Step 1 — `stack-tab.html`:** ensure `themes.css` is linked in `<head>`; add a toggle button near the result header and a canvas host:
```html
<button id="stack-view-canvas" class="btn">▦ View on canvas</button>
<div id="stack-canvas" class="stack-canvas hidden"></div>
```

- [ ] **Step 2 — `stack-tab.js`:** import and wire (adapt to the real result-access + element ids):
```js
import { buildStackScene } from './stack-scene.js';
import { layoutStack } from './canvas-layout.js';
import { mountCanvas } from './canvas-engine.js';

let stackCanvasApi = null;
function toggleStackCanvas(result) {
  const host = document.getElementById('stack-canvas');
  if (!host) return;
  const showing = !host.classList.contains('hidden');
  if (showing) { host.classList.add('hidden'); if (stackCanvasApi) { stackCanvasApi.destroy(); stackCanvasApi = null; } return; }
  host.classList.remove('hidden');
  const scene = buildStackScene(result, result && result.title);
  scene.nodes = layoutStack(scene.nodes, (scene.source && scene.source.order) || []);
  host.innerHTML = '';
  stackCanvasApi = mountCanvas(host, scene, {});
}
// wire after the result is loaded/rendered (use the SAME `result` object the text view uses):
document.getElementById('stack-view-canvas')?.addEventListener('click', () => toggleStackCanvas(currentResult));
```
> Adapt: `currentResult` = whatever variable holds the parsed session result in `stack-tab.js`. If the result loads asynchronously (polling), attach the listener once and read the latest result at click time (e.g. a module-scoped `let currentResult`). Hide/disable the button until a `result` exists.

- [ ] **Step 3 — verify:** `node --check stack-tab.js` exit 0; `npx vitest run` green (no test; just no regression). Re-read the diff.
- [ ] **Step 4 — commit:** `git add stack-tab.html stack-tab.js && git commit -m "feat(stack-studio): View-on-canvas toggle in the stack result page"`

---

### Task 5: Docs
- [ ] Add a Stack Studio bullet to the Canvas changelog entry + a phrase in the README Canvas row. Commit `docs: Stack Studio (Canvas Phase 3)`.

## Final verification
- [ ] `npx vitest run` green (new: stack-scene, stack-layout, nodeClass layer assertion).
- [ ] `node --check` on every changed `.js`.
- [ ] **Live smoke:** standalone harness — feed a sample stack `result` → `buildStackScene` → `layoutStack` → `mountCanvas` in a `.stack-canvas`; confirm layer-colored repo cards left→right, an "integrates" edge, a dashed gap card. Screenshot.

## Out of scope
- Persisting the stack scene (it's session-derived); saving a stack to the library.
- Re-generation from the canvas; editing wiring back into a regenerate.
