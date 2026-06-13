# Changelog

Every release of RepoLens, newest first. Want the friendly highlights instead of
the full detail? See **[What's new](README.md)** in the README.

This project follows [Semantic Versioning](https://semver.org/) and groups changes
by theme. Dates are when the release landed on `main` — 1.1.0 through 1.5.0 shipped
the same day, as a rapid burst of improvements, so they share a date.

## [1.5.0] — 2026-06-13 · _Sign in with ChatGPT_

### Added

- **Sign in with ChatGPT for OpenAI.** Connect OpenAI without pasting a key —
  RepoLens performs the **same OAuth login the Codex CLI uses**. Click *Sign in
  with ChatGPT*, approve it on OpenAI's page, and RepoLens captures the redirect
  and turns it into a working OpenAI key for you, behind the scenes. This rounds
  out the one-click sign-ins: **Claude** already uses the Claude Code login and
  **Grok** the Grok CLI login, so the three big coding-CLI logins are now all here.
- The OpenAI card shows **Connected (ChatGPT)** when you're signed in this way,
  and **Test function** exercises the real sign-in → key → model path.

### Notes

- **Needs API access on your ChatGPT account.** Turning the sign-in into a usable
  key is OpenAI's own token exchange, which requires your plan to include API
  access. If it doesn't, RepoLens tells you plainly and you can paste an OpenAI
  API key — or use any other provider — instead.
- Still **no spawning of a local `claude` / `codex` binary** — a browser extension
  can't launch a process. What's new is the *OAuth* those CLIs use, not the CLI.
  Your ChatGPT credentials never touch RepoLens; the login happens on OpenAI's site
  and only tokens come back, stored in this browser and never exported.

## [1.4.0] — 2026-06-13 · _Bring any model_

### Added

- **A dozen-plus new model providers**, on top of the five first-class ones
  (Anthropic, Gemini, OpenRouter, Grok, Nous). RepoLens now speaks any
  **OpenAI-compatible** or **Anthropic-compatible** endpoint through one
  data-driven registry: **OpenAI, DeepSeek, Groq, NVIDIA NIM, Kimi (Moonshot
  .ai / .cn / Coding), Zhipu GLM, Aliyun Qwen, Xiaomi MiMo, Volcengine Ark,
  Ollama Cloud, MiniMax (Global / 中国)**, local **Ollama** (no key needed),
  **Azure OpenAI** (resource endpoint + deployment), and a universal **Custom**
  endpoint (OpenAI- or Anthropic-compatible, your URL).
- **Independent per-vendor keys** — each provider stores its own key, so
  switching never loses another's. Keys live only in this browser and are never
  exported with your settings.
- **Per-vendor model pickers** (with a recommended ★) plus a free-form Custom
  model, and an **Advanced endpoint override** for proxies/regional gateways.
- **Provider self-tests** — *Test connection* checks the endpoint answers;
  *Test function* asks the model to follow a tiny instruction.
- Compatible providers also appear in the **per-scan-part router**, and any one
  you connect becomes a valid fallback in the smart chain — so connecting *only*
  (say) DeepSeek or a local Ollama just works.

### Notes

- When you connect a custom AI address, Chrome asks you to approve that site once —
  that's expected. Only secure `http(s)` addresses are accepted.
- Local *CLI* providers (a `claude` / `codex` binary) aren't offered: a browser
  extension is sandboxed and cannot launch a local process. Local **Ollama**
  (an HTTP server) is supported instead.

## [1.3.0] — 2026-06-13 · _Bulk triage_

### Added

- **Bulk multi-select delete in the Library.** A new **Select** toggle in the
  toolbar reveals a checkbox on every card and a selection action bar — pick any
  number of repos (or **Select all** the current filter) and remove them in one
  confirmed action. Each removal clears both the saved library row and its local
  scan cache, exactly like the single-card remove. The default triage view stays
  uncluttered; **Esc** or **Done** leaves selection mode, and changing the
  selection cancels a pending delete confirm.

## [1.2.0] — 2026-06-13 · _Themes that actually theme_

### Added

- **Five new themes** — **Nord** (arctic blue-grey), **Gruvbox** (retro-warm
  amber), **Rosé Pine** (muted rose & iris), **Catppuccin Latte** (soft pastel
  light) and **Solarized Light** (iconic warm cream). Thirteen themes in all,
  balanced across light and dark.

### Fixed

- **Light themes now look right everywhere.** The verdict cards, fact tiles, jump
  buttons, status pills, and badges used to stay dark even on a light theme,
  leaving dark patches bleeding through. They now follow the theme you pick.
- **The Library page follows your theme too.** It used to be stuck dark on every
  theme; it now matches whatever you've chosen.
- **Status colours (green/blue/amber/red) stay readable** on light and dark alike —
  derived from each theme so they never wash out, and any future theme gets them
  for free. _(Under the hood: theme-aware colour tokens via CSS `color-mix`.)_

## [1.1.0] — 2026-06-13 · _Trust & Polish_

The theme is **trust**: your data is portable and safe to move, a malicious repo
can't reach the model unfiltered, provider hiccups recover on their own, and the
whole app is keyboard- and motion-accessible. Plus a sharper search and a few
quality-of-life touches.

### Added

- **Library Export / Import / Backup.** `Library → Export` writes your whole
  library — analyzed repos, the semantic graph, and the local scan cache — to one
  portable JSON file; `Import` restores it in **merge** or **replace** mode on any
  machine. Backups carry a versioned envelope and are **validated and bounded** on
  restore (row caps, malformed rows dropped, oversized files refused), so a bad
  file fails safe instead of corrupting your library.
- **Settings backup.** `Options → Back up your settings` exports your theme,
  voice, model picks and per-part routing. It's **allowlist-driven by
  construction** — API keys, OAuth tokens and refresh secrets are never written to
  the file and are stripped on import even if injected.
- **Library stats bar** — a fit-distribution tally (strong / solid / care / risky)
  and average health across everything you've scanned.
- **"Recently scanned" and "Stars" sorts** for the Library, with your sort choice
  persisted between sessions.
- **Scan-size estimate** on the verdict — an input-token estimate of how much the
  model actually read (`~2.8k tok in`), so cost and context are legible.

### Changed

- **Smarter library search.** Rarer, more specific words now pull the right repos
  to the top, and a match in a repo's category or tags counts for more than a
  passing mention in its summary. _(Powered by the BM25 ranking used by real
  search engines.)_
- **Self-healing provider calls.** Transient failures (network blips, 5xx, rate
  limits) now retry with **exponential backoff** before falling through the
  provider chain; when a scan does fail, the UI surfaces the **single most
  fixable** error (e.g. "add your Anthropic key") instead of the noisiest one.

### Security

- **Hardened against malicious repos.** A repo's README can no longer sneak hidden
  instructions to the AI or inject anything into your results — untrusted text is
  cleaned and clearly fenced off before the model ever sees it, and every screen
  renders text safely. _(Consolidated, injection-safe HTML escaping + README→prompt
  sanitization.)_

### Accessibility

- Visible `:focus-visible` rings and a `prefers-reduced-motion` guard across the
  output and options surfaces.

### Developer experience

- ESLint (flat config) + Prettier + v8 coverage, and a GitHub Actions CI workflow
  that runs the full unit suite on every push and PR. _(The suite has since grown
  to 400+ tests — see the badge in the README for the current count.)_

## 1.0.0 — baseline

- One-click repo → verdict-first briefing (GitHub / GitLab / npm / PyPI).
- Bring-your-own-provider with a smart fallback chain
  (Nous → Gemini → OpenRouter → Grok → Anthropic) and **per-part model routing**.
- Verdict · Deep Dive · Library · Connections · Synergies · Versus · Combinator.
- In-browser IndexedDB library — no backend, no accounts.
- Optional Rust deeper-scan runner for measured facts.
- One-time import from VelesDB (an older self-hosted version of RepoLens).

[1.4.0]: https://github.com/New1Direction/repolens/releases/tag/v1.4.0
[1.3.0]: https://github.com/New1Direction/repolens/releases/tag/v1.3.0
[1.2.0]: https://github.com/New1Direction/repolens/releases/tag/v1.2.0
[1.1.0]: https://github.com/New1Direction/repolens/releases/tag/v1.1.0
