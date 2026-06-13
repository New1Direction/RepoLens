<div align="center">

# 🔭 RepoLens

### One click turns any repo into a plain-English briefing.

**What it is · whether it's a good fit · how it's actually built · what it connects to.**

![Chrome Manifest V3](https://img.shields.io/badge/Chrome-Manifest_V3-1a73e8?logo=googlechrome&logoColor=white)
![Zero build](https://img.shields.io/badge/build-none-0e1722)
![Vanilla ES modules](https://img.shields.io/badge/vanilla-ES_modules-f7df1e?logo=javascript&logoColor=black)
![Tests](https://img.shields.io/badge/tests-400%2B_passing-4ade80)
![Version](https://img.shields.io/badge/version-1.4.0-7c5cff)
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
| 📚 | **Library** | Every repo you've analyzed, as a sortable / filterable triage grid with fit chips, a stats bar, **bulk multi-select delete**, and one-click **Export / Import / Backup**. |
| 🕸️ | **Connections** | A walkable semantic ego-graph of how your repos relate. |
| 🤝 | **Synergies** · **Versus** · **Combinator** | Complements, head-to-heads, and fused project ideas — grounded in *your* library. |

Plus SKTPG, framework lenses, and capability re-tagging.

---

## What's new

**1.4.0 · Bring any model** — a dozen-plus new providers via one OpenAI-/Anthropic-compatible registry: **OpenAI, DeepSeek, Groq, NVIDIA, Kimi, Zhipu, Qwen, MiniMax, Ollama** (local, no key) and a universal **Custom** endpoint — each with its own key, model picker, endpoint override, and *connection / function* self-tests. Connect just one and it works.

**1.3.0 · Bulk triage** — the Library gets a **Select** mode: check any number of repos (or *Select all*) and remove them in one confirmed action. Esc/Done to leave, and changing the selection cancels a pending delete.

**1.2.0 · Themes that actually theme** — **5 new themes** (Nord, Gruvbox, Rosé Pine, Catppuccin Latte, Solarized Light — 13 in all), and a full fix so **light themes are properly themed**: the verdict landing, Library page and status colours no longer leak dark bubbles onto light palettes. Status colours now derive per-theme via `color-mix`, so every theme stays legible. See [CHANGELOG.md](CHANGELOG.md).

### 1.1.0 · *Trust & Polish*

> The theme is **trust** — your data moves with you and stays safe, untrusted input never reaches the model raw, provider hiccups recover on their own, and the surfaces are keyboard- and motion-accessible. Full notes in [CHANGELOG.md](CHANGELOG.md).

- **📦 Library Export / Import / Backup** — your whole library (repos + semantic graph + scan cache) to one portable JSON file; restore by merge or replace. Validated and bounded on import, so a bad file fails safe.
- **🔑 Settings backup** — theme, voice and model routing travel too, allowlist-driven so **API keys and tokens never leave the browser**.
- **🔎 BM25 search** — rare terms outrank common ones, high-signal fields outweigh buried mentions, results debounced.
- **🛟 Self-healing scans** — transient provider failures retry with exponential backoff; on failure the UI surfaces the *single most fixable* error.
- **🛡️ Hardened rendering** — one canonical injection-safe HTML escaper across every render path; repo READMEs sanitized and delimited before they reach the model.
- **♿ Accessibility** — visible focus rings + `prefers-reduced-motion` guard.
- **📊 Quality of life** — a Library stats bar, "Recently scanned" / "Stars" sorts (persisted), and a scan-size *token estimate* on the verdict.
- **🧪 DX** — ESLint + Prettier + coverage + GitHub Actions CI; **360+ unit tests**.

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

Bring your own provider. Five are **first-class** (OAuth or API key) and fan out across a **smart fallback chain** — tries one, drops to the next on any error:

**Nous → Gemini → OpenRouter → Grok → Anthropic**

On top of those, RepoLens speaks **any OpenAI- or Anthropic-compatible endpoint** through one registry — **OpenAI, DeepSeek, Groq, NVIDIA NIM, Kimi (Moonshot), Zhipu GLM, Qwen, Xiaomi MiMo, Volcengine, Ollama Cloud, MiniMax**, local **Ollama** (no key needed), and a universal **Custom** endpoint. Each keeps its **own key** (switching never loses data), has a model picker, an optional **endpoint override**, and built-in **connection / function self-tests**. Connect just one and it works — it joins the fallback chain automatically.

> Local-only? Point at **Ollama** on `localhost` — no key, no cloud. (A browser extension can't launch a `claude`/`codex` CLI binary, but it can talk to a local HTTP model server.)

Each provider has a model dropdown (★ marks the recommended pick), and you can **route each part of a scan to a different model**:

> Core scan → *Claude Opus 4.8* for the deep judgment. Re-tag → a cheap, fast model. Deep Dive → whatever you like.

Any per-part pick still falls back to the full chain if that provider errors or isn't connected, so nothing can dead-end. Set it all in **Options → More model providers** and **Models per scan part**.

---

## Storage — nothing to install

Your whole library lives **in the browser** (IndexedDB). No database, no daemon, no setup — it works the moment you load the extension, and it's Web-Store-ready.

Because it's *your* data, you can take it with you: **Library → Export** writes your whole library — analyzed repos, the semantic graph, and the local scan cache — to one portable JSON file, and **Import** restores it (merge or replace) on any machine. Backups are validated and bounded on import, so a bad file fails safe. Your settings travel too: **Options → Back up your settings** exports your theme, voice, model picks and per-part routing — never your API keys.

Migrating from an old VelesDB server? **Options → Import from VelesDB** pulls your library across in one click.

---

## Install

```text
chrome://extensions  →  Developer mode  →  Load unpacked  →  select this folder
```

Then click the RepoLens icon on any repo page.

## Develop

```bash
npm install            # installs vitest + lint/format tooling
npm test               # unit tests across the pure helpers
npm run test:watch
npm run test:coverage  # v8 coverage for the pure modules
npm run lint           # eslint (flat config)
npm run format:check   # prettier
```

CI (`.github/workflows/ci.yml`) runs the suite on every push and PR. Pure ES modules, **no build step**.

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
| `providers.js` · `options-providers.js` | OpenAI/Anthropic-compatible provider registry + the data-driven Settings cards (keys, models, endpoint override, self-tests) |
| `migrate/velesdb-import.js` | One-time import from a legacy VelesDB server |
| `runner.js` | Client for the optional Rust deeper-scan runner |
| `backup.js` · `store.js` · `cache.js` | Library Export / Import / Backup — versioned envelope, validated + bounded on restore |
| `safe-html.js` | One canonical HTML escaper + an injection-safe `html\`\`` template (replaces the old per-file `esc()` copies) |
| `errors.js` · `retry.js` | Provider-error ranking (surface the one fixable failure) + exponential-backoff retries |
| `tests/` | Vitest unit tests for the pure helpers |

---

<div align="center">

*Built for people who read code before they trust it.*

</div>
