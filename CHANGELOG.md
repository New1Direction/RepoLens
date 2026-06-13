# Changelog

All notable changes to RepoLens are documented here. This project follows
[Semantic Versioning](https://semver.org/) and groups changes by theme.

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

[1.1.0]: https://github.com/New1Direction/repolens/releases/tag/v1.1.0
