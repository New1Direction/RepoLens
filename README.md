<div align="center">

# RepoLens

### Click any repo. Get a straight answer on whether to use it.

**The verdict, the evidence, the red flags, and how it's built. In plain English, before the README's pitch.**

![Chrome Manifest V3](https://img.shields.io/badge/Chrome-Manifest_V3-1a73e8?logo=googlechrome&logoColor=white)
![Zero build](https://img.shields.io/badge/build-none-0e1722)
![Vanilla ES modules](https://img.shields.io/badge/vanilla-ES_modules-f7df1e?logo=javascript&logoColor=black)
![Tests](https://img.shields.io/badge/tests-890%2B_passing-2f7d34)
![Version](https://img.shields.io/badge/version-3.1.0-c2691c)
![Storage](https://img.shields.io/badge/storage-in--browser_IndexedDB-38bdf8)

</div>

---

RepoLens is a **Manifest V3 Chrome extension**. Open a GitHub, GitLab, npm, or PyPI page and click the toolbar icon. RepoLens reads the repo, runs it past the AI provider you picked, and opens a tab that leads with a straight answer: should you use this? You see the verdict before any of the README's pitch.

> Stars tell you a project is popular. They don't tell you whether it fits your problem. RepoLens answers the question you have: should I use this, and what am I signing up for?

---

## What you get

A scan opens to a **verdict landing** and fans out into focused tabs:

|     | Tab                                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚖️  | **Verdict**                                 | Fit call (strong / solid / care / risky), a one-line bottom line, measured facts, and the top things worth noting — first thing you see.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 🧠  | **Deep Dive**                               | The core concepts → how they build on each other → a plain-English ("explain it like I'm five") walkthrough. Optionally grounded by **measured facts** from the local runner.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 📚  | **Library**                                 | Every repo you've analyzed, as a sortable / filterable triage grid with fit chips, a stats bar, **bulk multi-select delete**, and one-click **Export / Import / Backup**.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 🗂️  | **Triage & decide**                         | Keyboard-first **Adopt / Trial / Hold / Reject**, a Tech Radar, Boards, fit-delta tracking, notes, and daily **drift alerts** when repos go stale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ★   | **Evaluate & compare**                      | Score repos **1–5** against your own rubric, grade docs **A–F**, and put any **2–10** side-by-side in a decision matrix (CSV / Markdown export).                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 🔍  | **Discover**                                | Search GitHub from inside the extension, or get **recommendations** from the repos you've already adopted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 🕸️  | **Connections**                             | A walkable map centred on the current repo, showing how it relates to the others you've scanned.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 🤝  | **Synergies** · **Versus** · **Combinator** | Complements, head-to-heads, and fused project ideas — grounded in _your_ library.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 🗺️  | **Canvas**                                  | Turn a repo's Deep Dive into an interactive, draggable **Blueprint** — pan/zoom the architecture map, take a narrated **Guided Tour** in dependency order (keyboard-navigable, reduced-motion safe), and export to **.excalidraw** or SVG. Switch the Library into a **Corkboard** to map your whole collection at once: every scanned repo a draggable card, related repos joined by colored string (alternatives, synergies, head-to-heads, combined ideas), colored by fit, filterable by Collection, arrangement saved. And the Tech-Stack Builder renders its wiring on the same canvas as a **Stack Studio**. |

Plus **SKTPG** (a one-tap State / Known-pitfalls / Trajectory / Proof / Growth read), framework lenses, and capability re-tagging.

**First run:** Vee, the lens mascot, walks you through a seeded demo repo (Library, then Verdict, then Blueprint) with a short coachmark tour. After about five real scans, a second power tour shows you the cross-library tools: Ask, Corkboard, multi-select compare, Radar, and Discover.

---

## 🆕 What's new

Newest first — the highlights. Full, detailed notes live in the **[changelog](CHANGELOG.md)**.

### v3.1.0 — Interactive Canvas

- 🗺️ **Blueprint Canvas.** Turn a Deep Dive into a draggable, pannable architecture map with dependency-order Guided Tour.
- 🧵 **Corkboard.** Switch the Library into a saved red-string board of scanned repos and their relationships.
- 🧱 **Stack Studio.** Render Tech-Stack Builder outputs as a living wiring diagram with gaps and integrations.
- 📤 **Exports.** Save canvas views as `.excalidraw` or SVG, with arrangements preserved in backups.

### v3.0.1 — Audit hardening

A correctness, security, and tooling pass from a full code audit — fixes only, no feature changes.

- 🔒 **Hardened.** Batch-scan output is now HTML-escaped (XSS), the manifest declares an explicit CSP, and the shared escaper covers single quotes too.
- 🐞 **Squashed.** Fixed a "Compare" modal crash, made the daily **stale-repos drift alert** actually fire (it was reading the wrong field), and stopped two loaders from pulsing under reduced-motion.
- ♿ **Contrast.** Faint label text on the light themes now meets WCAG AA.
- 🧰 **Tooling.** Reconciled the version across manifest / package.json, and switched CI to `npm ci` with a blocking lint gate + a dependency audit. 733 tests green.

### v1.7.0 — Boards, Vee & a motion pass

- 🗂️ **Collections ("Boards").** Group the repos you're evaluating together and filter the Library by board — with live counts, per-card membership dots, and a one-click assignment popover. Boards travel in your library export/import.
- **Meet Vee, an optional lens mascot** that reacts to your scans: scanning, wide-open on a strong fit, narrowed on a risky one, resting on an empty library. One theme-aware SVG, reduced-motion safe. Turn it off in **Options → Interface**.
- ✨ **Subtle motion, everywhere it helps** — tactile press states, a staged tab reveal, a verdict health-bar fill, a smoother toast and modal — all respecting reduced-motion.
- 🧭 **Errors that tell you what to do** — a failed scan now offers **Open Settings** (bad key / wrong model) or **Retry** (transient), and the loading copy names the provider it's actually using.

### v1.6.0 — Claude is API-key only

- 🔑 **Removed the Claude _subscription_ sign-in.** Anthropic locks Claude Pro/Max tokens to their own Claude Code app and, as of 2026, prohibits subscription sign-in in third-party tools — so that login could never work here without impersonating Claude Code (which risks getting **your** account banned). Connect Claude with a **Console API key** instead.
- 🆓 **Want $0?** Use **local Ollama** (no key) or **Gemini's free tier** — both already supported. See the [How models & sign-in work](website/content/docs/how-it-works.mdx) guide.

### v1.5.0 — Sign in with ChatGPT

- 🔓 **Connect OpenAI without a key** — _Sign in with ChatGPT_ uses the **same login the Codex CLI does**: approve it on OpenAI's page and RepoLens handles the rest. Joins Claude (Claude Code login) and Grok (Grok CLI login) — the three big CLI sign-ins are now all here.
- ℹ️ **Needs API access on your ChatGPT plan** to mint the key. If it's not included, RepoLens says so and you can paste an API key instead. Your ChatGPT login stays on OpenAI's site — only tokens come back, and they never leave this browser.

### v1.4.0 — Bring any model

Use almost any AI provider, not just the built-in five.

- ➕ **20+ providers built in** — OpenAI, DeepSeek, Groq, NVIDIA NIM, Kimi, Zhipu GLM, Qwen, MiniMax, Azure OpenAI, and more.
- 🖥️ **Run the AI locally** — use **Ollama** on your own machine, with **no key at all** (only the AI step is local; RepoLens still reads the repo page online).
- 🔌 **Any service** — a **Custom** option connects almost any other AI provider: paste the address it gives you, pick the format, done.
- ✅ **One-click tests** — _Test connection_ and _Test function_ tell you a provider really works before you rely on it.
- 🔑 Each provider keeps its **own key**, stored only in your browser — switching never loses your other setups.

### v1.3.0 — Bulk cleanup

- 🗂️ **Select multiple repos** in the Library and delete them in one confirmed action (or _Select all_). **Esc** to back out.

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

Bring your own provider. Five are **first-class** (one-click sign-in where the vendor allows it: **Grok**, **OpenRouter**, and **OpenAI/ChatGPT**; otherwise an API key; **Claude** is API-key only) and fan out across a **smart fallback chain**: RepoLens tries them in order and drops to the next if one errors, so a single key is enough to start.

**Nous** (Nous Research) **→ Gemini → OpenRouter → Grok → Anthropic**

On top of those, RepoLens works with **almost any other AI service** through one registry: **OpenAI, DeepSeek, Groq, NVIDIA NIM, Kimi (Moonshot), Zhipu GLM, Qwen (Aliyun), Xiaomi MiMo, Volcengine Ark, Ollama Cloud, MiniMax, Azure OpenAI**, local **Ollama** (no key needed), and a universal **Custom** endpoint. Each keeps its **own key** (switching never loses data), has a model picker, an optional **endpoint override**, and built-in **connection / function self-tests**. Connect just one and it works. It joins the fallback chain automatically.

> **Sign in with ChatGPT.** The OpenAI card also offers a one-click **ChatGPT login**, the same OAuth the **Codex CLI** uses, so you can connect without pasting a key (it needs API access on your ChatGPT plan; otherwise paste a key).

> Local-only? Point at **Ollama** on `localhost`. No key, no cloud. (Spawning a local _CLI_ binary like `claude`/`codex` still isn't possible: a browser extension is sandboxed and can't launch a program. But it can do those CLIs' **OAuth logins**, and talk to a local HTTP model server like Ollama.)

Each provider has a model dropdown (★ marks the recommended pick), and you can **route each part of a scan to a different model**:

> Core scan → _Claude Opus 4.8_ for the deep judgment. Re-tag → a cheap, fast model. Deep Dive → whatever you like.

Any per-part pick still falls back to the full chain if that provider errors or isn't connected, so nothing can dead-end. Set it all in **Options → More model providers** and **Models per scan part**.

---

## Storage — nothing to install

Your whole library lives **in the browser** (IndexedDB). No database, no daemon, no setup. It works the moment you load the extension, and it's Web-Store-ready.

Because it's _your_ data, you can take it with you: **Library → Export** writes your whole library (analyzed repos, the semantic graph, and the local scan cache) to one portable JSON file, and **Import** restores it (merge or replace) on any machine. Backups are validated and bounded on import, so a bad file fails safe. Your settings travel too: **Options → Back up your settings** exports your theme, voice, model picks and per-part routing, but never your API keys.

Migrating from an old VelesDB server? **Options → Import from VelesDB** pulls your library across in one click.

---

## Install

First get the code — `git clone` the repo (or download the ZIP and unzip it). Then:

```text
chrome://extensions  →  Developer mode (top-right)  →  Load unpacked  →  select the folder
```

Then click the RepoLens icon on any repo page.

## Develop

> For contributors — if you just want to _use_ RepoLens, you're done after **Install** above.

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

For Deep Dive grounded in _measured_ facts (real file counts, languages, dependency graph, license, architecture, tests/CI, secret scan), run the companion **Rust** daemon — it downloads a repo's source and analyzes it statically (it never executes repo code). Requires [Rust](https://rustup.rs); from the runner directory:

```bash
cargo run --release -- serve   # listens on localhost:9191
```

The extension auto-detects it and the Deep Dive pill turns green. Without it, Deep Dive simply falls back to the README.

---

## Layout

| Path                                    | Responsibility                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `background.js`                         | Service worker: scan orchestration, AI provider calls + per-part routing, store writes                                       |
| `output-tab.{js,html}`                  | The result surface — verdict landing + every tab                                                                             |
| `library.{js,html}` · `library-data.js` | The Library home + its pure row/sort/filter helpers                                                                          |
| `store.js` · `store/`                   | In-browser persistence (IndexedDB doc store, client-side search ranker, ego-graph builder)                                   |
| `routing.js` · `models.js`              | Per-part model routing + the provider × model catalog                                                                        |
| `providers.js` · `options-providers.js` | OpenAI/Anthropic-compatible provider registry + the data-driven Settings cards (keys, models, endpoint override, self-tests) |
| `migrate/velesdb-import.js`             | One-time import from a legacy VelesDB server                                                                                 |
| `runner.js`                             | Client for the optional Rust deeper-scan runner                                                                              |
| `backup.js` · `store.js` · `cache.js`   | Library Export / Import / Backup — versioned envelope, validated + bounded on restore                                        |
| `safe-html.js`                          | One canonical HTML escaper + an injection-safe `html\`\``template (replaces the old per-file`esc()` copies)                  |
| `errors.js` · `retry.js`                | Provider-error ranking (surface the one fixable failure) + exponential-backoff retries                                       |
| `tests/`                                | Vitest unit tests for the pure helpers                                                                                       |

---

<div align="center">

_Built for people who read code before they trust it._

</div>
