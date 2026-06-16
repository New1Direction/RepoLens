# Interactive Canvas — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a zero-build interactive canvas that turns a repo's Deep Dive into a draggable, annotatable, exportable **Blueprint** with a narrated **Guided Tour**.

**Architecture:** One pure scene model + a vanilla Pointer-Events SVG engine. *Layout is pure and memoised; visual state (selection/tour/hover) is a separate overlay pass that never relays out.* Data seeds from Deep Dive `atoms`/`lineage`; scenes persist in a new IndexedDB store (v4→v5) and serialise to `.excalidraw`/SVG.

**Tech Stack:** Vanilla ES modules (no bundler, no deps), IndexedDB via `store/idb.js`, SVG, Vitest (jsdom), `safe-html.js` for escaping. Manifest V3 / existing CSP.

**Spec:** `docs/superpowers/specs/2026-06-15-interactive-canvas-design.md`

**Branch:** `feat/canvas-engine` (already created off `main`; spec already committed).

---

## Shared type shapes (referenced by every task)

```js
// node:       { id, label, kind, layer, x, y, pinned, ref }
// edge:       { id, from, to, rel, note, userDrawn }
// annotation: { id, x, y, text, tone }   // tone: 'note' | 'warn'
// scene:      { id, scope, repoId, title, nodes, edges, annotations,
//               camera:{x,y,zoom}, tour, source, createdAt, updatedAt }
// tourStep:   { order, nodeIds, title, blurb, lesson? }
// graphIssue: { level:'auto-corrected'|'dropped', code, message }
```

`KNOWN_KINDS = ['subsystem','module','concept','entrypoint','data']`
`KNOWN_RELS  = ['depends-on','enables','triggers','derives-from']`
User-drawn corkboard edges later add `'string'`; not used in Phase 1.

## File structure (Phase 1)

| File | Responsibility | New/Modify |
|---|---|---|
| `scene.js` | Scene factory, `hashId`, immutable helpers, `validateScene` | New |
| `repair-graph.js` | Normalize messy LLM nodes/edges → `{nodes,edges,issues}` | New |
| `canvas-layout.js` | `layoutBlueprint` (depth DAG, ports `diagram.js` math) | New |
| `blueprint-adapter.js` | Deep Dive `atoms`/`lineage` → seeded scene | New |
| `tour.js` | `buildTour` — fan-in/out, BFS order, clusters → steps | New |
| `canvas-export.js` | `toCanvasSvg`, `toExcalidraw` (pure strings) | New |
| `canvas-engine.js` | Interactive SVG surface (pan/zoom/drag/connect/note + overlay) | New |
| `tour-runner.js` | Camera + narration overlay through tour steps | New |
| `store/idb.js` | Add `'scenes'` store, bump `DB_VERSION` 4→5 | Modify |
| `store.js` | `saveScene/getScene/listScenes/deleteScene` + export/import | Modify |
| `backup.js` | `scenes` in envelope build/validate + `MAX_ROWS` | Modify |
| `settings-backup.js` | Allowlist `canvasEnabled`, `canvasTourAutoplay` | Modify |
| `output-tab.html` | Canvas tab button + `#t27` host + CSS | Modify |
| `output-tab.js` | `TAB_SLUGS[27]='canvas'` + `renderCanvas(d)` | Modify |
| `themes.css` | `--canvas-*` tokens + node/edge/tour classes | Modify |
| `tests/*.test.js` | One per pure module + engine integration | New |

**Engine ownership rule:** pure modules (`scene`, `repair-graph`, `canvas-layout`, `blueprint-adapter`, `tour`, `canvas-export`) never mutate inputs. `canvas-engine` deep-clones the scene on mount, owns that working copy, mutates it on interaction, and persists via a debounced `onChange`. This satisfies immutability at module boundaries without per-frame copies.

---

### Task 1: Scene model (`scene.js`)

**Files:**
- Create: `scene.js`
- Test: `tests/scene.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/scene.test.js
import { describe, it, expect } from 'vitest';
import { hashId, createScene, withNodePos, validateScene } from '../scene.js';

describe('hashId', () => {
  it('is deterministic and positive', () => {
    expect(hashId('core')).toBe(hashId('core'));
    expect(hashId('core')).toBeGreaterThan(0);
  });
  it('differs for different input', () => {
    expect(hashId('a')).not.toBe(hashId('b'));
  });
});

describe('createScene', () => {
  it('builds a blueprint scene with defaults', () => {
    const s = createScene({ scope: 'blueprint', repoId: 'evanw/esbuild', title: 'esbuild' });
    expect(s.id).toBe('repo:' + hashId('evanw/esbuild'));
    expect(s.scope).toBe('blueprint');
    expect(s.nodes).toEqual([]);
    expect(s.edges).toEqual([]);
    expect(s.annotations).toEqual([]);
    expect(s.camera).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(s.tour).toBeNull();
    expect(typeof s.createdAt).toBe('string');
  });
});

describe('withNodePos', () => {
  it('returns a new scene with one node moved, input untouched', () => {
    const s = createScene({ scope: 'blueprint', repoId: 'r', title: 't' });
    s.nodes = [{ id: 'a', label: 'A', kind: 'module', layer: null, x: 0, y: 0, pinned: false, ref: null }];
    const next = withNodePos(s, 'a', 10, 20);
    expect(next.nodes[0]).toMatchObject({ x: 10, y: 20 });
    expect(s.nodes[0]).toMatchObject({ x: 0, y: 0 }); // input not mutated
    expect(next).not.toBe(s);
  });
});

describe('validateScene', () => {
  it('flags edges referencing unknown nodes', () => {
    const s = createScene({ scope: 'blueprint', repoId: 'r', title: 't' });
    s.nodes = [{ id: 'a', label: 'A', kind: 'module', layer: null, x: 0, y: 0, pinned: false, ref: null }];
    s.edges = [{ id: 'e', from: 'a', to: 'ghost', rel: 'depends-on', note: null, userDrawn: false }];
    const r = validateScene(s);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/unknown node/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scene.test.js`
Expected: FAIL — `Failed to resolve import "../scene.js"`.

- [ ] **Step 3: Write minimal implementation**

```js
// scene.js
// Pure scene model for the interactive canvas. No DOM, no network.

/** djb2 string hash → positive integer. Deterministic; mirrors store.hashRepoId. */
export function hashId(str) {
  let h = 5381;
  const s = String(str);
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) || 1;
}

const nowIso = () => new Date().toISOString();

/** Build an empty scene for a scope. id derives from scope + repoId. */
export function createScene({ scope, repoId = null, title = '' }) {
  const id =
    scope === 'corkboard' ? 'library'
    : scope === 'stack' ? 'stack:' + hashId(repoId || title)
    : 'repo:' + hashId(repoId || title);
  const ts = nowIso();
  return {
    id, scope, repoId, title,
    nodes: [], edges: [], annotations: [],
    camera: { x: 0, y: 0, zoom: 1 },
    tour: null,
    source: { lens: 'deepDive', generatedAt: ts, scanAt: null },
    createdAt: ts, updatedAt: ts,
  };
}

/** Immutable: return a copy of `scene` with node `id` moved to (x,y). */
export function withNodePos(scene, id, x, y) {
  return {
    ...scene,
    nodes: scene.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
    updatedAt: nowIso(),
  };
}

/** Validate referential integrity. Returns { ok, errors }. */
export function validateScene(scene) {
  const errors = [];
  if (!scene || typeof scene !== 'object') return { ok: false, errors: ['not an object'] };
  const ids = new Set((scene.nodes || []).map((n) => n.id));
  for (const e of scene.edges || []) {
    if (!ids.has(e.from) || !ids.has(e.to)) errors.push(`edge ${e.id} references unknown node`);
  }
  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scene.test.js`
Expected: PASS (4 files / all assertions green).

- [ ] **Step 5: Commit**

```bash
git add scene.js tests/scene.test.js
git commit -m "feat(canvas): pure scene model (hashId, createScene, withNodePos, validateScene)"
```

---

### Task 2: Graph repair (`repair-graph.js`)

**Files:**
- Create: `repair-graph.js`
- Test: `tests/repair-graph.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/repair-graph.test.js
import { describe, it, expect } from 'vitest';
import { repairGraph } from '../repair-graph.js';

describe('repairGraph', () => {
  it('drops edges whose endpoints are missing', () => {
    const raw = {
      nodes: [{ id: 'a', name: 'A' }],
      edges: [{ from: 'a', to: 'ghost', relation: 'depends-on' }],
    };
    const { edges, issues } = repairGraph(raw);
    expect(edges).toHaveLength(0);
    expect(issues.some((i) => i.level === 'dropped' && /dangling/.test(i.code))).toBe(true);
  });

  it('coerces kind and relation aliases to the known set', () => {
    const raw = {
      nodes: [{ id: 'a', name: 'A', kind: 'FUNCTION' }, { id: 'b', name: 'B', kind: 'service' }],
      edges: [{ from: 'a', to: 'b', relation: 'imports' }],
    };
    const { nodes, edges } = repairGraph(raw);
    expect(nodes[0].kind).toBe('module');     // FUNCTION → module
    expect(nodes[1].kind).toBe('subsystem');  // service → subsystem
    expect(edges[0].rel).toBe('depends-on');  // imports → depends-on
  });

  it('dedupes node ids and drops nodes missing an id', () => {
    const raw = {
      nodes: [{ id: 'a', name: 'A' }, { id: 'a', name: 'A2' }, { name: 'noid' }],
      edges: [],
    };
    const { nodes, issues } = repairGraph(raw);
    expect(nodes).toHaveLength(1);
    expect(issues.some((i) => /dedupe/.test(i.code))).toBe(true);
    expect(issues.some((i) => /missing-id/.test(i.code))).toBe(true);
  });

  it('fills missing label/kind defaults', () => {
    const { nodes } = repairGraph({ nodes: [{ id: 'a' }], edges: [] });
    expect(nodes[0].label).toBe('a');
    expect(nodes[0].kind).toBe('module');
  });

  it('throws in strict mode on a dropped issue', () => {
    expect(() => repairGraph({ nodes: [], edges: [{ from: 'x', to: 'y' }] }, { strict: true })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/repair-graph.test.js`
Expected: FAIL — cannot resolve `../repair-graph.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// repair-graph.js
// Normalize messy LLM-produced graph data into a valid {nodes, edges} set.
// Never throws unless { strict:true }. Inspired by Understand-Anything's tiered model.

const KNOWN_KINDS = new Set(['subsystem', 'module', 'concept', 'entrypoint', 'data']);
const KIND_ALIASES = {
  function: 'module', fn: 'module', method: 'module', file: 'module', class: 'module',
  service: 'subsystem', package: 'subsystem', pkg: 'subsystem', mod: 'subsystem',
  config: 'data', table: 'data', schema: 'data', endpoint: 'data',
  entry: 'entrypoint', main: 'entrypoint', idea: 'concept',
};
const KNOWN_RELS = new Set(['depends-on', 'enables', 'triggers', 'derives-from']);
const REL_ALIASES = {
  depends_on: 'depends-on', dependson: 'depends-on', imports: 'depends-on', uses: 'depends-on',
  requires: 'depends-on', calls: 'triggers', invokes: 'triggers', publishes: 'triggers',
  extends: 'derives-from', inherits: 'derives-from', implements: 'derives-from', enables: 'enables',
};

const coerceKind = (k) => {
  const v = String(k || '').trim().toLowerCase();
  if (KNOWN_KINDS.has(v)) return v;
  return KIND_ALIASES[v] || 'module';
};
const coerceRel = (r) => {
  const v = String(r || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (KNOWN_RELS.has(v)) return v;
  return REL_ALIASES[v] || 'depends-on';
};

/**
 * @param {{nodes?:any[], edges?:any[]}} raw
 * @param {{strict?:boolean}} [opts]
 * @returns {{nodes:object[], edges:object[], issues:object[]}}
 */
export function repairGraph(raw, opts = {}) {
  const issues = [];
  const add = (level, code, message) => {
    issues.push({ level, code, message });
    if (opts.strict && level === 'dropped') throw new Error(`repairGraph strict: ${code} — ${message}`);
  };

  const seen = new Set();
  const nodes = [];
  for (const n of (raw && raw.nodes) || []) {
    if (!n || n.id == null || n.id === '') { add('dropped', 'missing-id', 'node without id'); continue; }
    const id = String(n.id);
    if (seen.has(id)) { add('auto-corrected', 'dedupe', `duplicate node id ${id}`); continue; }
    seen.add(id);
    const kind = coerceKind(n.kind);
    if (n.kind && coerceKind(n.kind) !== String(n.kind).toLowerCase())
      add('auto-corrected', 'kind-alias', `kind "${n.kind}" → ${kind}`);
    nodes.push({
      id,
      label: String(n.name ?? n.label ?? id),
      kind,
      layer: n.layer != null ? String(n.layer) : null,
      x: Number.isFinite(n.x) ? n.x : 0,
      y: Number.isFinite(n.y) ? n.y : 0,
      pinned: !!n.pinned,
      ref: { purpose: n.purpose ?? null, files: Array.isArray(n.files) ? n.files : [] },
    });
  }

  const ids = new Set(nodes.map((n) => n.id));
  const edges = [];
  const edgeSeen = new Set();
  for (const e of (raw && raw.edges) || []) {
    const from = String((e && (e.from ?? e.source)) ?? '');
    const to = String((e && (e.to ?? e.target)) ?? '');
    if (!ids.has(from) || !ids.has(to)) { add('dropped', 'dangling-edge', `edge ${from}→${to} has a missing endpoint`); continue; }
    const rel = coerceRel(e.rel ?? e.relation ?? e.type);
    const key = `${from}|${rel}|${to}`;
    if (edgeSeen.has(key)) continue;
    edgeSeen.add(key);
    edges.push({ id: `e${hash(key)}`, from, to, rel, note: e.note ?? null, userDrawn: !!e.userDrawn });
  }

  return { nodes, edges, issues };
}

function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff; return Math.abs(h) || 1; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/repair-graph.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add repair-graph.js tests/repair-graph.test.js
git commit -m "feat(canvas): repairGraph — tame messy LLM node/edge data"
```

---

### Task 3: Blueprint layout (`canvas-layout.js`)

**Files:**
- Create: `canvas-layout.js`
- Test: `tests/canvas-layout.test.js`

Reuses the cycle-safe depth relaxation from `diagram.js:20-40`, but emits `{x,y}` per node instead of SVG, and leaves `pinned` nodes where they are.

- [ ] **Step 1: Write the failing test**

```js
// tests/canvas-layout.test.js
import { describe, it, expect } from 'vitest';
import { layoutBlueprint } from '../canvas-layout.js';

const N = (id) => ({ id, label: id, kind: 'module', layer: null, x: 0, y: 0, pinned: false, ref: null });

describe('layoutBlueprint', () => {
  it('places roots left of their dependents (increasing x by depth)', () => {
    const nodes = [N('cli'), N('core'), N('out')];
    const edges = [
      { id: 'e1', from: 'cli', to: 'core', rel: 'depends-on', note: null, userDrawn: false },
      { id: 'e2', from: 'core', to: 'out', rel: 'triggers', note: null, userDrawn: false },
    ];
    const placed = layoutBlueprint(nodes, edges);
    const by = Object.fromEntries(placed.map((n) => [n.id, n]));
    expect(by.cli.x).toBeLessThan(by.core.x);
    expect(by.core.x).toBeLessThan(by.out.x);
  });

  it('does not move pinned nodes', () => {
    const nodes = [{ ...N('a'), x: 999, y: 888, pinned: true }, N('b')];
    const edges = [{ id: 'e', from: 'a', to: 'b', rel: 'depends-on', note: null, userDrawn: false }];
    const placed = layoutBlueprint(nodes, edges);
    const a = placed.find((n) => n.id === 'a');
    expect(a).toMatchObject({ x: 999, y: 888 });
  });

  it('handles cycles without infinite loop', () => {
    const nodes = [N('a'), N('b')];
    const edges = [
      { id: 'e1', from: 'a', to: 'b', rel: 'depends-on', note: null, userDrawn: false },
      { id: 'e2', from: 'b', to: 'a', rel: 'depends-on', note: null, userDrawn: false },
    ];
    expect(() => layoutBlueprint(nodes, edges)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/canvas-layout.test.js`
Expected: FAIL — cannot resolve `../canvas-layout.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// canvas-layout.js
// Pure seed-layout for the Blueprint scope. Left→right layered DAG.
// Ports diagram.js's cycle-safe depth relaxation; emits {x,y} not SVG.

const COL_W = 220, ROW_H = 110, PAD = 40;

/**
 * @param {object[]} nodes  scene nodes (mutated copies returned, inputs untouched)
 * @param {object[]} edges  scene edges
 * @returns {object[]} new node array with x/y assigned (pinned nodes keep theirs)
 */
export function layoutBlueprint(nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const idset = new Set(ids);
  const valid = edges.filter((e) => idset.has(e.from) && idset.has(e.to));

  // depth = longest path from a root; bounded relaxation (cycle-safe)
  const depth = Object.fromEntries(ids.map((id) => [id, 0]));
  for (let i = 0; i < ids.length; i++) {
    let changed = false;
    for (const e of valid) if (depth[e.to] < depth[e.from] + 1) { depth[e.to] = depth[e.from] + 1; changed = true; }
    if (!changed) break;
  }

  const cols = {};
  ids.forEach((id) => { (cols[depth[id]] ||= []).push(id); });

  const pos = {};
  Object.keys(cols).forEach((d) => {
    const col = cols[d];
    col.forEach((id, i) => { pos[id] = { x: PAD + Number(d) * COL_W, y: PAD + i * ROW_H }; });
  });

  return nodes.map((n) => (n.pinned ? { ...n } : { ...n, x: pos[n.id].x, y: pos[n.id].y }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/canvas-layout.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add canvas-layout.js tests/canvas-layout.test.js
git commit -m "feat(canvas): layoutBlueprint — cycle-safe layered DAG positions"
```

---

### Task 4: Blueprint adapter (`blueprint-adapter.js`)

**Files:**
- Create: `blueprint-adapter.js`
- Test: `tests/blueprint-adapter.test.js`

Turns Deep Dive output into a laid-out, persisted-ready scene. `layerOf` is injected (defaults to kind) so it's testable without `taxonomy.js`.

- [ ] **Step 1: Write the failing test**

```js
// tests/blueprint-adapter.test.js
import { describe, it, expect } from 'vitest';
import { buildBlueprintScene } from '../blueprint-adapter.js';

const deepDive = {
  atoms: [
    { id: 'cli', name: 'CLI', kind: 'entrypoint', purpose: 'parses argv', files: ['cli.js'] },
    { id: 'core', name: 'Core', kind: 'subsystem', purpose: 'the engine', files: ['core.js'] },
  ],
  lineage: { links: [{ from: 'cli', to: 'core', relation: 'depends-on' }], roots: ['cli'], leaves: ['core'] },
};

describe('buildBlueprintScene', () => {
  it('produces a blueprint scene with placed nodes and an edge', () => {
    const s = buildBlueprintScene({ deepDive, repoId: 'evanw/esbuild', title: 'esbuild', scanAt: '2026-06-15T00:00:00Z' });
    expect(s.scope).toBe('blueprint');
    expect(s.nodes).toHaveLength(2);
    expect(s.edges).toHaveLength(1);
    expect(s.nodes.find((n) => n.id === 'cli').x).toBeLessThan(s.nodes.find((n) => n.id === 'core').x);
    expect(s.source.scanAt).toBe('2026-06-15T00:00:00Z');
  });

  it('uses layerOf when provided', () => {
    const s = buildBlueprintScene({ deepDive, repoId: 'r', title: 't', layerOf: (a) => 'L:' + a.kind });
    expect(s.nodes[0].layer).toBe('L:entrypoint');
  });

  it('returns repair issues alongside the scene', () => {
    const dd = { atoms: [{ id: 'a', name: 'A' }], lineage: { links: [{ from: 'a', to: 'ghost' }] } };
    const { scene, issues } = buildBlueprintScene({ deepDive: dd, repoId: 'r', title: 't', withIssues: true });
    expect(scene.edges).toHaveLength(0);
    expect(issues.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/blueprint-adapter.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```js
// blueprint-adapter.js
// Deep Dive atoms/lineage → a laid-out Blueprint scene.

import { createScene } from './scene.js';
import { repairGraph } from './repair-graph.js';
import { layoutBlueprint } from './canvas-layout.js';

/**
 * @param {object} args
 * @param {{atoms:any[], lineage:{links:any[], roots?:string[], leaves?:string[]}}} args.deepDive
 * @param {string} args.repoId
 * @param {string} args.title
 * @param {string|null} [args.scanAt]
 * @param {(atom:object)=>string} [args.layerOf]  defaults to atom.kind
 * @param {boolean} [args.withIssues]  when true, returns { scene, issues }
 * @returns {object|{scene:object, issues:object[]}}
 */
export function buildBlueprintScene({ deepDive, repoId, title, scanAt = null, layerOf = (a) => a.kind, withIssues = false }) {
  const atoms = (deepDive && deepDive.atoms) || [];
  const links = (deepDive && deepDive.lineage && deepDive.lineage.links) || [];
  const roots = new Set((deepDive && deepDive.lineage && deepDive.lineage.roots) || []);

  const layerByAtomId = Object.fromEntries(atoms.map((a) => [a.id, layerOf(a) ?? null]));
  const { nodes, edges, issues } = repairGraph({
    nodes: atoms.map((a) => ({ ...a, layer: layerByAtomId[a.id] })),
    edges: links,
  });

  // mark lineage roots (load-bearing) so the engine can highlight them
  for (const n of nodes) n.ref = { ...(n.ref || {}), root: roots.has(n.id) };

  const placed = layoutBlueprint(nodes, edges);

  const scene = createScene({ scope: 'blueprint', repoId, title });
  scene.nodes = placed;
  scene.edges = edges;
  scene.source.scanAt = scanAt;

  return withIssues ? { scene, issues } : scene;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/blueprint-adapter.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add blueprint-adapter.js tests/blueprint-adapter.test.js
git commit -m "feat(canvas): blueprint-adapter — Deep Dive atoms/lineage → scene"
```

---

### Task 5: Guided Tour computation (`tour.js`)

**Files:**
- Create: `tour.js`
- Test: `tests/tour.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/tour.test.js
import { describe, it, expect } from 'vitest';
import { buildTour } from '../tour.js';

const scene = {
  nodes: [
    { id: 'cli', label: 'CLI', kind: 'entrypoint', ref: { purpose: 'entry', root: true } },
    { id: 'core', label: 'Core', kind: 'subsystem', ref: { purpose: 'the engine' } },
    { id: 'out', label: 'Output', kind: 'module', ref: { purpose: 'writes files' } },
  ],
  edges: [
    { id: 'e1', from: 'cli', to: 'core', rel: 'depends-on' },
    { id: 'e2', from: 'core', to: 'out', rel: 'triggers' },
  ],
};

describe('buildTour', () => {
  it('returns ordered steps starting at a root, 1..N with no gaps', () => {
    const steps = buildTour(scene, { roots: ['cli'] });
    expect(steps.length).toBeGreaterThanOrEqual(1);
    expect(steps.map((s) => s.order)).toEqual(steps.map((_, i) => i + 1));
    expect(steps[0].nodeIds).toContain('cli');
  });
  it('never emits empty nodeIds and uses purpose as blurb', () => {
    const steps = buildTour(scene, { roots: ['cli'] });
    for (const s of steps) expect(s.nodeIds.length).toBeGreaterThan(0);
    const core = steps.find((s) => s.nodeIds.includes('core'));
    expect(core.blurb).toMatch(/engine/);
  });
  it('falls back to highest fan-in when no roots given', () => {
    const steps = buildTour(scene, {});
    expect(steps.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tour.test.js`
Expected: FAIL — cannot resolve `../tour.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// tour.js
// Compute a guided tour (5–15 steps) from a scene's topology. Pure, deterministic.

const MAX_STEPS = 15;

/**
 * @param {{nodes:object[], edges:object[]}} scene
 * @param {{roots?:string[]}} [hints]
 * @returns {Array<{order:number,nodeIds:string[],title:string,blurb:string,lesson?:string}>}
 */
export function buildTour(scene, hints = {}) {
  const nodes = scene.nodes || [];
  const edges = scene.edges || [];
  if (!nodes.length) return [];
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  // fan-in / fan-out
  const fanIn = Object.fromEntries(nodes.map((n) => [n.id, 0]));
  const fanOut = Object.fromEntries(nodes.map((n) => [n.id, 0]));
  const adj = Object.fromEntries(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (byId[e.from]) { fanOut[e.from]++; adj[e.from].push(e.to); }
    if (byId[e.to]) fanIn[e.to]++;
  }

  // start: provided root with highest fan-out, else node with lowest fan-in / highest fan-out
  const roots = (hints.roots || []).filter((id) => byId[id]);
  let start = roots.sort((a, b) => fanOut[b] - fanOut[a])[0];
  if (!start) start = nodes.slice().sort((a, b) => (fanIn[a.id] - fanIn[b.id]) || (fanOut[b.id] - fanOut[a.id]))[0].id;

  // BFS reading order from start
  const order = [];
  const seen = new Set();
  const q = [start];
  seen.add(start);
  while (q.length) {
    const id = q.shift();
    order.push(id);
    for (const nb of adj[id] || []) if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
  }
  // include any unreached nodes by fan-in importance
  for (const n of nodes.slice().sort((a, b) => fanIn[b.id] - fanIn[a.id]))
    if (!seen.has(n.id)) { seen.add(n.id); order.push(n.id); }

  const picked = order.slice(0, MAX_STEPS);
  return picked.map((id, i) => {
    const n = byId[id];
    return {
      order: i + 1,
      nodeIds: [id],
      title: n.label,
      blurb: (n.ref && n.ref.purpose) ? String(n.ref.purpose) : `${n.label} (${n.kind}).`,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tour.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tour.js tests/tour.test.js
git commit -m "feat(canvas): buildTour — dependency-ordered guided tour steps"
```

---

### Task 6: Exporters (`canvas-export.js`)

**Files:**
- Create: `canvas-export.js`
- Test: `tests/canvas-export.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/canvas-export.test.js
import { describe, it, expect } from 'vitest';
import { toCanvasSvg, toExcalidraw } from '../canvas-export.js';

const scene = {
  id: 'repo:1', scope: 'blueprint', title: 'esbuild',
  nodes: [
    { id: 'cli', label: 'CLI', kind: 'entrypoint', layer: null, x: 40, y: 40, pinned: false, ref: {} },
    { id: 'core', label: 'Core', kind: 'subsystem', layer: null, x: 300, y: 120, pinned: false, ref: {} },
  ],
  edges: [{ id: 'e1', from: 'cli', to: 'core', rel: 'depends-on', note: null, userDrawn: false }],
  annotations: [{ id: 'a1', x: 60, y: 220, text: 'check this <b>', tone: 'warn' }],
  camera: { x: 0, y: 0, zoom: 1 },
};

describe('toCanvasSvg', () => {
  it('emits an <svg> with a node label and escaped annotation text', () => {
    const svg = toCanvasSvg(scene);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('CLI');
    expect(svg).toContain('check this &lt;b&gt;'); // escaped
    expect(svg).not.toContain('check this <b>');
  });
});

describe('toExcalidraw', () => {
  it('emits valid excalidraw JSON with rectangles, bound text, and an arrow', () => {
    const doc = JSON.parse(toExcalidraw(scene));
    expect(doc.type).toBe('excalidraw');
    expect(doc.version).toBe(2);
    const types = doc.elements.map((e) => e.type);
    expect(types).toContain('rectangle');
    expect(types).toContain('text');
    expect(types).toContain('arrow');
    // arrow binds to existing element ids
    const arrow = doc.elements.find((e) => e.type === 'arrow');
    const ids = new Set(doc.elements.map((e) => e.id));
    expect(ids.has(arrow.startBinding.elementId)).toBe(true);
    expect(ids.has(arrow.endBinding.elementId)).toBe(true);
  });
  it('is deterministic for the same scene', () => {
    expect(toExcalidraw(scene)).toBe(toExcalidraw(scene));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/canvas-export.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```js
// canvas-export.js
// Pure serializers: scene → standalone SVG, and scene → Excalidraw document JSON.

import { escapeHtml as esc } from './safe-html.js';

const NW = 132, NH = 44;
const seedFrom = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff; return Math.abs(h) || 1; };

/** Standalone, themeable SVG snapshot of the scene. */
export function toCanvasSvg(scene) {
  const nodes = scene.nodes || [];
  const edges = scene.edges || [];
  const ann = scene.annotations || [];
  const pos = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const minX = Math.min(0, ...nodes.map((n) => n.x)) - 20;
  const minY = Math.min(0, ...nodes.map((n) => n.y)) - 20;
  const maxX = Math.max(...nodes.map((n) => n.x + NW), 200) + 20;
  const maxY = Math.max(...nodes.map((n) => n.y + NH), 200) + 60;

  const edgeSvg = edges.map((e) => {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) return '';
    const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
    return `<path class="ce-edge ce-${esc(e.rel)}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none"/>`;
  }).join('');

  const nodeSvg = nodes.map((n) =>
    `<g class="ce-node ce-kind-${esc(n.kind)}"><rect x="${n.x}" y="${n.y}" width="${NW}" height="${NH}" rx="8"/>` +
    `<text x="${n.x + NW / 2}" y="${n.y + NH / 2}" text-anchor="middle" dominant-baseline="central">${esc(n.label)}</text></g>`
  ).join('');

  const annSvg = ann.map((a) =>
    `<g class="ce-note ce-${esc(a.tone)}"><rect x="${a.x}" y="${a.y}" width="150" height="48" rx="4"/>` +
    `<text x="${a.x + 8}" y="${a.y + 20}">${esc(a.text)}</text></g>`
  ).join('');

  return `<svg class="canvas-export" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" xmlns="http://www.w3.org/2000/svg">${edgeSvg}${nodeSvg}${annSvg}</svg>`;
}

/** Scene → Excalidraw document (opens in excalidraw.com, Obsidian, VS Code). */
export function toExcalidraw(scene) {
  const elements = [];
  const base = (id, extra) => ({
    id, x: 0, y: 0, width: 0, height: 0, angle: 0, strokeColor: '#1e1a14', backgroundColor: 'transparent',
    fillStyle: 'solid', strokeWidth: 1, strokeStyle: 'solid', roughness: 1, opacity: 100,
    groupIds: [], frameId: null, roundness: { type: 3 }, seed: seedFrom(id), versionNonce: seedFrom('n' + id),
    version: 1, isDeleted: false, boundElements: [], updated: 1, link: null, locked: false, ...extra,
  });

  for (const n of scene.nodes || []) {
    const rid = `rect-${n.id}`, tid = `txt-${n.id}`;
    elements.push(base(rid, {
      type: 'rectangle', x: n.x, y: n.y, width: 132, height: 44,
      backgroundColor: n.kind === 'subsystem' ? '#c2691c' : '#fffdf6',
      boundElements: [{ type: 'text', id: tid }],
    }));
    elements.push(base(tid, {
      type: 'text', x: n.x + 8, y: n.y + 14, width: 116, height: 20, text: String(n.label),
      fontSize: 16, fontFamily: 1, textAlign: 'center', verticalAlign: 'middle', containerId: rid,
      originalText: String(n.label), lineHeight: 1.25,
    }));
  }

  const pos = Object.fromEntries((scene.nodes || []).map((n) => [n.id, n]));
  for (const e of scene.edges || []) {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) continue;
    const x1 = a.x + 132, y1 = a.y + 22, x2 = b.x, y2 = b.y + 22;
    elements.push(base(`arrow-${e.id}`, {
      type: 'arrow', x: x1, y: y1, width: x2 - x1, height: y2 - y1,
      points: [[0, 0], [x2 - x1, y2 - y1]],
      startBinding: { elementId: `rect-${e.from}`, focus: 0, gap: 4 },
      endBinding: { elementId: `rect-${e.to}`, focus: 0, gap: 4 },
      strokeColor: e.rel === 'triggers' ? '#3b6ea5' : e.rel === 'enables' ? '#2f7d34' : '#1e1a14',
    }));
  }

  for (const a of scene.annotations || []) {
    elements.push(base(`note-${a.id}`, {
      type: 'text', x: a.x, y: a.y, width: 150, height: 40, text: String(a.text),
      fontSize: 14, fontFamily: 1, textAlign: 'left', verticalAlign: 'top',
      originalText: String(a.text), lineHeight: 1.25, strokeColor: a.tone === 'warn' ? '#8a480f' : '#1e1a14',
    }));
  }

  return JSON.stringify({
    type: 'excalidraw', version: 2, source: 'https://github.com/RepoLens',
    elements, appState: { gridSize: null, viewBackgroundColor: '#fbf6ea' }, files: {},
  }, null, 2);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/canvas-export.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add canvas-export.js tests/canvas-export.test.js
git commit -m "feat(canvas): toCanvasSvg + toExcalidraw exporters"
```

---

### Task 7: Add the `scenes` IndexedDB store (`store/idb.js`)

**Files:**
- Modify: `store/idb.js` (the `STORES` array + `DB_VERSION`)

- [ ] **Step 1: Read the current store list**

Run: `grep -n "DB_VERSION\|STORES =" store/idb.js`
Expected: shows `DB_VERSION = 4` and `STORES = ['repos','nodes','edges','collections','decisions','snapshots']`.

- [ ] **Step 2: Bump version and append the store**

Edit `store/idb.js`: change `DB_VERSION = 4` → `DB_VERSION = 5`, and append `'scenes'` to the `STORES` array so it reads:

```js
const DB_VERSION = 5;
const STORES = ['repos', 'nodes', 'edges', 'collections', 'decisions', 'snapshots', 'scenes'];
```

(The existing `onupgradeneeded` loop creates any missing store with `{ keyPath: 'id' }` — additive, no data migration.)

- [ ] **Step 3: Verify the module still parses**

Run: `node --check store/idb.js`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add store/idb.js
git commit -m "feat(canvas): add 'scenes' object store (idb v4->v5, additive)"
```

---

### Task 8: Scene persistence APIs (`store.js`)

**Files:**
- Modify: `store.js` (add scene functions; include `scenes` in `exportStores`/`importStores`)
- Test: `tests/store-scenes.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/store-scenes.test.js
// store.js talks to IndexedDB; this test uses fake-indexeddb (already a dev dep used by store tests).
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { saveScene, getScene, listScenes, deleteScene } from '../store.js';

const mk = (id, repoId) => ({ id, scope: 'blueprint', repoId, title: id, nodes: [], edges: [], annotations: [], camera: { x: 0, y: 0, zoom: 1 }, tour: null, source: {}, createdAt: 'x', updatedAt: 'x' });

describe('scene persistence', () => {
  it('saves and reads a scene by id', async () => {
    await saveScene(mk('repo:1', 'a/b'));
    const got = await getScene('repo:1');
    expect(got.title).toBe('repo:1');
  });
  it('lists scenes filtered by repoId', async () => {
    await saveScene(mk('repo:2', 'x/y'));
    await saveScene(mk('repo:3', 'x/y'));
    const list = await listScenes('x/y');
    expect(list.map((s) => s.id).sort()).toEqual(['repo:2', 'repo:3']);
  });
  it('deletes a scene', async () => {
    await saveScene(mk('repo:4', 'q/r'));
    await deleteScene('repo:4');
    expect(await getScene('repo:4')).toBeNull();
  });
});
```

> If the repo's existing store tests use a different IndexedDB shim, mirror their import. Check with `grep -rl "fake-indexeddb\|indexedDB" tests | head`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store-scenes.test.js`
Expected: FAIL — `saveScene` is not exported.

- [ ] **Step 3: Add the APIs**

In `store.js`, near the snapshot helpers, add (use the file's existing `idbPut`/`idbGet`/`idbGetAll` helpers — confirm names with `grep -n "function idb" store.js`):

```js
// --- Canvas scenes ---
export async function saveScene(scene) {
  if (!scene || !scene.id) throw new Error('saveScene: scene.id required');
  await idbPut('scenes', scene);
}
export async function getScene(id) {
  return (await idbGet('scenes', String(id))) || null;
}
export async function listScenes(repoId) {
  const all = (await idbGetAll('scenes')) || [];
  return repoId == null ? all : all.filter((s) => s.repoId === repoId);
}
export async function deleteScene(id) {
  await idbDelete('scenes', String(id));
}
```

Then add `scenes` to the bulk export/import. In `exportStores()` add `const scenes = await idbGetAll('scenes');` and include `scenes: scenes || []` in the returned object. In `importStores(rows, ...)`, handle a `scenes` array the same way `snapshots` is handled (iterate, `idbPut('scenes', row)`).

> If `idbDelete` isn't the helper name, use whatever delete wrapper exists (`grep -n "delete" store/idb.js store.js`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/store-scenes.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add store.js tests/store-scenes.test.js
git commit -m "feat(canvas): saveScene/getScene/listScenes/deleteScene + bulk export/import"
```

---

### Task 9: Scenes in the backup envelope (`backup.js`)

**Files:**
- Modify: `backup.js`
- Test: `tests/backup-scenes.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/backup-scenes.test.js
import { describe, it, expect } from 'vitest';
import { buildBackup, validateBackup } from '../backup.js';

const scene = { id: 'repo:1', scope: 'blueprint', repoId: 'a/b', nodes: [], edges: [], annotations: [] };

describe('backup with scenes', () => {
  it('includes scenes in the envelope and count', () => {
    const env = buildBackup({ repos: [], scenes: [scene] });
    expect(env.scenes).toHaveLength(1);
    expect(env.counts.scenes).toBe(1);
  });
  it('keeps valid scenes and drops malformed rows on validate', () => {
    const env = buildBackup({ scenes: [scene, { nope: true }] });
    const r = validateBackup(env);
    expect(r.ok).toBe(true);
    expect(r.value.scenes).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/backup-scenes.test.js`
Expected: FAIL — `env.scenes` is undefined.

- [ ] **Step 3: Implement**

In `backup.js`:
1. Add `scenes` to `MAX_ROWS` (match the snapshots cap, e.g. `scenes: 2000`).
2. In `buildBackup({ ..., scenes } = {})`: `const sc = arr(scenes);` add `scenes: sc` to the returned object and `scenes: sc.length` to `counts`.
3. Add a validator `const sceneOk = (s) => !!(s && s.id && s.scope && Array.isArray(s.nodes) && Array.isArray(s.edges));`
4. In `validateBackup`, clamp+filter: `scenes: clamp('scenes', arr(obj.scenes).filter(sceneOk))` (mirror the `snapshots` line).

(Match the exact helper names already in `backup.js` — `arr`, `clamp` per the Scan Ledger work.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/backup-scenes.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backup.js tests/backup-scenes.test.js
git commit -m "feat(canvas): round-trip scenes through the backup envelope"
```

---

### Task 10: Settings allowlist (`settings-backup.js`)

**Files:**
- Modify: `settings-backup.js`

- [ ] **Step 1: Add the keys**

Append `'canvasEnabled'` and `'canvasTourAutoplay'` to the `SAFE_SETTING_KEYS` array (no secrets; these are booleans).

- [ ] **Step 2: Verify parse**

Run: `node --check settings-backup.js`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add settings-backup.js
git commit -m "feat(canvas): allowlist canvasEnabled/canvasTourAutoplay in settings backup"
```

---

### Task 11: The canvas engine (`canvas-engine.js`)

**Files:**
- Create: `canvas-engine.js`
- Test: `tests/canvas-engine.test.js` (jsdom)

This is the largest task. The engine deep-clones the scene, renders SVG, handles pan/zoom/drag/connect/note, and exposes an **overlay** API that toggles classes without relayout. Vitest runs jsdom (`vitest.config.js` — confirm `environment: 'jsdom'`; if not present, add `// @vitest-environment jsdom` atop the test).

- [ ] **Step 1: Write the failing test**

```js
// tests/canvas-engine.test.js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { mountCanvas } from '../canvas-engine.js';

const scene = () => ({
  id: 'repo:1', scope: 'blueprint', title: 't',
  nodes: [
    { id: 'a', label: 'A', kind: 'module', layer: null, x: 0, y: 0, pinned: false, ref: {} },
    { id: 'b', label: 'B', kind: 'module', layer: null, x: 200, y: 0, pinned: false, ref: {} },
  ],
  edges: [{ id: 'e1', from: 'a', to: 'b', rel: 'depends-on', note: null, userDrawn: false }],
  annotations: [], camera: { x: 0, y: 0, zoom: 1 }, tour: null, source: {},
});

describe('mountCanvas', () => {
  let host;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });

  it('renders one <g> per node and one path per edge', () => {
    mountCanvas(host, scene(), {});
    expect(host.querySelectorAll('[data-node]').length).toBe(2);
    expect(host.querySelectorAll('[data-edge]').length).toBe(1);
  });

  it('moveNode persists via onChange and updates the node transform without re-creating nodes', () => {
    let saved = null;
    const api = mountCanvas(host, scene(), { onChange: (s) => { saved = s; } });
    const before = host.querySelector('[data-node="a"]');
    api.moveNode('a', 50, 60);
    const after = host.querySelector('[data-node="a"]');
    expect(after).toBe(before); // same element, not re-created (overlay/position, no relayout)
    expect(after.getAttribute('transform')).toContain('50');
    expect(saved.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 50, y: 60 });
  });

  it('setSpotlight toggles classes without changing node count', () => {
    const api = mountCanvas(host, scene(), {});
    api.setSpotlight(['a']);
    expect(host.querySelector('[data-node="a"]').classList.contains('is-spotlight')).toBe(true);
    expect(host.querySelector('[data-node="b"]').classList.contains('is-dim')).toBe(true);
    expect(host.querySelectorAll('[data-node]').length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/canvas-engine.test.js`
Expected: FAIL — cannot resolve `../canvas-engine.js`.

- [ ] **Step 3: Implement the engine**

```js
// canvas-engine.js
// Vanilla, dependency-free interactive SVG canvas. Pointer Events only.
// Layout is pure+memoized (positions live in the scene); selection/spotlight is an overlay pass.

import { escapeHtml as esc } from './safe-html.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const NW = 132, NH = 44;
const el = (name, attrs = {}) => { const e = document.createElementNS(SVGNS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

/**
 * Mount an interactive canvas into `host`.
 * @returns {{ moveNode, setSpotlight, clearSpotlight, getScene, destroy }}
 */
export function mountCanvas(host, inputScene, { onChange } = {}) {
  const scene = structuredClone(inputScene);        // engine owns its copy
  let saveTimer = null;
  const persist = () => { if (!onChange) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => onChange(structuredClone(scene)), 250); };

  host.innerHTML = '';
  const svg = el('svg', { class: 'rl-canvas', width: '100%', height: '100%' });
  const root = el('g', { class: 'rl-camera' });
  const edgeLayer = el('g', { class: 'rl-edges' });
  const nodeLayer = el('g', { class: 'rl-nodes' });
  root.append(edgeLayer, nodeLayer);
  svg.append(root);
  host.append(svg);

  const cam = scene.camera || (scene.camera = { x: 0, y: 0, zoom: 1 });
  const applyCamera = () => root.setAttribute('transform', `translate(${cam.x},${cam.y}) scale(${cam.zoom})`);

  const nodeEls = new Map();   // id -> <g>
  const edgeEls = new Map();   // id -> <path>

  function nodeAnchor(n, side) { return side === 'out' ? { x: n.x + NW, y: n.y + NH / 2 } : { x: n.x, y: n.y + NH / 2 }; }
  function edgePath(e) {
    const a = byId(e.from), b = byId(e.to); if (!a || !b) return '';
    const s = nodeAnchor(a, 'out'), t = nodeAnchor(b, 'in'), mx = (s.x + t.x) / 2;
    return `M${s.x},${s.y} C${mx},${s.y} ${mx},${t.y} ${t.x},${t.y}`;
  }
  const byId = (id) => scene.nodes.find((n) => n.id === id);

  // --- initial render (the only place nodes/edges are created) ---
  for (const e of scene.edges) {
    const p = el('path', { class: `rl-edge rl-${e.rel}`, d: edgePath(e), fill: 'none' });
    p.dataset.edge = e.id;
    edgeLayer.append(p); edgeEls.set(e.id, p);
  }
  for (const n of scene.nodes) {
    const g = el('g', { class: `rl-node rl-kind-${n.kind}`, transform: `translate(${n.x},${n.y})`, tabindex: '0' });
    g.dataset.node = n.id;
    if (n.ref && n.ref.root) g.classList.add('is-root');
    const rect = el('rect', { width: NW, height: NH, rx: 8 });
    const text = el('text', { x: NW / 2, y: NH / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    text.textContent = n.label;                       // textContent is safe (no HTML parse)
    g.append(rect, text);
    nodeLayer.append(g); nodeEls.set(n.id, g);
    wireDrag(g, n);
  }
  applyCamera();

  // --- node drag (pointer events) ---
  function wireDrag(g, n) {
    let startX, startY, ox, oy, dragging = false;
    g.addEventListener('pointerdown', (ev) => {
      dragging = true; g.setPointerCapture(ev.pointerId);
      startX = ev.clientX; startY = ev.clientY; ox = n.x; oy = n.y; ev.stopPropagation();
    });
    g.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      moveNode(n.id, ox + (ev.clientX - startX) / cam.zoom, oy + (ev.clientY - startY) / cam.zoom);
    });
    g.addEventListener('pointerup', (ev) => { if (dragging) { dragging = false; g.releasePointerCapture(ev.pointerId); persist(); } });
  }

  // --- camera pan (drag empty space) + zoom (wheel) ---
  let panning = false, px, py, pcx, pcy;
  svg.addEventListener('pointerdown', (ev) => { if (ev.target === svg || ev.target === root) { panning = true; px = ev.clientX; py = ev.clientY; pcx = cam.x; pcy = cam.y; } });
  svg.addEventListener('pointermove', (ev) => { if (panning) { cam.x = pcx + (ev.clientX - px); cam.y = pcy + (ev.clientY - py); applyCamera(); } });
  svg.addEventListener('pointerup', () => { if (panning) { panning = false; persist(); } });
  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
    cam.zoom = Math.max(0.2, Math.min(3, cam.zoom * factor));
    applyCamera(); persist();
  }, { passive: false });

  // --- public API ---
  function moveNode(id, x, y) {
    const n = byId(id); if (!n) return;
    n.x = x; n.y = y;
    const g = nodeEls.get(id); if (g) g.setAttribute('transform', `translate(${x},${y})`);
    for (const e of scene.edges) if (e.from === id || e.to === id) { const p = edgeEls.get(e.id); if (p) p.setAttribute('d', edgePath(e)); }
    persist();
  }
  function setSpotlight(ids) {
    const set = new Set(ids);
    for (const [id, g] of nodeEls) { g.classList.toggle('is-spotlight', set.has(id)); g.classList.toggle('is-dim', !set.has(id)); }
  }
  function clearSpotlight() { for (const [, g] of nodeEls) g.classList.remove('is-spotlight', 'is-dim'); }
  function getScene() { return structuredClone(scene); }
  function destroy() { clearTimeout(saveTimer); host.innerHTML = ''; }

  return { moveNode, setSpotlight, clearSpotlight, getScene, destroy };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/canvas-engine.test.js`
Expected: PASS. (If jsdom lacks `structuredClone`, it's available in Node ≥17 globally; the repo's Node satisfies this.)

- [ ] **Step 5: Commit**

```bash
git add canvas-engine.js tests/canvas-engine.test.js
git commit -m "feat(canvas): vanilla SVG engine — pan/zoom/drag + overlay spotlight"
```

---

### Task 12: Tour runner (`tour-runner.js`)

**Files:**
- Create: `tour-runner.js`
- Test: `tests/tour-runner.test.js` (jsdom)

Drives an engine instance through tour steps via the overlay API; renders a narration card. No relayout, no data mutation.

- [ ] **Step 1: Write the failing test**

```js
// tests/tour-runner.test.js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { startTour } from '../tour-runner.js';

function fakeEngine() {
  const calls = [];
  return { calls, setSpotlight: (ids) => calls.push(ids), clearSpotlight: () => calls.push('clear') };
}
const steps = [
  { order: 1, nodeIds: ['a'], title: 'A', blurb: 'first' },
  { order: 2, nodeIds: ['b'], title: 'B', blurb: 'second' },
];

describe('startTour', () => {
  let host;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });

  it('spotlights step 1 and shows its narration', () => {
    const eng = fakeEngine();
    startTour({ host, engine: eng, steps, autoplay: false });
    expect(eng.calls[0]).toEqual(['a']);
    expect(host.textContent).toContain('first');
    expect(host.textContent).toContain('1');
  });

  it('next() advances the spotlight and narration', () => {
    const eng = fakeEngine();
    const t = startTour({ host, engine: eng, steps, autoplay: false });
    t.next();
    expect(eng.calls.at(-1)).toEqual(['b']);
    expect(host.textContent).toContain('second');
  });

  it('exit() clears the spotlight and removes the card', () => {
    const eng = fakeEngine();
    const t = startTour({ host, engine: eng, steps, autoplay: false });
    t.exit();
    expect(eng.calls.at(-1)).toBe('clear');
    expect(host.querySelector('.rl-tour-card')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tour-runner.test.js`
Expected: FAIL — cannot resolve `../tour-runner.js`.

- [ ] **Step 3: Implement**

```js
// tour-runner.js
// Drive a canvas engine through tour steps. Overlay only — no relayout, no data mutation.

/**
 * @param {{host:HTMLElement, engine:{setSpotlight,clearSpotlight}, steps:object[], autoplay?:boolean}} args
 * @returns {{ next, prev, go, exit }}
 */
export function startTour({ host, engine, steps, autoplay = false }) {
  let i = 0;
  const card = document.createElement('div');
  card.className = 'rl-tour-card';
  host.appendChild(card);

  const reduced = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer = null;

  function render() {
    const s = steps[i];
    engine.setSpotlight(s.nodeIds);
    card.innerHTML = '';
    const step = document.createElement('div'); step.className = 'rl-tour-step';
    step.textContent = `Step ${s.order} of ${steps.length}`;
    const title = document.createElement('div'); title.className = 'rl-tour-title'; title.textContent = s.title;
    const blurb = document.createElement('p'); blurb.className = 'rl-tour-blurb'; blurb.textContent = s.blurb;
    const ctl = document.createElement('div'); ctl.className = 'rl-tour-ctl';
    const back = document.createElement('button'); back.textContent = '← Back'; back.disabled = i === 0; back.onclick = prev;
    const fwd = document.createElement('button'); fwd.textContent = i === steps.length - 1 ? 'Done' : 'Next →'; fwd.onclick = () => (i === steps.length - 1 ? exit() : next());
    ctl.append(back, fwd);
    card.append(step, title, blurb, ctl);
    if (s.lesson) { const l = document.createElement('div'); l.className = 'rl-tour-lesson'; l.textContent = s.lesson; card.insertBefore(l, ctl); }
    if (autoplay && !reduced) { clearTimeout(timer); timer = setTimeout(() => (i < steps.length - 1 ? next() : exit()), 6000); }
  }
  function go(n) { i = Math.max(0, Math.min(steps.length - 1, n)); render(); }
  function next() { go(i + 1); }
  function prev() { go(i - 1); }
  function exit() { clearTimeout(timer); engine.clearSpotlight(); card.remove(); }

  const onKey = (ev) => { if (ev.key === 'ArrowRight') next(); else if (ev.key === 'ArrowLeft') prev(); else if (ev.key === 'Escape') exit(); };
  host.addEventListener('keydown', onKey);

  render();
  return { next, prev, go, exit };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tour-runner.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tour-runner.js tests/tour-runner.test.js
git commit -m "feat(canvas): tour-runner — narrated spotlight walkthrough"
```

---

### Task 13: Canvas styles (`themes.css`)

**Files:**
- Modify: `themes.css`

- [ ] **Step 1: Append canvas tokens + classes**

Add at the end of `themes.css` (reuses existing `--dur-*`/`--ease-*`; all motion guarded by reduced-motion like the rest of the file):

```css
/* ── Interactive canvas ── */
.rl-canvas { width: 100%; height: 520px; display: block; background: var(--bg, #fbf6ea); touch-action: none; cursor: grab; }
.rl-canvas:active { cursor: grabbing; }
.rl-node rect { fill: var(--surface, #fffdf6); stroke: var(--text, #211c14); stroke-width: 1.5; }
.rl-node text { font: 600 13px ui-monospace, monospace; fill: var(--text, #211c14); pointer-events: none; }
.rl-node { cursor: grab; }
.rl-node.is-root rect { fill: var(--accent, #c2691c); stroke: #8a480f; }
.rl-node.is-root text { fill: #fff; }
/* colour by atom kind (is-root overrides) */
.rl-kind-entrypoint rect { stroke: #3b6ea5; }
.rl-kind-subsystem rect { stroke: #8a480f; }
.rl-kind-data rect { stroke: #2f7d34; }
.rl-kind-concept rect { stroke-dasharray: 4 3; }
.canvas-legend { display: flex; gap: 12px; padding: 8px 12px; font: 11px ui-monospace, monospace; color: var(--text-sub, #6b5a36); flex-wrap: wrap; }
.canvas-legend .lg { display: inline-flex; align-items: center; gap: 5px; }
.canvas-legend .lg::before { content: ''; width: 11px; height: 11px; border-radius: 3px; border: 1.5px solid; background: var(--surface, #fffdf6); }
.canvas-legend .lg-entrypoint::before { border-color: #3b6ea5; }
.canvas-legend .lg-subsystem::before { border-color: #8a480f; background: var(--accent, #c2691c); }
.canvas-legend .lg-module::before { border-color: var(--text, #211c14); }
.canvas-legend .lg-data::before { border-color: #2f7d34; }
.canvas-legend .lg-concept::before { border-color: var(--text, #211c14); border-style: dashed; }
.canvas-export-bar { display: flex; gap: 8px; padding: 9px 12px; border-top: 1px solid var(--rule, #b9a273); }
.canvas-export-bar button { padding: 5px 11px; border-radius: 7px; font-size: 12px; cursor: pointer; border: 1px solid var(--text, #211c14); background: var(--surface, #fffdf6); }
.rl-node:focus { outline: none; }
.rl-node:focus rect { stroke: var(--accent, #3b6ea5); stroke-width: 2.5; }
.rl-edge { stroke: var(--text, #211c14); stroke-width: 1.7; }
.rl-edge.rl-triggers { stroke: #3b6ea5; stroke-dasharray: 6 4; }
.rl-edge.rl-enables { stroke: #2f7d34; }
@media (prefers-reduced-motion: no-preference) {
  .rl-node { transition: opacity var(--dur, .2s) var(--ease-out, ease); }
}
.rl-node.is-dim { opacity: .3; }
.rl-node.is-spotlight rect { stroke-width: 2.5; filter: drop-shadow(0 0 8px rgba(194,105,28,.5)); }
.rl-tour-card { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); width: min(440px, 90%);
  background: var(--surface, #fffdf6); border: 1px solid var(--rule, #b9a273); border-left: 4px solid var(--accent, #c2691c);
  border-radius: 11px; padding: 13px 15px; box-shadow: 0 8px 22px rgba(33,28,20,.2); }
.rl-tour-step { font: 600 10.5px ui-monospace, monospace; letter-spacing: .1em; text-transform: uppercase; color: var(--accent, #c2691c); }
.rl-tour-title { font-size: 15px; font-weight: 800; margin: 5px 0; color: var(--text, #211c14); }
.rl-tour-blurb { font-size: 12.5px; line-height: 1.5; color: var(--text-sub, #4a4034); margin: 0; }
.rl-tour-ctl { display: flex; gap: 8px; margin-top: 11px; }
.rl-tour-ctl button { padding: 5px 11px; border-radius: 7px; font-size: 12px; cursor: pointer; }
```

- [ ] **Step 2: Verify the canvas tab host is positioned**

Confirm the tab content host can position the absolute tour card: in Task 14 the `#t27` inner wrapper gets `position: relative`.

- [ ] **Step 3: Commit**

```bash
git add themes.css
git commit -m "feat(canvas): canvas + tour styles (theme-aware, reduced-motion safe)"
```

---

### Task 14: Wire the Canvas tab (`output-tab.html` + `output-tab.js`)

**Files:**
- Modify: `output-tab.html` (tab button, content host)
- Modify: `output-tab.js` (`TAB_SLUGS`, `renderCanvas`, export bar)

- [ ] **Step 1: Add the tab button + host in `output-tab.html`**

Inside the **Lenses** `.tab-menu-list` (next to Deep Dive, `data-tab="10"`), add:

```html
<button class="tab-btn" data-tab="27">Canvas</button>
```

And alongside the other `.tab-content` divs, add a positioned host:

```html
<div class="tab-content" id="t27"><div class="canvas-host" style="position:relative"></div></div>
```

- [ ] **Step 2: Register the slug + renderer in `output-tab.js`**

At the top, extend imports:

```js
import { buildBlueprintScene } from './blueprint-adapter.js';
import { mountCanvas } from './canvas-engine.js';
import { buildTour } from './tour.js';
import { startTour } from './tour-runner.js';
import { toCanvasSvg, toExcalidraw } from './canvas-export.js';
import { getScene, saveScene } from './store.js';
```

Add `27: 'canvas'` to the `TAB_SLUGS` object.

Add the renderer (call it from the same place other tabs render, e.g. inside the tab-show path or `renderPage`):

```js
async function renderCanvas(d) {
  const hostWrap = document.querySelector('#t27 .canvas-host');
  if (!hostWrap || hostWrap.dataset.mounted === '1') return;     // mount once per page
  const dd = d.deepDive;
  if (!dd || !dd.atoms || !dd.atoms.length) {
    hostWrap.innerHTML = '<div class="dd-cta">Run <b>Deep Dive</b> first — the Blueprint is built from its atoms &amp; lineage.</div>';
    return;
  }
  const sceneId = 'repo:' + (await import('./scene.js')).hashId(d.repoId);
  let scene = await getScene(sceneId);
  if (!scene) {
    scene = buildBlueprintScene({ deepDive: dd, repoId: d.repoId, title: d.repoId, scanAt: d.analyzedAt || null });
    await saveScene(scene);
  }

  hostWrap.dataset.mounted = '1';
  const api = mountCanvas(hostWrap, scene, { onChange: (s) => saveScene(s).catch(() => {}) });

  // export bar
  const bar = document.createElement('div');
  bar.className = 'canvas-export-bar';
  const exSvg = document.createElement('button'); exSvg.textContent = 'SVG'; exSvg.onclick = () => download(`${d.repoId.replace('/', '-')}.svg`, 'image/svg+xml', toCanvasSvg(api.getScene()));
  const exEx = document.createElement('button'); exEx.textContent = '.excalidraw'; exEx.onclick = () => download(`${d.repoId.replace('/', '-')}.excalidraw`, 'application/json', toExcalidraw(api.getScene()));
  const tourBtn = document.createElement('button'); tourBtn.textContent = '▶ Guided Tour';
  tourBtn.onclick = () => startTour({ host: hostWrap, engine: api, steps: buildTour(api.getScene(), { roots: (dd.lineage && dd.lineage.roots) || [] }), autoplay: false });
  bar.append(tourBtn, exEx, exSvg);
  hostWrap.appendChild(bar);

  // color legend (Phase 1 colours by atom kind; layer-based tint is a 1.5 refinement)
  const legend = document.createElement('div');
  legend.className = 'canvas-legend';
  for (const [k, lab] of [['entrypoint', 'Entry'], ['subsystem', 'Core'], ['module', 'Module'], ['data', 'Data'], ['concept', 'Concept']]) {
    const sw = document.createElement('span'); sw.className = `lg lg-${k}`; sw.textContent = lab; legend.appendChild(sw);
  }
  hostWrap.appendChild(legend);
}

function download(filename, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

> Match how existing tabs are dispatched. If there's a `switch`/map on tab index that calls render functions, add `case 27: renderCanvas(lastData); break;`. If tabs render eagerly in `renderPage(d)`, call `renderCanvas(d)` there. Confirm with `grep -n "renderDeepDive\|function show\|renderPage" output-tab.js`. Reuse the existing download helper if one already exists (`grep -n "URL.createObjectURL" output-tab.js`) instead of adding a duplicate.

- [ ] **Step 3: Manual verification (no automated DOM test for the full tab)**

Run the test suite to ensure nothing regressed:
Run: `npx vitest run`
Expected: all suites green (existing + the new canvas suites).

Then load the unpacked extension in Chrome, scan a repo, run **Deep Dive**, open the **Canvas** tab, and confirm: nodes render, drag works and survives a tab switch (persisted), `▶ Guided Tour` spotlights step-by-step, and `.excalidraw` downloads + opens in excalidraw.com.

- [ ] **Step 4: Commit**

```bash
git add output-tab.html output-tab.js
git commit -m "feat(canvas): wire the Canvas tab — Blueprint render, Guided Tour, export"
```

---

### Task 15: Changelog + README note

**Files:**
- Modify: `CHANGELOG.md`, `README.md`

- [ ] **Step 1: Add a changelog entry** under the newest version heading describing the Canvas tab (Blueprint + Guided Tour + `.excalidraw`/SVG export), and add a **Canvas** row to the README's "What you get" table.

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md README.md
git commit -m "docs: changelog + README for the interactive Canvas"
```

---

## Final verification

- [ ] Run the full suite: `npx vitest run` — all green, coverage on new pure modules ≥80%.
- [ ] `node --check` passes on every new/modified `.js`.
- [ ] Manual smoke (Task 14 Step 3) confirmed in Chrome.

## Phase 1.5 / 2 / 3 (out of scope here — see spec §14)

- **1.5:** search-to-focus (BM25 over scene) + Scan-Ledger diff overlay.
- **2:** Corkboard (library-wide scene from `nodes`/`edges` stores, scoped layout, red string).
- **3:** Stack Studio (generative wiring via Combinator plumbing).
