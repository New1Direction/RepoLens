# Per-Part Model Routing + Model-Picker Polish (Design)

**Date:** 2026-06-09
**Status:** Proposed — awaiting review
**Goal:** Let the user route each of the 8 scan "parts" to a specific provider + model (or leave it on the smart fallback chain), with automatic fallback so nothing can break. Plus polish the provider model dropdowns (accuracy + ★ recommended markers).

---

## 1. The 8 routable parts

| Part id | Feature | Where (background.js) |
|---|---|---|
| `core` | Core scan | `runAnalysis` |
| `deepdive` | Deep Dive (atoms + lineage + feynman — all 3 share one setting) | `runDeepDive` |
| `lens` | Framework Lens | `runFrameworkLens` |
| `sktpg` | SKTPG | `runSktpg` |
| `versus` | Versus | `runVersus` |
| `synergies` | Synergies | `runSynergies` |
| `combinator` | Combinator | `runCombinator` |
| `retag` | Re-tag library | `runTagLibrary` |

---

## 2. Routing model

### 2.1 Config

Stored in `chrome.storage.local` under **`partRouting`**: `{ [partId]: 'default' | '<provider>:<model>' }`.

- `'default'` (or absent) → use the global fallback chain (today's behavior, unchanged).
- `'<provider>:<model>'` → prefer this exact provider+model first. Examples: `anthropic:claude-opus-4-8`, `google:gemini-2.5-pro`, `nous:Hermes-4-405B`, `openrouter:x-ai/grok-4.3`, `xai:grok-4.3`. (Split on the **first** `:` — OpenRouter slugs use `/`, never `:`.)

Provider ids: `nous`, `google`, `openrouter`, `xai`, `anthropic`.

### 2.2 Resolution — the testable core

A new **pure** module `routing.js` exports `buildAttemptPlan({ routing, part, keys })` → an ordered, de-duplicated list of `{ provider, model }` attempts:

1. If `routing[part]` is a `'<provider>:<model>'` **and** that provider is connected → push it **first**.
2. Then append the global chain order `['nous','google','openrouter','xai','anthropic']`, each with its provider's **default model**, skipping any not connected and any exact `{provider,model}` already in the plan.

```js
// routing.js
export const CHAIN = ['nous', 'google', 'openrouter', 'xai', 'anthropic'];

export const DEFAULT_MODELS = {
  nous: 'stepfun/step-3.7-flash',
  google: 'gemini-2.5-flash',
  openrouter: 'x-ai/grok-4.3',
  xai: 'grok-4.3',
  anthropic: 'claude-sonnet-4-6',
};

export function isConnected(provider, keys) {
  switch (provider) {
    case 'nous': return !!keys.nousKey;
    case 'google': return !!keys.googleKey;
    case 'openrouter': return !!keys.openrouterKey;
    case 'xai': return !!(keys.xaiKey || keys.xaiRefresh);
    case 'anthropic': return !!keys.anthropicKey;
    default: return false;
  }
}

export function modelFor(provider, keys) {
  const m = { nous: keys.nousModel, google: keys.googleModel, openrouter: keys.openrouterModel, xai: keys.xaiModel, anthropic: keys.anthropicModel };
  return m[provider] || DEFAULT_MODELS[provider];
}

/** Ordered, de-duped [{provider, model}] to try for this part. Empty if nothing connected. */
export function buildAttemptPlan({ routing = {}, part, keys = {} }) {
  const plan = [];
  const seen = new Set();
  const push = (provider, model) => {
    if (!isConnected(provider, keys)) return;
    const m = model || modelFor(provider, keys);
    const k = `${provider}:${m}`;
    if (seen.has(k)) return;
    seen.add(k);
    plan.push({ provider, model: m });
  };

  const override = part && routing[part];
  if (override && override !== 'default') {
    const i = override.indexOf(':');
    if (i > 0) push(override.slice(0, i), override.slice(i + 1));
  }
  for (const p of CHAIN) push(p, modelFor(p, keys));
  return plan;
}
```

**Key property:** with no routing (or `part` undefined), the plan is exactly the current chain → byte-for-byte the same behavior as today. The override only ever *adds a preferred first try*; the full chain is always the fallback, so a routed part can never be left with no model.

### 2.3 `callAIInner` becomes a plan executor

`callAI(keys, prompt, part)` gains an optional `part`; it threads through the existing throttle wrapper into `callAIInner`, which now:

```js
async function callAIInner(keys, prompt, part) {
  const plan = buildAttemptPlan({ routing: keys.partRouting || {}, part, keys });
  const errors = [];
  for (const { provider, model } of plan) {
    try { return await dispatch(provider, model, keys, prompt); }
    catch (e) { errors.push(`${PROVIDER_LABEL[provider]}: ${e.message}`); }
  }
  throw new Error(errors.length ? errors.join(' · ') : 'No AI provider configured — open Settings to connect one.');
}
```

`dispatch(provider, model, keys, prompt)` maps a provider id to its existing call function:
`nous → callNous(keys.nousKey, model, prompt)`, `google → callGemini(keys.googleKey, model, prompt)`, `openrouter → callOpenRouter(keys.openrouterKey, model, prompt)`, `xai → callXAI(model, prompt)`, `anthropic → callAnthropic(model, prompt)`. The per-provider call functions are **unchanged**.

### 2.4 Call sites pass their part id

Each `run*` adds its part id and loads `partRouting`:
- `runAnalysis` → `callAI(obj, prompt, 'core')` (and `get([...PROVIDER_KEYS, 'autoSave', 'tone', 'partRouting'])`, include `partRouting` in the object passed to callAI).
- `runDeepDive`'s 3 calls → `'deepdive'`; `runFrameworkLens` → `'lens'`; `runSktpg` → `'sktpg'`; `runVersus` → `'versus'`; `runSynergies` → `'synergies'`; `runCombinator` → `'combinator'`; `runTagLibrary` → `'retag'`. Each adds `'partRouting'` to its `chrome.storage.local.get([...])`.

---

## 3. Model catalog + Part-A polish

A new data module **`models.js`** is the single source of truth for the per-part dropdowns and the recommendations:

```js
// models.js
export const PARTS = [
  { id: 'core', label: 'Core scan' },
  { id: 'deepdive', label: 'Deep Dive' },
  { id: 'lens', label: 'Framework Lens' },
  { id: 'sktpg', label: 'SKTPG' },
  { id: 'versus', label: 'Versus' },
  { id: 'synergies', label: 'Synergies' },
  { id: 'combinator', label: 'Combinator' },
  { id: 'retag', label: 'Re-tag library' },
];

// provider id → { label, models: [{ value, label, recommended? }] }
export const CATALOG = {
  anthropic: { label: 'Anthropic', models: [
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', recommended: true },
    { value: 'claude-opus-4-8', label: 'Claude Opus 4.8 — max quality' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — fast' },
  ]},
  google: { label: 'Gemini', models: [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', recommended: true },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — fast' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ]},
  nous: { label: 'Nous', models: [
    { value: 'Hermes-4-405B', label: 'Hermes 4 405B — flagship', recommended: true },
    { value: 'stepfun/step-3.7-flash', label: 'Step 3.7 Flash — free 30d' },
    { value: 'Hermes-4-70B', label: 'Hermes 4 70B — faster' },
  ]},
  openrouter: { label: 'OpenRouter', models: [
    { value: 'x-ai/grok-4.3', label: 'Grok 4.3', recommended: true },
    { value: 'anthropic/claude-opus-4-8', label: 'Claude Opus 4.8' },
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  ]},
  xai: { label: 'xAI Grok', models: [
    { value: 'grok-4.3', label: 'Grok 4.3', recommended: true },
    { value: 'grok-4.20-0309-reasoning', label: 'Grok 4.20 Reasoning' },
  ]},
};
```

**Part-A polish (existing per-provider HTML dropdowns):**
- Update Anthropic **`claude-opus-4-7` → `claude-opus-4-8`** (label "Claude Opus 4.8 — max quality"), and the OpenRouter passthrough `anthropic/claude-opus-4-7 → anthropic/claude-opus-4-8`.
- Add a **★ Recommended** suffix on the recommended option of each per-provider dropdown (matches `CATALOG` `recommended: true`).
- The per-provider dropdowns otherwise stay as-is (incl. their `__custom__` panels). `models.js` and the HTML are kept aligned; a later refactor can generate the HTML from the catalog (out of scope).

---

## 4. Settings UI — "Models per scan part"

A new section in `options.html`, populated by `options.js` from `models.js`:

- One labeled row per `PARTS` entry, each a `<select>`:
  - First option: **"Default (smart fallback)"** value `default`.
  - Then an `<optgroup>` per provider from `CATALOG`, each option value `'<provider>:<model>'`, label `★ Model name` when recommended.
- Load: read `partRouting` from storage, set each select.
- Save: on change (or via the existing Save), write `partRouting` back. A short hint explains that "Default" uses the smart fallback and that any pick still falls back if that provider errors or isn't connected.

---

## 5. Error handling
- A routed provider that isn't connected, or that errors, transparently falls through to the chain — never a dead end.
- If literally nothing is connected, `callAIInner` throws the same "No AI provider configured" message as today.
- Unknown/garbled `partRouting` values are treated as `default` (the `i > 0` parse guard).

---

## 6. Testing
- **`tests/routing.test.js`** (pure): default/absent routing → chain order only; override with connected provider → override first then chain, de-duped; override provider not connected → ignored; override identical to a chain entry → no duplicate; nothing connected → empty plan.
- **`tests/models.test.js`**: every provider in `CATALOG` has exactly one `recommended` model; every `PARTS` id is unique.
- Existing 262 tests stay green; `background.js` covered by `node --check` + the suite.

---

## 7. Out of scope (YAGNI)
- Per-sub-call routing inside Deep Dive (atoms/lineage/feynman share one setting — confirmed).
- Generating the per-provider HTML dropdowns from the catalog (kept hand-aligned for now).
- Per-part *ordered* fallback lists (one preferred pick + the global chain is enough).

---

## 8. Definition of done
- Each of the 8 parts can be pointed at any provider+model or left on Default, from Settings.
- A routed part tries its pick first, then the full chain; no part can be left without a working model.
- No routing configured = identical to current behavior.
- Opus 4.8 + ★ recommended markers live in the provider dropdowns.
- `routing.js`/`models.js` unit-tested; full suite green.
