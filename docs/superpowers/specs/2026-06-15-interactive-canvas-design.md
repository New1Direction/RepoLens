# Interactive Canvas — Design Spec

> Status: **Draft for review** · 2026-06-15
> Branch target: a new `feat/canvas-engine` off `main` (not the current `feat/scan-ledger`).
> Brainstorm artifacts: `.superpowers/brainstorm/91097-1781590287/` (mockups).
> Inspiration studied: [Egonex-AI/Understand-Anything](https://github.com/Egonex-AI/Understand-Anything)
> (knowledge-graph dashboard) — concepts ported, **none of its React/Vite/ELK stack adopted.**

## 1. The idea in one paragraph

Turn a RepoLens scan into a **draggable, annotatable, shareable canvas** — and make
exploring it *fun*. One zero-build **canvas engine** powers three scopes at three zoom
levels: a single repo's architecture (**Blueprint**), the whole library as a red-string
detective board (**Corkboard**), and a hand-picked subset wired into a system (**Stack
Studio**). The same scene serialises to `.excalidraw` and SVG, so the "interactive canvas"
and "exportable artifact" are one engine with two outputs. The headline delight is a
**Guided Tour**: the camera flies node-to-node in dependency order, spotlighting one piece
at a time and narrating it — the detective walking you through the case file. This advances
the product's north star (*"your evaluations compound"*) by giving the ephemeral Deep Dive
a durable, portable home.

## 2. Goals / Non-goals

**Goals**
- A vanilla-JS, **zero-build**, Manifest-V3-safe canvas engine — no React, no bundler, no new runtime deps.
- Persist arranged scenes (positions, pins, notes, drawn edges) so they survive the refresh that wipes Deep Dive.
- Ship **Phase 1** end-to-end: engine + **Blueprint** adapter + **Guided Tour** + export.
- Reuse data the codebase already produces (Deep Dive `atoms`/`lineage`, `taxonomy.layerOf`).
- Re-skin across all 13 themes for free (SVG + CSS tokens, like `diagram.js`/`graph.js`).
- Reduced-motion safe; keyboard reachable; all user text escaped.

**Non-goals (this spec)**
- The Corkboard (Phase 2) and Stack Studio (Phase 3) are **sketched, not specified** here.
- Search-to-focus and the Scan-Ledger diff overlay are **Phase 1.5** fast-follows.
- No backend, no telemetry, no third-party graph library, no WebGL.
- No tree-sitter / deterministic source parsing (Understand-Anything's structural half) —
  RepoLens stays LLM-sourced for atoms; we instead harden against messy LLM output (§6).

## 3. Architecture overview

```
Deep Dive (session)         scenes store (idb v5, durable)
  atoms + lineage  ──┐        ▲          │
                     │        │ save     │ load
                     ▼        │          ▼
            blueprint-adapter.js  ──►  scene model  ◄──►  canvas-engine.js
            (seed nodes/edges)         (§5 schema)        (pan/zoom/drag/connect/note)
                     │                     │                   │
              repair-graph.js (§6)         │            tour-runner.js (§8, overlay)
              (normalize LLM data)         │
                                           ▼
                                  exporter.js  →  .excalidraw / SVG (§9)
                                           │
                                  output-tab Canvas tab (§10)
```

Two **invariants** borrowed from Understand-Anything's layout design and made first-class here:

1. **Layout is pure + memoised.** Node positions are computed only when the *topology*
   changes (nodes/edges added or removed, or an explicit Re-layout). Dragging persists a
   position; it does not recompute layout.
2. **Visual state is a separate O(n) overlay pass.** Selection, hover, search highlight,
   tour spotlight, and diff tint never trigger a relayout — they toggle classes/attributes
   on already-positioned elements.

This split is what keeps the canvas smooth and the engine simple.

## 4. Module map (new + touched)

**New modules (pure where possible, all unit-testable without a DOM):**

| File | Responsibility |
|---|---|
| `scene.js` | Scene model: factory, validation, immutable update helpers, id/seed hashing. Pure. |
| `repair-graph.js` | Normalize messy LLM node/edge data into a valid scene graph (§6). Pure. |
| `canvas-layout.js` | Seed layout for a scope (Blueprint reuses `diagram.js` depth math). Pure. |
| `canvas-engine.js` | The interactive surface: Pointer-Events pan/zoom/drag/connect/note, render, overlay pass. DOM. |
| `blueprint-adapter.js` | Build a Blueprint scene from Deep Dive `atoms`/`lineage` + layers. Pure. |
| `tour.js` | Compute tour steps from graph topology (fan-in/out, BFS order, clusters). Pure. |
| `tour-runner.js` | Drive the camera + narration overlay through tour steps. DOM. |
| `canvas-export.js` *(or extend `exporter.js`)* | `toExcalidraw(scene)`, `toCanvasSvg(scene)`. Pure strings. |

**Touched modules:**

| File | Change |
|---|---|
| `store/idb.js` | Add `'scenes'` to `STORES`; bump `DB_VERSION` 4 → 5 (additive). |
| `store.js` | `saveScene/getScene/listScenes/deleteScene`; include `scenes` in `exportStores`/`importStores`. |
| `backup.js` | Add `scenes` to envelope build/validate + `MAX_ROWS['scenes']`. |
| `output-tab.html` | Add Canvas tab button + `#t27` content host (27 = next free index after `ask`=26) + tool/overlay CSS. |
| `output-tab.js` | `TAB_SLUGS[27]='canvas'`; `renderCanvas(d)` mounts the engine; export-bar wiring. |
| `exporter.js` | Re-export the two canvas exporters (or host them directly). |
| `settings-backup.js` | Add `canvasEnabled` (and `canvasTourAutoplay`) to `SAFE_SETTING_KEYS`. |
| `themes.css` | Canvas tokens reuse existing `--dur-*`/`--ease-*`; add `--canvas-*` surface tokens. |

## 5. The scene model

One schema serves every scope. Stored as a row in the `scenes` store (keyed by `id`).

```js
// scene.js
{
  id:        string,   // 'repo:<hashRepoId>' (Blueprint) | 'library' (Corkboard) | 'stack:<hash>'
  scope:     'blueprint' | 'corkboard' | 'stack',
  repoId:    string | null,        // owning repo for blueprint/stack; null for library
  title:     string,
  nodes: [{
    id:      string,               // stable, from source data (atom id, repoId, …)
    label:   string,
    kind:    string,               // atom kind | 'repo' | 'idea' | 'note'
    layer:   string | null,        // taxonomy.layerOf(...) — drives colour
    x:       number,  y: number,   // persisted position (engine writes on drag)
    pinned:  boolean,              // user pinned → excluded from re-layout
    ref:     object | null,        // back-pointer payload (files, purpose, repoId, summary…)
  }],
  edges: [{
    id:      string,               // deterministic: hash(from|rel|to)
    from:    string, to: string,   // must reference existing node ids (repair drops orphans)
    rel:     string,               // 'depends-on'|'enables'|'triggers'|'derives-from'|'string'|…
    note:    string | null,        // user annotation on the edge
    userDrawn: boolean,            // hand-drawn 'string' vs seeded lineage edge
  }],
  annotations: [{                  // free sticky notes pinned to the board
    id: string, x: number, y: number, text: string, tone: 'note'|'warn',
  }],
  camera:  { x: number, y: number, zoom: number },
  tour:    null | { steps: TourStep[], generatedAt: string },   // see §8
  source:  { lens: 'deepDive', generatedAt: string, scanAt: string|null },
  createdAt: string, updatedAt: string,
}
```

Notes
- **No `Math.random` for ids/seeds** — derive from `hashRepoId`-style djb2 over stable keys
  so re-seeding is idempotent and exports diff cleanly.
- Positions are authored in a single **world coordinate space**; the engine applies one
  `transform` (the camera) to a root `<g>`. (Fixes the mock's two-coordinate-system bug.)
- The scene is the **single source of truth** for both render and export.

## 6. `repair-graph.js` — taming messy LLM data

Deep Dive's `atoms`/`lineage` are LLM-produced; they will sometimes be malformed. Borrowed
directly from Understand-Anything's tiered robustness model (`GraphIssue`). `repairGraph(raw)`
returns `{ nodes, edges, issues: GraphIssue[] }` and **never throws**:

| Repair | Trigger | Level |
|---|---|---|
| coerce node `kind` aliases (`func`→`function`, mixed case) to known set | unknown/aliased kind | `auto-corrected` |
| fill missing `label`/`layer` defaults | missing field | `auto-corrected` |
| dedupe duplicate node ids | duplicate id | `auto-corrected` |
| **drop edges whose `from`/`to` isn't a node** | dangling ref | `dropped` |
| drop nodes missing an `id` | unrecoverable | `dropped` |
| coerce edge `rel` aliases to known set | aliased relation | `auto-corrected` |

`diagram.js` already filters links with unknown endpoints (`valid = links.filter(...)`); this
generalises that into one reusable, tested pass. The Canvas surfaces a quiet
`"cleaned N issues"` chip (click → list) so problems are visible, never silent. A `strict`
flag throws in tests so malformed fixtures are caught in CI rather than shipped as silent drops.

## 7. `canvas-engine.js` — the interactive surface

Pure vanilla, Pointer Events, one SVG root. No deps. MV3-safe (no `eval`, no inline handlers —
listeners attached in JS; honours the extension's existing CSP).

- **Coordinate system:** world coords on a root `<g transform="translate(cx,cy) scale(z)">`.
  Screen↔world conversion in one helper; everything else works in world space.
- **Camera:** wheel = zoom toward cursor (clamped 0.2–3×); drag empty space = pan; `Fit` frames
  all nodes; `100%` resets. Camera persisted in `scene.camera`.
- **Tools:** Select · Pan · Connect · Note (mirrors the mock). Tool = a small state machine.
- **Nodes:** rendered as `<g>` (rect + text, themed via CSS classes by `kind`/`layer`).
  Drag updates `node.x/y` (debounced persist). Hit-testing via pointer capture on the node `<g>`.
- **Edges:** cubic Béziers from source-anchor to target-anchor, recomputed *only* for edges
  touching a moved node (cheap). Relation → stroke class (solid/green/dashed/red-string).
- **Connect:** drag from a node port to another node → new `userDrawn` edge.
- **Notes:** Note tool drops an annotation; double-click to edit (escaped on render).
- **Overlay pass** (`applyOverlay(state)`): toggles `.is-selected/.is-dim/.is-spotlight/.is-hit`
  classes — never relays out. Tour, search, hover, diff all route through this.
- **Persistence:** any structural/position change → `scheduleSave()` (debounced `saveScene`).
- **Performance budget:** Blueprint ≤ ~15 nodes — trivial. Engine must stay smooth to ~300
  nodes for Phase 2; layout cost is bounded because it only runs on topology change.

**A11y / motion:** nodes are focusable (`tabindex`), arrow-key nudge, `Enter` opens detail;
all camera/tour animation behind `@media (prefers-reduced-motion: no-preference)` (reduced
motion = instant jumps, no fly-through). Canvas is decorative-graph; a text outline of the
scene is available for screen readers.

## 8. The Guided Tour (the "fun" centrepiece)

Ported from Understand-Anything's `tour-builder`, adapted to RepoLens data and the canvas.

**`tour.js` — compute steps (pure, deterministic, no LLM required):**
- Inputs: scene `nodes`/`edges` + Deep Dive `roots`/`leaves`.
- Compute **fan-in** (importance) and **fan-out** (scope) per node; pick **entry point(s)**
  (lineage `roots`, tie-broken by fan-out); **BFS** forward along edges for reading order;
  group **tightly-coupled clusters** (mutual edges) into shared steps.
- Emit 5–15 `TourStep { order, nodeIds[], title, blurb, lesson? }`. `blurb` defaults to the
  atom `purpose`/Feynman text already in Deep Dive (zero extra tokens); an **optional** single
  LLM pass can upgrade narration (reuses `background.js` plumbing, behind a "Polish narration"
  action — not required to ship).

**`tour-runner.js` — drive it (overlay only):**
- Step N: camera eases to frame `step.nodeIds`, those nodes get `.is-spotlight`, the rest
  `.is-dim`; a narration card shows `title`/`blurb`/optional `lesson` + Back/Next + a progress
  rail; auto-play advances on a timer (pausable; setting `canvasTourAutoplay`).
- `←`/`→`/`Esc` keyboard control. Reduced-motion → instant cuts, no eased camera.
- No relayout, no data mutation — pure overlay over the existing scene.

## 9. Export — `toExcalidraw(scene)` + `toCanvasSvg(scene)`

Pure string functions in the `exporter.js` mould (Blob+anchor download already exists in
`output-tab.js`).

- **`toCanvasSvg(scene)`** — serialise the current scene to a standalone, themed SVG
  (reuses the engine's node/edge rendering helpers). Escaped text. Instant, offline.
- **`toExcalidraw(scene)`** — emit a valid Excalidraw document
  (`{type:"excalidraw",version:2,source,elements,appState}`): each node → a `rectangle` + bound
  `text`; each edge → an `arrow` with `startBinding`/`endBinding`; annotations → sticky `text`.
  Element `seed`/`versionNonce` derived by hashing the element id (deterministic, no RNG).
  **Why it's worth it:** opening the file in excalidraw.com / Obsidian / VS Code renders it
  **hand-drawn** (Excalidraw's roughness) — so users get the playful sketch aesthetic for free
  while the in-extension canvas stays crisp Case-File ink. PNG export can come later (canvas
  rasterise) — out of Phase 1.

Export options on the Canvas footer: `.excalidraw` · `SVG` · `Markdown` (atoms/edges table via
existing exporter patterns).

## 10. Persistence, storage & backup

- **`store/idb.js`**: append `'scenes'` to `STORES`, bump `DB_VERSION` to 5. The existing
  `onupgradeneeded` loop creates the store additively — v4 data survives untouched.
- **`store.js`**: `saveScene(scene)`, `getScene(id)`, `listScenes(repoId?)`, `deleteScene(id)`;
  add `scenes` to `exportStores()`/`importStores()` (same row-merge pattern as snapshots).
- **`backup.js`**: add `scenes` to `buildBackup`/`validateBackup` with a `sceneOk` validator
  (`id` + `scope` + arrays present) and `MAX_ROWS['scenes']` clamp — scenes round-trip through
  the v2 envelope exactly like snapshots/decisions.
- **`settings-backup.js`**: allowlist `canvasEnabled`, `canvasTourAutoplay` (no secrets).
- **Lifecycle:** opening the Canvas tab calls `getScene('repo:'+hash)`; if absent, the
  blueprint-adapter seeds one from the live (session) Deep Dive and `saveScene`s it. Thereafter
  the durable scene is authoritative; a `↻ Re-seed from latest Deep Dive` action re-derives on demand.

## 11. UI integration (`output-tab`)

- Add a **Canvas** tab (`data-tab="27"`, the next free index; `TAB_SLUGS[27]='canvas'`), grouped
  under the existing **Lenses** menu beside Deep Dive. URL-hash routing + per-repo tab memory work
  automatically via the existing `show()` logic.
- `renderCanvas(d)` mounts `canvas-engine` into `#t27` with the loaded/seeded scene; the
  toolbar, tour controls, repair chip, and export footer live in this host.
- Empty/edge states: if no Deep Dive has been run, show a guided `.dd-cta`-style card
  ("Run Deep Dive to build the Blueprint") — reuses the existing empty-state pattern.

## 12. Theming, security, performance

- **Theming:** nodes/edges use `currentColor` + theme tokens; verified on dark *and* light
  (same approach as `diagram.js`/`graph.js`/Vee). Layer palette = a small token set in `themes.css`.
- **Security:** every label/note/title rendered via `escapeHtml`/`html\`\`` from `safe-html.js`;
  SVG structure built by code, user data only in escaped text. No inline event handlers (CSP).
- **Performance:** no new bundle weight (vanilla). Layout pure+memoised; overlay O(n). Honours
  the bundle/motion budgets already in the repo.

## 13. Testing (TDD; matches the repo's vitest setup, target ≥80%)

| Type | Target | Cases |
|---|---|---|
| Unit | `scene.js` | factory defaults; immutable update; deterministic id/seed hashing |
| Unit | `repair-graph.js` | each repair in isolation; correct `GraphIssue` level; dangling-edge drop; `strict` throws |
| Unit | `canvas-layout.js` | Blueprint depth layout matches `diagram.js`; pinned nodes excluded from relayout |
| Unit | `blueprint-adapter.js` | atoms/links → scene; missing layer default; roots highlighted |
| Unit | `tour.js` | fan-in/out ranking; BFS order; 5–15 steps; clusters grouped; never empty `nodeIds` |
| Unit | `canvas-export.js` | `toExcalidraw` is valid Excalidraw JSON; bindings reference real ids; SVG escapes text; deterministic output |
| Unit | `store.js` (scenes) | save/get/list/delete; export/import round-trip |
| Unit | `backup.js` | scenes survive build→validate; bad rows dropped; clamp respected |
| Integration | engine (jsdom) | drag persists position; connect adds edge; overlay toggles classes without relayout |

## 14. Phase plan

- **Phase 1 (this spec):** `scene.js`, `repair-graph.js`, `canvas-layout.js`, `canvas-engine.js`,
  `blueprint-adapter.js`, `tour.js`, `tour-runner.js`, exporters, `scenes` store (v5),
  backup/export round-trip, Canvas tab, color-by-layer + legend. **Ships the Blueprint + Tour + export.**
- **Phase 1.5 (fast-follow):** search-to-focus (BM25 over scene), Scan-Ledger **diff overlay**
  (changed nodes light up on re-scan).
- **Phase 2 — Corkboard:** library-wide scene assembly from the `nodes`/`edges` stores
  (`getEgoGraph` generalised to a full graph), persistent board positions, red-string by
  relation, and **scoped layout** (folder/community grouping + edge aggregation + expand-on-demand,
  ported conceptually from Understand-Anything's two-stage layout — custom, no ELK).
- **Phase 3 — Stack Studio:** pick 2–6 repos → generative wiring (reuse Combinator/Stack-Builder
  plumbing) → roles/glue/gaps seeded onto the canvas.

## 15. Risks & mitigations

- **Engine scope creep** → strict Phase 1 boundary; Blueprint's ≤15 nodes keeps the first build honest.
- **Messy LLM graphs crashing render** → `repair-graph.js` + `strict` tests (§6).
- **Zero-build temptation to add a lib** → explicit non-goal; custom layout is small because
  graphs are small in P1.
- **Tour narration cost** → defaults to existing Deep Dive text; LLM polish is opt-in.
- **A11y/motion regressions** → reduced-motion fallbacks + focusable nodes specified up front.

## 16. Open questions

1. Product name for the tab — "Canvas", "The Board", or a Case-File-flavoured name? (Provisional: **Canvas**.)
2. Should the Blueprint scene auto-seed on first Deep Dive completion, or only when the user opens the Canvas tab? (Provisional: **on tab open**, to avoid doing work users don't ask for.)
