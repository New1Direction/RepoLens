# Changelog

Every release of RepoLens, newest first. Want the friendly highlights instead of
the full detail? See **[What's new](README.md)** in the README.

This project follows [Semantic Versioning](https://semver.org/) and groups changes
by theme. Dates are when the release landed on `main`. 1.1.0 through 1.6.0 shipped
the same day, as a rapid burst of improvements, so they share a date.

## [Unreleased] — 2026-06-19 · _Actionable Verdict · Theme Pack · Provider Refresh · Stability_

### Added

- **More consistent scan start.** Clicking the extension icon now opens the loading tab immediately, then checks cache/provider setup in parallel, so first-press feedback is instant and cached scans swap in cleanly.
- **More playful scan loading.** The loading screen now has scan stages, live phase labels, rotating signal copy, and a livelier reduced-motion-safe lens animation.
- **Smoother navigation.** Scan tabs now use reduced-motion-safe view transitions, restore per-tab scroll position, avoid quick-verdict re-renders while loading, and make large Library grids cheaper to scroll.
- **Structured scan schema.** Core scans now ask for a mental model, risk register, adoption simulation, and learning path — with parser fallbacks so older scans still render useful structured sections.
- **Decision-grade Verdict tab.** The Verdict view now leads with a best next action, confidence, evidence, and a 30-minute trial plan so every scan tells you what to do next — not just what the repo is.
- **DESIGN.md-inspired theme pack.** Added six more CSS-only themes researched from DESIGN.md catalogs: **Command Blue**, **Aubergine Trace**, **Emerald DB**, **Paperline**, **Toybox Red**, and **Gradient Aurora**.
- **Liquid Glass theme.** Inspired by `liquid-dom`'s liquid-glass direction without adding its WebGPU/React runtime, RepoLens now has a CSS-only **Liquid Glass** theme: translucent surfaces, icy blue highlights, glassy panels, and no new dependency or browser flag.
- **Live first-class model catalogs.** Google Gemini, OpenRouter, and Nous now load their live model lists in **Options** instead of relying on stale hard-coded dropdowns. RepoLens filters those catalogs to text-capable models, preserves a **Custom…** escape hatch, and reuses the live list in **Models per scan part**.
- **Claude sign-in is back, using the Claude Code / Pi OAuth flow.** The Anthropic card now supports **Sign in with Claude** for Claude Pro/Max-style accounts and still supports a Console API key (`sk-ant-api…`). OAuth tokens are stored only in this browser, refreshed automatically, and excluded from settings export.
- **Gemini Ultra-ready picker.** The Google card loads newer Gemini entries when your API key exposes them, while the scan fallback stays on a stable Gemini 2.5 default so a fresh install does not hang on a preview model.
- **Mono Ink identity.** RepoLens ships a new dark-tile lens icon, a "Mono Ink" default theme (cool near-black, white, and cobalt), and a wordmark lockup. The toolbar icon now animates only while a scan runs: the aperture grows and spins and the ring breathes grey to blue, then it resets to static. Turn the animation off in **Options**, and it honors your OS reduced-motion setting. The other themes stay one click away.
- **A warmer Vee.** Vee's onboarding copy reads like a person now. The repo also vendors the stop-slop writing standard under `docs/style/` so the voice stays consistent.
- **Vee-guided first-run walkthrough.** New users are met by Vee on their first Library open; the coachmark steps through a seeded demo repo (Library card → Verdict tab → Blueprint canvas) with plain narration and a spotlight on each target element. Implemented in `onboarding.js` / `coachmark.js`; copy lives in `onboarding-copy.js`.
- **Milestone "power tour"** offered after approximately five real scans: a second coachmark sequence introducing the cross-library tools: Ask, Corkboard (Alternatives / Synergies), multi-select Compare, Radar / auto-organize, and Discover.

### Changed

- **Model IDs are canonicalized before calls.** Legacy saved values such as `Hermes-4-405B`, `anthropic/claude-opus-4-8`, or Google `models/...` IDs are normalized to the IDs the provider APIs expect.
- **Provider docs and settings copy now match reality.** Claude can use OAuth or a key, Gemini model options come from your key, and OpenRouter/Nous names reflect their `/models` catalogs.

### Fixed

- **Stuck scan recovery.** Output tabs now keep the MV3 service worker warm while a scan is loading, repository metadata fetches have a 20s timeout, and output pages render a timeout/retry state instead of spinning forever if the background scan stops responding.
- **Library load/save hangs after updates.** IndexedDB connections now close on version upgrades and blocked opens reject instead of hanging forever, so stale RepoLens tabs can no longer leave the Library blank or a scan stuck on “Saving…”.

---

## [3.1.0] — 2026-06-16 · _Interactive Canvas (Blueprint · Guided Tour · Corkboard · Stack Studio)_

### Added

- **Canvas tab (Blueprint).** A new **Canvas** tab in the Lenses group turns any repo's Deep Dive into an interactive, zoomable, pannable map of the repo's atoms — modules, subsystems, and their lineage — colour-coded by kind with a live node legend. Drag nodes to rearrange; positions persist across sessions.
- **Guided Tour.** Spotlights the architecture node-by-node in dependency order with plain-English narration drawn from the Deep Dive. Navigate with **Back / Next**, auto-play, or keyboard **← → Esc**; fully reduced-motion safe.
- **Export to `.excalidraw` and SVG.** Download the canvas as an `.excalidraw` file (opens hand-drawn in excalidraw.com, Obsidian, or VS Code) or as a clean SVG for docs and slides.
- **Persistent arrangements.** Node positions and canvas state are stored in a new `scenes` IndexedDB store and round-trip through the library backup/export envelope, so layouts travel with your library.
- **Corkboard (Library-wide canvas).** A toggle in the Library page switches your whole collection into a red-string board: every scanned repo is a draggable manila card, and related repos are joined by colored string keyed to relationship type (alternatives, synergies, head-to-heads, combined ideas) and shaded by fit score. Filter by Collection to focus a board, and the arrangement is saved so it's exactly where you left it next session. Reuses the same canvas engine as Blueprint — zero new dependencies, theme-aware, reduced-motion safe.
- **Stack Studio (canvas view of a tech-stack).** The Tech-Stack Builder result gains a **View on canvas** toggle: the repos you wired together render as layer-coloured cards in adoption order, joined by their integrations, with any gaps shown as dashed cards — the same engine, turning "how these fit together" into a living diagram.
- **Zero-build, zero dependencies.** Plain ES modules only — no bundler, no new npm packages. Theme-aware across all themes and reduced-motion safe throughout.

## [3.0.1] — 2026-06-15 · _Audit hardening_

A focused correctness, security, and tooling pass from a full code audit — no
behavioural changes to features, just fixes and guardrails.

### Fixed

- **Batch scanner XSS.** The Batch view rendered provider error messages and the
  URLs you paste straight into the DOM; both are now HTML-escaped like everywhere
  else in the app.
- **"Compare" modal crash.** The multi-repo compare table threw a `ReferenceError`
  on the _Fit delta_ cell whenever a compared repo had a fit change — a constant was
  scoped to the wrong function. Hoisted to one shared definition.
- **Drift alert never fired.** The daily "repos went stale" check read a field
  (`savedAt`) the store never writes (`saved_at`), so the count was always zero. The
  field names now match and stale repos surface again.
- **Reduced-motion leaks.** The Batch and Stack loading dots kept pulsing for users
  who asked for reduced motion; both now honour `prefers-reduced-motion`.
- **Light-theme contrast.** Faint label text on the light themes (paper, cream,
  apple, latte, solarized) now clears WCAG AA.

### Changed

- **One version of the truth.** `package.json` and the manifest now agree (3.0.1),
  resolving the long-standing drift between them.
- **Explicit Content-Security-Policy** in the manifest (matches the MV3 default, now
  auditable).
- **Stronger CI.** Reproducible installs via `npm ci`, lint promoted to a blocking
  gate (it was advisory), and a dependency-audit step added.
- The shared `esc()` helper now escapes single quotes too, matching the canonical
  `safe-html` escaper.

### Notes

- Still 100% client-side — fixes and hardening only, no new permissions and no new
  data collected.

## [1.7.0] — 2026-06-13 · _Boards, Vee, and a motion pass_

### Added

- **Collections ("Boards").** Group the repos you're weighing up together — _"Our 2026
  stack"_, _"Eval: vector DBs"_ — and the Library gains a filter bar (with live counts),
  per-card membership dots, and an assignment popover to add/remove a repo with one click.
  Collections travel in your **Library → Export / Import** like everything else. Backed by
  a new `collections.js` (pure, immutable helpers) and a `collections` IndexedDB store
  added as an **additive v1→v2 upgrade** — existing repos, graph, and cache are untouched.
- **"Vee", a lens mascot** _(optional)_. A small telescope/aperture character that reacts
  to your scans — scanning as it reads, wide open on a **strong** fit, eyes narrowed on a
  **risky** one, thinking during a Deep Dive, resting on an empty Library. One token-aware
  inline SVG that re-skins across every theme; purely decorative (`aria-hidden`) and
  reduced-motion-safe. Turn it off in **Options → Interface** (`mascotEnabled`, on by
  default; it travels with your settings backup).
- **A shared motion vocabulary** (`--dur-*` / `--ease-*` tokens in `themes.css`) and a
  subtle-animation pass across the result tab, Library, and Options: tactile `:active`
  press states on every button / tab / chip / card, a staged tab reveal, a verdict
  health-bar fill, a gentler saved-to-library toast, a fading guide modal, and a capped
  Library grid stagger — all behind `prefers-reduced-motion`.

### Changed

- **Error screens are now actionable.** A failed scan routes its button by what you can
  actually do: a rejected key / unknown model / nothing-connected shows **Open Settings**;
  a transient hiccup shows **Retry**.
- **Loading copy names the provider it's actually using** (e.g. _"Asking Gemini to read
  this…"_) instead of always saying "Claude".

### Notes

- Still 100% client-side: Collections live in your in-browser IndexedDB and round-trip
  through the library backup; no server, no accounts, no telemetry.

## [1.6.0] — 2026-06-13 · _Claude API-key fallback_

> Superseded by the current Unreleased provider refresh: Claude OAuth is available again via the Claude Code / Pi flow, with Console API keys still supported.

### Removed

- **The earlier Claude _subscription_ sign-in ("Sign in with Claude").** That implementation was removed because it did not match the Claude Code flow closely enough to be reliable. Current builds restore Claude sign-in using the same shape Pi uses, while keeping the Console API key path as a fallback.

### Changed

- **Claude gained an explicit Console API key path** (`sk-ant-api…` from
  console.anthropic.com). At the time, the Anthropic card's _Connect_ opened the key field directly and `callAnthropic` used a clean `x-api-key` request with no OAuth/exchange branches.
- Dropped the now-unused `claude.ai`, `platform.claude.com`, and
  `console.anthropic.com` host permissions (kept `api.anthropic.com` for inference).
- Deleted the dead `oauth-anthropic.js` module and its callback interception.

### Notes

- **This does not affect the working sign-ins.** **Grok** (Grok CLI device flow),
  **OpenRouter**, and **OpenAI** (Sign in with ChatGPT, added in 1.5.0) still use
  one-click OAuth — those vendors _support_ third-party OAuth. Anthropic is the one
  that doesn't.
- **Free is still easy:** local **Ollama** (no key) or **Gemini's** free tier.

## [1.5.0] — 2026-06-13 · _Sign in with ChatGPT_

### Added

- **Sign in with ChatGPT for OpenAI.** Connect OpenAI without pasting a key —
  RepoLens performs the **same OAuth login the Codex CLI uses**. Click _Sign in
  with ChatGPT_, approve it on OpenAI's page, and RepoLens captures the redirect
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
  can't launch a process. What's new is the _OAuth_ those CLIs use, not the CLI.
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
- **Provider self-tests** — _Test connection_ checks the endpoint answers;
  _Test function_ asks the model to follow a tiny instruction.
- Compatible providers also appear in the **per-scan-part router**, and any one
  you connect becomes a valid fallback in the smart chain — so connecting _only_
  (say) DeepSeek or a local Ollama just works.

### Notes

- When you connect a custom AI address, Chrome asks you to approve that site once —
  that's expected. Only secure `http(s)` addresses are accepted.
- Local _CLI_ providers (a `claude` / `codex` binary) aren't offered: a browser
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
