# Changelog

All notable changes to RepoLens are documented here. This project follows
[Semantic Versioning](https://semver.org/) and groups changes by theme.

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

- Custom/overridden endpoints request their host permission at save time (MV3),
  and only http(s) URLs are accepted.
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

- **Light themes are now fully themed.** The verdict landing (fit cards, fact
  tiles, jump buttons, the deeper-scan runner strip), status pills, confidence /
  evidence tags and badges were authored in hardcoded dark hex and leaked dark
  bubbles onto light themes. They now route through the theme tokens.
- **The Library page honours the active theme.** It previously shipped its own
  hardcoded-dark palette and never loaded `themes.css`, so it stayed dark on
  every theme; it now links the theme stylesheet, initialises the saved theme,
  and maps its colours onto the active palette.
- **Status colours derive per-theme.** New semantic tokens
  (`--ok/--info/--warn/--bad` + `*-ink/-bg/-edge`) compute their surface, text and
  border variants from each theme's own `--surface`/`--text` via `color-mix`, so a
  status colour stays legible on light and dark canvases — and every future theme
  gets correct status styling for free.

## [1.1.0] — 2026-06-13 · _Trust & Polish_

The first release after the de-branding work. The theme is **trust**: your data
is portable and safe to move, untrusted input can't reach the model unfiltered,
provider hiccups recover on their own, and the surfaces are keyboard- and
motion-accessible. Plus a sharper search and a few quality-of-life touches.

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

- **BM25 search ranker.** Library / connection search now ranks with Lucene-style
  BM25 — non-negative IDF (rare terms outrank common ones), per-field weighting
  (category / capabilities / tags carry more signal than a buried `eli5` mention),
  and length normalization. Search input is debounced (180 ms).
- **Self-healing provider calls.** Transient failures (network blips, 5xx, rate
  limits) now retry with **exponential backoff** before falling through the
  provider chain; when a scan does fail, the UI surfaces the **single most
  fixable** error (e.g. "add your Anthropic key") instead of the noisiest one.

### Security

- **One canonical HTML escaper** (`safe-html.js`) with an injection-safe
  `` html`` `` tagged template, replacing six drifting per-file `esc()` copies —
  defense-in-depth against XSS across every render path.
- **README → prompt sanitization.** Repo READMEs are stripped of control
  characters and have known prompt-injection phrasing defanged, then delimited
  inside explicit `BEGIN/END UNTRUSTED README` markers with a do-not-comply
  instruction before reaching the model.

### Accessibility

- Visible `:focus-visible` rings and a `prefers-reduced-motion` guard across the
  output and options surfaces.

### Developer experience

- ESLint (flat config) + Prettier + v8 coverage, and a GitHub Actions CI workflow
  that runs the full unit suite on every push and PR. **360+ tests** across the
  pure helpers.

## [1.0.0] — baseline

- One-click repo → verdict-first briefing (GitHub / GitLab / npm / PyPI).
- Bring-your-own-provider with a smart fallback chain
  (Nous → Gemini → OpenRouter → Grok → Anthropic) and **per-part model routing**.
- Verdict · Deep Dive · Library · Connections · Synergies · Versus · Combinator.
- In-browser IndexedDB library — no backend, no accounts.
- Optional Rust deeper-scan runner for measured facts.
- One-time import from a legacy VelesDB server.

[1.4.0]: https://github.com/New1Direction/repolens/releases/tag/v1.4.0
[1.3.0]: https://github.com/New1Direction/repolens/releases/tag/v1.3.0
[1.2.0]: https://github.com/New1Direction/repolens/releases/tag/v1.2.0
[1.1.0]: https://github.com/New1Direction/repolens/releases/tag/v1.1.0
