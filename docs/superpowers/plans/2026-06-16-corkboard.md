# Corkboard (Canvas Phase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** A library-wide **Corkboard** — every scanned repo a draggable manila card, related repos joined by colored "red string", arrangement persisted — as a view toggle in the Library page.

**Architecture:** Reuses the Phase-1 canvas engine (`mountCanvas`, `'corkboard'` scene scope, `'library'` scene id). New: a full-library graph reader, a library→scene adapter, a simple seed layout, a tiny engine fit-class, Corkboard CSS, and a Library-page view toggle (DOM glue, verified live).

**Tech Stack:** Vanilla ES modules, no deps, Vitest (pure logic only — DOM glue verified live per repo convention), IndexedDB.

**Spec:** `docs/superpowers/specs/2026-06-15-interactive-canvas-design.md` §14 (Phase 2). **Branch:** continue on `feat/canvas-engine`.

**Decisions (locked):** simple seed layout + drag (positions persist); Corkboard is a *view* in the Library page (grid ⇄ corkboard), modeled on the existing Radar view; filters by the active Collection; "Collections" stays the name for groups, "Corkboard" is the visual board.

## Shared shapes (from Phase-1 grounding)
```js
// nodes store row:  { id, payload: { repoId?, name?, analyzed, kind?:'repo'|'idea', title?, pitch?, sources? } }
// edges store row:  { id, source, target, label, properties }   label ∈ {ALTERNATIVE_TO,SYNERGIZES_WITH,COMPARED_TO,COMBINES}
// scene node (Phase 1): { id, label, kind, layer, x, y, pinned, ref }
// scene edge (Phase 1): { id, from, to, rel, note, userDrawn }
```

## File map
| File | Change |
|---|---|
| `store.js` | + `getLibraryGraph()` (all nodes+edges, best-effort) |
| `canvas-layout.js` | + `layoutCorkboard(nodes, edges)` (component-clustered grid seed) |
| `library-scene.js` | NEW — `buildLibraryScene({ graph, repos, only })` → corkboard scene |
| `canvas-engine.js` | + add `rl-fit-<fit>` class when `node.ref.fit` is set (1 line) |
| `themes.css` | + corkboard styles (cork bg, string colors by relation, fit cards, idea nodes) |
| `library.html` | + Corkboard toggle button + `#corkboard-panel` |
| `library.js` | + `state.view`, `toggleCorkboardView()`, `renderCorkboard()` (DOM glue) |
| `CHANGELOG.md`/`README.md` | + Corkboard note |

---

### Task 1: `getLibraryGraph()` in `store.js`

**Files:** Modify `store.js`; Test `tests/store-library-graph.test.js`.

- [ ] **Step 1 — failing test** (mirror the IndexedDB setup used by `tests/store-scenes.test.js`):
```js
import { describe, it, expect } from 'vitest';
// + same indexedDB shim import the other store tests use (e.g. 'fake-indexeddb/auto')
import { upsertNode, addEdge, getLibraryGraph } from '../store.js';

describe('getLibraryGraph', () => {
  it('returns all node payloads and all edges', async () => {
    await upsertNode(1, { repoId: 'a/b', name: 'b', analyzed: true, kind: 'repo' });
    await upsertNode(2, { repoId: 'c/d', name: 'd', analyzed: true, kind: 'repo' });
    await addEdge({ id: 'e1', source: '1', target: '2', label: 'ALTERNATIVE_TO', properties: {} });
    const g = await getLibraryGraph();
    expect(g.nodes.some((n) => n.repoId === 'a/b')).toBe(true);
    expect(g.edges.some((e) => e.label === 'ALTERNATIVE_TO')).toBe(true);
  });
  it('is best-effort: returns empty arrays on no data', async () => {
    const g = await getLibraryGraph();
    expect(Array.isArray(g.nodes)).toBe(true);
    expect(Array.isArray(g.edges)).toBe(true);
  });
});
```
> Confirm `upsertNode`/`addEdge` signatures by reading `store.js` (grounding: `upsertNode(nodeId, payload)`, `addEdge({id,source,target,label,properties})`). Match the real ones.

- [ ] **Step 2 — run, expect FAIL:** `npx vitest run tests/store-library-graph.test.js`

- [ ] **Step 3 — implement** (add near `getEgoGraph` in `store.js`, using the file's real idb helpers):
```js
/** The whole library graph: every node payload + every edge. Best-effort — empty on failure. */
export async function getLibraryGraph() {
  try {
    const [nodeRows, edges] = await Promise.all([idbGetAll('nodes'), idbGetAll('edges')]);
    return {
      nodes: (nodeRows || []).map((r) => r.payload).filter(Boolean),
      edges: (edges || []),
    };
  } catch {
    return { nodes: [], edges: [] };
  }
}
```

- [ ] **Step 4 — run, expect PASS + full suite:** `npx vitest run tests/store-library-graph.test.js` then `npx vitest run`
- [ ] **Step 5 — commit:** `git add store.js tests/store-library-graph.test.js && git commit -m "feat(corkboard): getLibraryGraph — full-library nodes + edges reader"`

---

### Task 2: `layoutCorkboard()` in `canvas-layout.js`

**Files:** Modify `canvas-layout.js` (add export, keep `layoutBlueprint` untouched); Test `tests/corkboard-layout.test.js`.

Simple deterministic seed: union-find connected components, then place nodes in a grid ordered by (component, id) so related repos seed adjacent; user drags to refine (positions persist).

- [ ] **Step 1 — failing test:**
```js
import { describe, it, expect } from 'vitest';
import { layoutCorkboard } from '../canvas-layout.js';
const N = (id) => ({ id, label: id, kind: 'repo', layer: null, x: 0, y: 0, pinned: false, ref: {} });

describe('layoutCorkboard', () => {
  it('assigns every node a finite position', () => {
    const nodes = [N('a'), N('b'), N('c')];
    const placed = layoutCorkboard(nodes, []);
    for (const n of placed) { expect(Number.isFinite(n.x)).toBe(true); expect(Number.isFinite(n.y)).toBe(true); }
  });
  it('seeds connected repos in adjacent grid cells (closer than unrelated)', () => {
    const nodes = [N('a'), N('b'), N('x'), N('y')];
    const edges = [{ id: 'e', from: 'a', to: 'b', rel: 'ALTERNATIVE_TO' }];
    const placed = layoutCorkboard(nodes, edges);
    const by = Object.fromEntries(placed.map((n) => [n.id, n]));
    const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
    expect(d(by.a, by.b)).toBeLessThanOrEqual(Math.max(d(by.a, by.x), d(by.a, by.y)));
  });
  it('keeps pinned nodes where they are', () => {
    const nodes = [{ ...N('a'), x: 500, y: 500, pinned: true }, N('b')];
    const placed = layoutCorkboard(nodes, []);
    expect(placed.find((n) => n.id === 'a')).toMatchObject({ x: 500, y: 500 });
  });
});
```

- [ ] **Step 2 — run, expect FAIL:** `npx vitest run tests/corkboard-layout.test.js`

- [ ] **Step 3 — implement** (append to `canvas-layout.js`):
```js
const CARD_W = 150, CARD_H = 64, GAP_X = 60, GAP_Y = 44, ORIGIN = 40;

/** Simple seed layout for the corkboard: union-find components, grid-place ordered by
 *  (component, id) so related repos start adjacent. Pinned nodes keep their position. Pure. */
export function layoutCorkboard(nodes, edges) {
  const parent = Object.fromEntries(nodes.map((n) => [n.id, n.id]));
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { if (parent[a] === undefined || parent[b] === undefined) return; parent[find(a)] = find(b); };
  for (const e of edges) union(e.from, e.to);

  // order: group by component root, then by id (deterministic)
  const ordered = nodes.slice().sort((p, q) => {
    const rp = find(p.id), rq = find(q.id);
    return rp < rq ? -1 : rp > rq ? 1 : (p.id < q.id ? -1 : p.id > q.id ? 1 : 0);
  });

  const cols = Math.max(1, Math.ceil(Math.sqrt(ordered.length)));
  const pos = {};
  ordered.forEach((n, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    pos[n.id] = { x: ORIGIN + c * (CARD_W + GAP_X), y: ORIGIN + r * (CARD_H + GAP_Y) };
  });

  return nodes.map((n) => (n.pinned ? { ...n } : { ...n, x: pos[n.id].x, y: pos[n.id].y }));
}
```

- [ ] **Step 4 — run, expect PASS:** `npx vitest run tests/corkboard-layout.test.js`
- [ ] **Step 5 — commit:** `git add canvas-layout.js tests/corkboard-layout.test.js && git commit -m "feat(corkboard): layoutCorkboard — component-clustered grid seed"`

---

### Task 3: `library-scene.js` adapter

**Files:** Create `library-scene.js`; Test `tests/library-scene.test.js`.

Turns the library graph + repo metadata into a corkboard scene. Maps edge `label`→`rel`, node payload→card with fit/health in `ref`, filters to a Collection's repoIds when given.

- [ ] **Step 1 — failing test:**
```js
import { describe, it, expect } from 'vitest';
import { buildLibraryScene } from '../library-scene.js';

const graph = {
  nodes: [
    { repoId: 'evanw/esbuild', name: 'esbuild', analyzed: true, kind: 'repo' },
    { repoId: 'rollup/rollup', name: 'rollup', analyzed: true, kind: 'repo' },
    { title: 'esbuild + rollup glue', kind: 'idea', sources: ['evanw/esbuild', 'rollup/rollup'] },
  ],
  edges: [{ id: 'e1', source: 'evanw/esbuild', target: 'rollup/rollup', label: 'ALTERNATIVE_TO', properties: {} }],
};
const repos = [
  { repoId: 'evanw/esbuild', fit: 'strong', health: { score: 92 } },
  { repoId: 'rollup/rollup', fit: 'solid', health: { score: 80 } },
];

describe('buildLibraryScene', () => {
  it('builds a corkboard scene with repo cards + an idea node + a rel edge', () => {
    const s = buildLibraryScene({ graph, repos });
    expect(s.scope).toBe('corkboard');
    expect(s.id).toBe('library');
    expect(s.nodes.length).toBe(3);
    const esb = s.nodes.find((n) => n.id === 'evanw/esbuild');
    expect(esb.ref.fit).toBe('strong');
    expect(esb.ref.health).toBe(92);
    expect(s.edges[0]).toMatchObject({ from: 'evanw/esbuild', to: 'rollup/rollup', rel: 'ALTERNATIVE_TO' });
    expect(s.nodes.some((n) => n.kind === 'idea')).toBe(true);
  });
  it('filters to a collection when `only` repoIds are given (+ drops dangling edges)', () => {
    const s = buildLibraryScene({ graph, repos, only: ['evanw/esbuild'] });
    expect(s.nodes.map((n) => n.id)).toEqual(['evanw/esbuild']);
    expect(s.edges).toHaveLength(0);
  });
});
```

- [ ] **Step 2 — run, expect FAIL:** `npx vitest run tests/library-scene.test.js`

- [ ] **Step 3 — implement** `library-scene.js`:
```js
// library-scene.js
// Library graph (nodes/edges stores) + repo metadata → a 'corkboard' scene.
import { createScene } from './scene.js';

const idOf = (n) => String(n.repoId || n.id || n.title || '');

/**
 * @param {object} args
 * @param {{nodes:any[], edges:any[]}} args.graph  from store.getLibraryGraph()
 * @param {Array<{repoId:string, fit?:string, health?:{score:number}, decision?:string}>} [args.repos]
 * @param {string[]} [args.only]  when set, keep only these repoIds (Collection filter)
 * @returns {object} corkboard scene (id 'library')
 */
export function buildLibraryScene({ graph, repos = [], only = null }) {
  const meta = Object.fromEntries(repos.map((r) => [r.repoId, r]));
  const keep = only ? new Set(only) : null;

  const rawNodes = (graph?.nodes || []).filter((n) => {
    const id = idOf(n);
    if (!id) return false;
    if (keep && n.kind !== 'idea') return keep.has(id);   // collection filter applies to repos
    if (keep && n.kind === 'idea') return (n.sources || []).some((s) => keep.has(s));
    return true;
  });

  const nodes = rawNodes.map((n) => {
    const id = idOf(n);
    const m = meta[n.repoId] || {};
    return {
      id,
      label: n.kind === 'idea' ? String(n.title || 'idea') : String(n.name || id.split('/').pop() || id),
      kind: n.kind === 'idea' ? 'idea' : 'repo',
      layer: null,
      x: 0, y: 0, pinned: false,
      ref: {
        repoId: n.repoId || null,
        analyzed: !!n.analyzed,
        fit: m.fit || null,
        health: (m.health && Number.isFinite(m.health.score)) ? m.health.score : null,
        decision: m.decision || null,
        pitch: n.pitch || null,
        sources: n.sources || null,
      },
    };
  });

  const ids = new Set(nodes.map((n) => n.id));
  const edges = (graph?.edges || [])
    .filter((e) => ids.has(String(e.source)) && ids.has(String(e.target)))
    .map((e) => ({ id: String(e.id), from: String(e.source), to: String(e.target), rel: String(e.label || 'ALTERNATIVE_TO'), note: null, userDrawn: false }));

  const scene = createScene({ scope: 'corkboard', repoId: null, title: 'Library' });
  scene.nodes = nodes;
  scene.edges = edges;
  return scene;
}
```

- [ ] **Step 4 — run, expect PASS:** `npx vitest run tests/library-scene.test.js`
- [ ] **Step 5 — commit:** `git add library-scene.js tests/library-scene.test.js && git commit -m "feat(corkboard): buildLibraryScene — library graph → corkboard scene"`

---

### Task 4: fit-class in `canvas-engine.js`

**Files:** Modify `canvas-engine.js`; Test: extend `tests/canvas-engine.test.js` (pure — assert the class string is built, via a tiny exported helper).

The engine renders nodes as `class="rl-node rl-kind-<kind>"`. Corkboard cards should also carry their fit. Add a fit class without breaking Blueprint.

- [ ] **Step 1 — failing test** (add to `tests/canvas-engine.test.js`):
```js
import { nodeClass } from '../canvas-engine.js';
describe('nodeClass', () => {
  it('includes kind, root, and fit when present', () => {
    expect(nodeClass({ kind: 'repo', ref: { root: false, fit: 'strong' } })).toBe('rl-node rl-kind-repo rl-fit-strong');
    expect(nodeClass({ kind: 'module', ref: { root: true } })).toBe('rl-node rl-kind-module is-root');
    expect(nodeClass({ kind: 'data', ref: {} })).toBe('rl-node rl-kind-data');
  });
});
```

- [ ] **Step 2 — run, expect FAIL:** `npx vitest run tests/canvas-engine.test.js`

- [ ] **Step 3 — implement:** in `canvas-engine.js`, add the exported pure helper and use it where the node `<g>` class is built:
```js
/** Pure: the class string for a node element (kind + optional root/fit). */
export function nodeClass(n) {
  let c = `rl-node rl-kind-${n.kind}`;
  if (n.ref && n.ref.root) c += ' is-root';
  if (n.ref && n.ref.fit) c += ` rl-fit-${n.ref.fit}`;
  return c;
}
```
Replace the inline `const g = el('g', { class: \`rl-node rl-kind-${n.kind}\`, ... })` + the subsequent `if (n.ref && n.ref.root) g.classList.add('is-root');` with `const g = el('g', { class: nodeClass(n), transform: ..., tabindex: '0' }); g.dataset.node = n.id;` (drop the now-redundant is-root line; nodeClass handles it).

- [ ] **Step 4 — run, expect PASS + full suite:** `npx vitest run tests/canvas-engine.test.js` then `npx vitest run`
- [ ] **Step 5 — commit:** `git add canvas-engine.js tests/canvas-engine.test.js && git commit -m "feat(corkboard): nodeClass helper — carry fit on cards (engine)"`

---

### Task 5: Corkboard styles in `themes.css`

**Files:** Modify `themes.css`.

- [ ] **Step 1 — append** (after the Phase-1 canvas block; uses theme tokens with fallbacks):
```css
/* ── Corkboard (library board) ── */
.corkboard-panel { position: relative; height: 70vh; min-height: 460px; border: 1px solid var(--border, #b9a273); border-radius: 14px; overflow: hidden; background: #c9a86a; background-image: radial-gradient(circle, rgba(120,90,40,.28) 1px, transparent 1px); background-size: 12px 12px; }
.corkboard-panel.hidden, #grid.hidden, #radar-panel.hidden { display: none; }
.corkboard-panel .rl-canvas { background: transparent; height: 100%; }
/* repo cards read as manila pinned notes */
.corkboard-panel .rl-kind-repo rect { fill: #f4e8cb; stroke: #9a8358; }
.corkboard-panel .rl-kind-idea rect { fill: #fff7e6; stroke: #c2691c; stroke-dasharray: 5 3; }
.corkboard-panel .rl-fit-strong rect { stroke: #2f7d34; stroke-width: 2.5; }
.corkboard-panel .rl-fit-solid  rect { stroke: #3b6ea5; stroke-width: 2; }
.corkboard-panel .rl-fit-care   rect { stroke: #c2691c; stroke-width: 2; }
.corkboard-panel .rl-fit-risky  rect { stroke: #b3372f; stroke-width: 2.5; }
.corkboard-panel .rl-node text { fill: #211c14; }
/* red string by relation (mirrors Connections hues) */
.corkboard-panel .rl-edge { stroke-width: 1.8; opacity: .85; }
.corkboard-panel .rl-ALTERNATIVE_TO { stroke: #3b6ea5; }
.corkboard-panel .rl-SYNERGIZES_WITH { stroke: #2f7d34; }
.corkboard-panel .rl-COMPARED_TO { stroke: #b3372f; }
.corkboard-panel .rl-COMBINES { stroke: #c2691c; stroke-dasharray: 5 4; }
.corkboard-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; color: #4a3f28; font: 13px ui-monospace, monospace; padding: 24px; }
```

- [ ] **Step 2 — verify braces balanced** (`node -e` brace count like Phase 1) and `npx vitest run` green.
- [ ] **Step 3 — commit:** `git add themes.css && git commit -m "feat(corkboard): cork texture, manila cards, red-string + fit styles"`

---

### Task 6: Library-page view toggle (`library.html` + `library.js`)

**Files:** Modify `library.html`, `library.js`. DOM glue — NO unit test (verified live, per repo convention).

**Before editing:** read `library.js` for how `renderRadar()`/`toggleRadar()` work, the `state` object, `render()`, how rows/repo metadata (`allRows`, `libraryRow`, fit) are available, the active-collection state (`state.collection` + its repoIds), and how a card click opens a repo (`openRow`). Mirror those patterns.

- [ ] **Step 1 — `library.html`:** add a toggle button in `.lib-actions` near the Radar button:
```html
<button class="lib-btn" id="lib-btn-corkboard" title="Corkboard — a red-string board of your library">🧭 Corkboard</button>
```
and a panel after the radar panel (or beside `#grid`):
```html
<div id="corkboard-panel" class="corkboard-panel hidden"></div>
```

- [ ] **Step 2 — `library.js`:** import what's needed:
```js
import { getLibraryGraph } from './store.js';      // add to an existing store.js import if cleaner
import { buildLibraryScene } from './library-scene.js';
import { layoutCorkboard } from './canvas-layout.js';
import { mountCanvas } from './canvas-engine.js';
import { saveScene, getScene } from './store.js';
```
Add `view: 'list'` to the `state` object. Add the toggle + renderer (adapt to the real `state`, `allRows`, collection repoIds, and `openRow`):
```js
function toggleCorkboardView() {
  state.view = state.view === 'corkboard' ? 'list' : 'corkboard';
  document.getElementById('lib-btn-corkboard')?.classList.toggle('on', state.view === 'corkboard');
  document.getElementById('corkboard-panel')?.classList.toggle('hidden', state.view !== 'corkboard');
  document.getElementById('grid')?.classList.toggle('hidden', state.view === 'corkboard');
  document.getElementById('radar-panel')?.classList.add('hidden');
  if (state.view === 'corkboard') renderCorkboard();
}

let cbApi = null;
async function renderCorkboard() {
  const panel = document.getElementById('corkboard-panel');
  if (!panel) return;
  const graph = await getLibraryGraph();
  if (!graph.nodes.length) { panel.innerHTML = '<div class="corkboard-empty">Scan a few repos (and run Alternatives / Synergies / Versus) to grow your board.</div>'; return; }
  // repo metadata for fit/health from the already-loaded rows; collection filter via active collection's repoIds
  const repos = (allRows || []).map((r) => ({ repoId: r.repoId, fit: r.fit?.level || r.fitLevel || null, health: r.health, decision: r.decision }));
  const only = state.collection ? (collectionRepoIds(state.collection)) : null;   // use the real accessor for a collection's repoIds
  const built = buildLibraryScene({ graph, repos, only });
  // reuse a saved arrangement if present, else seed
  const saved = await getScene('library');
  if (saved && saved.nodes?.length) {
    const posById = Object.fromEntries(saved.nodes.map((n) => [n.id, n]));
    built.nodes = built.nodes.map((n) => posById[n.id] ? { ...n, x: posById[n.id].x, y: posById[n.id].y, pinned: posById[n.id].pinned } : n);
    built.nodes = layoutCorkboard(built.nodes, built.edges);   // seed only the un-positioned (pinned/saved kept)
  } else {
    built.nodes = layoutCorkboard(built.nodes, built.edges);
  }
  panel.innerHTML = '';
  if (cbApi) cbApi.destroy();
  cbApi = mountCanvas(panel, built, { onChange: (s) => saveScene(s).catch(() => {}) });
  // click a card → open the repo (delegate; nodes carry data-node = repoId)
  panel.querySelector('svg')?.addEventListener('dblclick', (ev) => {
    const g = ev.target.closest('[data-node]'); if (!g) return;
    const id = g.dataset.node; if (id && id.includes('/')) openRow(id);
  });
}
document.getElementById('lib-btn-corkboard')?.addEventListener('click', toggleCorkboardView);
```
> Adapt every name to the real code: the fit field on a row, `collectionRepoIds`/how a collection's `repoIds` are read (grounding: collection `{ id, repoIds[] }` — use `listCollections()`/the in-memory collections), `openRow`, and `allRows`. To reuse saved positions cleanly, mark restored nodes `pinned:true` before `layoutCorkboard` so the seed only places new ones, then unpin — or simpler: if a saved scene exists, skip `layoutCorkboard` for nodes present in it. Keep it correct to the real helpers.

- [ ] **Step 3 — verify:** `node --check library.js` exit 0; `npx vitest run` all green (no test for this; just no regression). Re-read the diff.
- [ ] **Step 4 — commit:** `git add library.html library.js && git commit -m "feat(corkboard): Library Corkboard view — mount, filter by collection, persist, open on dblclick"`

---

### Task 7: Docs

**Files:** `CHANGELOG.md`, `README.md`.
- [ ] Add a Corkboard bullet under the Canvas changelog entry; mention the Corkboard in the README Canvas row. Commit `docs: Corkboard in changelog + README`.

---

## Final verification
- [ ] `npx vitest run` — all green (new pure suites: store-library-graph, corkboard-layout, library-scene, nodeClass).
- [ ] `node --check` on every changed `.js`.
- [ ] **Live smoke** (like Phase 1): a standalone harness OR load the extension, open Library → Corkboard, confirm cards render with fit colors, string connects related repos, drag persists across reload, collection filter narrows the board. Screenshot.

## Out of scope (later)
- Force-directed / community-cluster auto-layout (Phase 2.5 if libraries get large).
- Hover tooltips with rich card detail, pin/zoom-to-fit affordances, board export.
- Phase 3 Stack Studio (generative wiring).
