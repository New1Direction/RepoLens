<div align="center">

# 🔭 RepoLens

### One click turns any repo into a plain-English briefing.

**What it is · whether it's a good fit · how it's actually built · what it connects to.**

![Chrome Manifest V3](https://img.shields.io/badge/Chrome-Manifest_V3-1a73e8?logo=googlechrome&logoColor=white)
![Zero build](https://img.shields.io/badge/build-none-0e1722)
![Vanilla ES modules](https://img.shields.io/badge/vanilla-ES_modules-f7df1e?logo=javascript&logoColor=black)
![Tests](https://img.shields.io/badge/tests-276_passing-4ade80)
![Storage](https://img.shields.io/badge/storage-in--browser_IndexedDB-38bdf8)

</div>

---

RepoLens is a **Manifest V3 Chrome extension**. Land on a GitHub, GitLab, npm, or PyPI page, click the toolbar icon, and it reads the repo, runs it past the AI provider of your choice, and opens a tab with a **verdict-first** breakdown — not the README's marketing, the actual shape of the thing.

> Stars tell you a project is popular. They don't tell you whether it fits *your* problem. RepoLens answers the question you actually have: **should I use this, and what am I signing up for?**

---

## What you get

A scan opens to a **verdict landing** and fans out into focused tabs:

| | Tab | What it does |
|---|---|---|
| ⚖️ | **Verdict** | Fit call (strong / solid / care / risky), a one-line bottom line, measured facts, and the top things worth noting — first thing you see. |
| 🧠 | **Deep Dive** | Atoms → lineage → a Feynman-style plain-English explanation. Optionally grounded by **measured facts** from the local runner. |
| 📚 | **Library** | Every repo you've analyzed, as a sortable / filterable triage grid with fit chips and "scanned N ago" stamps. |
| 🕸️ | **Connections** | A walkable semantic ego-graph of how your repos relate. |
| 🤝 | **Synergies** · **Versus** · **Combinator** | Complements, head-to-heads, and fused project ideas — grounded in *your* library. |

Plus SKTPG, framework lenses, and capability re-tagging.

---

## How it works

```
toolbar click
   → fetch repo metadata + README (GitHub / GitLab / npm / PyPI)
   → AI provider of your choice (with smart fallback)
   → structured analysis (verdict, pros/cons, health, eli5, …)
   → saved to your in-browser library
   → rendered as a verdict-first tab
```

No accounts. No backend. Your keys, your machine.

---

## Models — your keys, your call

Bring your own provider. RepoLens fans out across a **smart fallback chain** — tries one, drops to the next on any error:

**Nous → Gemini → OpenRouter → Grok → Anthropic**

Each provider has a model dropdown (★ marks the recommended pick), and — new — you can **route each part of a scan to a different model**:

> Core scan → *Claude Opus 4.8* for the deep judgment. Re-tag → a cheap, fast model. Deep Dive → whatever you like.

Any per-part pick still falls back to the full chain if that provider errors or isn't connected, so nothing can dead-end. Set it all in **Options → Models per scan part**.

---

## Storage — nothing to install

Your whole library lives **in the browser** (IndexedDB). No database, no daemon, no setup — it works the moment you load the extension, and it's Web-Store-ready.

Migrating from an old VelesDB server? **Options → Import from VelesDB** pulls your library across in one click.

---

## Install

```text
chrome://extensions  →  Developer mode  →  Load unpacked  →  select this folder
```

Then click the RepoLens icon on any repo page.

## Develop

```bash
npm install      # installs vitest
npm test         # 276 unit tests across the pure helpers
npm run test:watch
```

Pure ES modules, **no build step**.

---

## Optional: the deeper-scan runner

For Deep Dive grounded in *measured* facts (real file counts, languages, dependency graph, license, architecture, tests/CI, secret scan), run the companion **Rust** daemon — it downloads a repo's source and analyzes it statically (it never executes repo code):

```bash
cargo run --release -- serve   # listens on localhost:9191
```

The extension auto-detects it and the Deep Dive pill turns green. Without it, Deep Dive simply falls back to the README.

---

## Layout

| Path | Responsibility |
|------|----------------|
| `background.js` | Service worker: scan orchestration, AI provider calls + per-part routing, store writes |
| `output-tab.{js,html}` | The result surface — verdict landing + every tab |
| `library.{js,html}` · `library-data.js` | The Library home + its pure row/sort/filter helpers |
| `store.js` · `store/` | In-browser persistence (IndexedDB doc store, client-side search ranker, ego-graph builder) |
| `routing.js` · `models.js` | Per-part model routing + the provider × model catalog |
| `migrate/velesdb-import.js` | One-time import from a legacy VelesDB server |
| `runner.js` | Client for the optional Rust deeper-scan runner |
| `tests/` | Vitest unit tests for the pure helpers |

---

<div align="center">

*Built for people who read code before they trust it.*

</div>
