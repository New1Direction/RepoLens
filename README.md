# RepoLens

A Manifest V3 Chrome extension that turns any GitHub/GitLab repo page into a deep, plain-English briefing — what it is, whether it's a good fit, how it's built, and how it connects to the rest of your library.

## What it does

- **Verdict-first scan** — opens a tab with a fit verdict (strong / solid / care / risky), a one-line bottom line, measured facts, and the top things worth noting.
- **Deep Dive** — atoms → lineage → Feynman explanation, optionally grounded by measured facts from the local runner.
- **Library** — every repo you've analyzed, as a sortable/filterable triage grid with fit chips and "scanned N ago" stamps.
- **Connections, Synergies, Versus, Combinator** — graph-backed views over your saved library.

Analyses are persisted **in the browser** (IndexedDB) — no server, nothing to install. If you previously used a VelesDB server, the options page has a one-time "Import from VelesDB" action to pull your library across.

## Providers

Bring your own key. The extension fans out across a provider fallback chain (Nous → Gemini → OpenRouter → Grok → Anthropic), with throttling and a configurable delay between calls. Configure keys in the options page.

## Develop

```bash
npm install      # installs vitest
npm test         # run the unit suite (vitest)
npm run test:watch
```

Load unpacked: `chrome://extensions` → **Developer mode** → **Load unpacked** → select this folder.

## Layout

Pure ES modules, no build step. Key files:

- `background.js` — service worker: scan orchestration, AI provider calls, store writes.
- `output-tab.{js,html}` — the result surface (verdict landing + all tabs).
- `library.{js,html}` + `library-data.js` — the Library home and its pure row/sort/filter helpers.
- `store.js` + `store/` — in-browser persistence (IndexedDB doc store, client-side search ranker, ego-graph builder).
- `migrate/velesdb-import.js` — one-time import from a legacy VelesDB server.
- `runner.js` — optional local Rust runner client for measured facts.
- `tests/` — vitest unit tests for the pure helpers.
