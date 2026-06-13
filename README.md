<div align="center">

# 🔭 RepoLens

### One click turns any repo into a plain-English briefing.

**What it is · whether it's a good fit · how it's actually built · what it connects to.**

![Chrome Manifest V3](https://img.shields.io/badge/Chrome-Manifest_V3-1a73e8?logo=googlechrome&logoColor=white)
![Zero build](https://img.shields.io/badge/build-none-0e1722)
![Vanilla ES modules](https://img.shields.io/badge/vanilla-ES_modules-f7df1e?logo=javascript&logoColor=black)
![Tests](https://img.shields.io/badge/tests-420%2B_passing-4ade80)
![Version](https://img.shields.io/badge/version-1.6.0-7c5cff)
![Storage](https://img.shields.io/badge/storage-in--browser_IndexedDB-38bdf8)

</div>

---

RepoLens is a **Manifest V3 Chrome extension**. Land on a GitHub, GitLab, npm, or PyPI page, click the toolbar icon, and it reads the repo, runs it past the AI provider of your choice, and opens a tab with a **verdict-first** breakdown — it opens with a straight answer (*should you use this?*) before any prose, not the README's marketing.

> Stars tell you a project is popular. They don't tell you whether it fits *your* problem. RepoLens answers the question you actually have: **should I use this, and what am I signing up for?**

---

## What you get

A scan opens to a **verdict landing** and fans out into focused tabs:

| | Tab | What it does |
|---|---|---|
| ⚖️ | **Verdict** | Fit call (strong / solid / care / risky), a one-line bottom line, measured facts, and the top things worth noting — first thing you see. |
| 🧠 | **Deep Dive** | The core concepts → how they build on each other → a plain-English ("explain it like I'm five") walkthrough. Optionally grounded by **measured facts** from the local runner. |
| 📚 | **Library** | Every repo you've analyzed, as a sortable / filterable triage grid with fit chips, a stats bar, **bulk multi-select delete**, and one-click **Export / Import / Backup**. |
| 🕸️ | **Connections** | A walkable map centred on the current repo, showing how it relates to the others you've scanned. |
| 🤝 | **Synergies** · **Versus** · **Combinator** | Complements, head-to-heads, and fused project ideas — grounded in *your* library. |

Plus **SKTPG** (a one-tap State / Known-pitfalls / Trajectory / Proof / Growth read), framework lenses, and capability re-tagging.

---

## 🆕 What's new

Newest first — the highlights. Full, detailed notes live in the **[changelog](CHANGELOG.md)**.

### v1.6.0 — Claude is API-key only

- 🔑 **Removed the Claude *subscription* sign-in.** Anthropic locks Claude Pro/Max tokens to their own Claude Code app and, as of 2026, prohibits subscription sign-in in third-party tools — so that login could never work here without impersonating Claude Code (which risks getting **your** account banned). Connect Claude with a **Console API key** instead.
- 🆓 **Want $0?** Use **local Ollama** (no key) or **Gemini's free tier** — both already supported. See the [How models & sign-in work](website/content/docs/how-it-works.mdx) guide.

### v1.5.0 — Sign in with ChatGPT

- 🔓 **Connect OpenAI without a key** — *Sign in with ChatGPT* uses the **same login the Codex CLI does**: approve it on OpenAI's page and RepoLens handles the rest. Joins Claude (Claude Code login) and Grok (Grok CLI login) — the three big CLI sign-ins are now all here.
- ℹ️ **Needs API access on your ChatGPT plan** to mint the key. If it's not included, RepoLens says so and you can paste an API key instead. Your ChatGPT login stays on OpenAI's site — only tokens come back, and they never leave this browser.

### v1.4.0 — Bring any model

Use almost any AI provider, not just the built-in five.

- ➕ **20+ providers built in** — OpenAI, DeepSeek, Groq, NVIDIA NIM, Kimi, Zhipu GLM, Qwen, MiniMax, Azure OpenAI, and more.
- 🖥️ **Run the AI locally** — use **Ollama** on your own machine, with **no key at all** (only the AI step is local; RepoLens still reads the repo page online).
- 🔌 **Any service** — a **Custom** option connects almost any other AI provider: paste the address it gives you, pick the format, done.
- ✅ **One-click tests** — *Test connection* and *Test function* tell you a provider really works before you rely on it.
- 🔑 Each provider keeps its **own key**, stored only in your browser — switching never loses your other setups.

### v1.3.0 — Bulk cleanup

- 🗂️ **Select multiple repos** in the Library and delete them in one confirmed action (or *Select all*). **Esc** to back out.

### v1.2.0 — 13 themes, done right

- 🎨 **5 new themes** — Nord, Gruvbox, Rosé Pine, Catppuccin Latte, Solarized Light (13 in all).
- 💡 **Light themes fixed** — no more dark patches bleeding through; every theme now reads crisp and clear, light or dark.

### v1.1.0 — Trust & polish

- 💾 **Back up your library** — export everything (repos, connections, history) to one file and import it on any machine.
- 🔐 **Settings backup that never leaks your keys** — your preferences travel; your API keys stay put.
- 🔎 **Smarter search**, 🔁 **auto-retry** when a provider hiccups, and ♿ **accessibility** (focus rings, reduced motion) across the board.

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

Bring your own provider. Five are **first-class** (one-click sign-in where the vendor allows it — **Grok**, **OpenRouter**, and **OpenAI/ChatGPT** — otherwise an API key; **Claude** is API-key only) and fan out across a **smart fallback chain**: RepoLens tries them in order and drops to the next if one errors, so a single key is enough to start.

**Nous** (Nous Research) **→ Gemini → OpenRouter → Grok → Anthropic**

On top of those, RepoLens works with **almost any other AI service** through one registry — **OpenAI, DeepSeek, Groq, NVIDIA NIM, Kimi (Moonshot), Zhipu GLM, Qwen (Aliyun), Xiaomi MiMo, Volcengine Ark, Ollama Cloud, MiniMax, Azure OpenAI**, local **Ollama** (no key needed), and a universal **Custom** endpoint. Each keeps its **own key** (switching never loses data), has a model picker, an optional **endpoint override**, and built-in **connection / function self-tests**. Connect just one and it works — it joins the fallback chain automatically.

> **Sign in with ChatGPT.** The OpenAI card also offers a one-click **ChatGPT login** — the same OAuth the **Codex CLI** uses — so you can connect without pasting a key (it needs API access on your ChatGPT plan; otherwise paste a key).

> Local-only? Point at **Ollama** on `localhost` — no key, no cloud. (Spawning a local *CLI* binary like `claude`/`codex` still isn't possible — a browser extension is sandboxed and can't launch a program — but it can do those CLIs' **OAuth logins**, and talk to a local HTTP model server like Ollama.)

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

First get the code — `git clone` the repo (or download the ZIP and unzip it). Then:

```text
chrome://extensions  →  Developer mode (top-right)  →  Load unpacked  →  select the folder
```

Then click the RepoLens icon on any repo page.

## Develop

> For contributors — if you just want to *use* RepoLens, you're done after **Install** above.

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

For Deep Dive grounded in *measured* facts (real file counts, languages, dependency graph, license, architecture, tests/CI, secret scan), run the companion **Rust** daemon — it downloads a repo's source and analyzes it statically (it never executes repo code). Requires [Rust](https://rustup.rs); from the runner directory:

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
