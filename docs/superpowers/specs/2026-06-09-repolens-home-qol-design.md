# RepoLens — "Home of Repo Junkies" QoL pass — design spec

**Date:** 2026-06-09
**Goal:** Make RepoLens feel like the only tool you need to understand a repo: every feature
discoverable, every scanned repo manageable, zero clutter.

This spec covers the QoL work as it landed in the repolens repo (IndexedDB-backed via
`store.js`). It was ported from the kp3/extension copy, where the same features were designed
against VelesDB; the differences are noted inline. The four OAuth callback/credential fixes
from the same review shipped separately (`fix(oauth): port 4 callback/credential fixes`).

## 1. Library = the home base (manage scanned repos)

Before: a Library card click opened github.com, there was no delete/re-scan, and the grid
read only from the saved store — repos scanned with auto-save off never appeared.

- **Merged sources.** Rows come from the saved library (IndexedDB `repos` store, via
  `scrollPoints`) *and* the local analysis cache (`rlcache:` keys, via `listCached`), deduped
  by `repoId` (saved rows win; cache fills the gaps). A one-line note reports how many repos
  are shown only from local history (i.e. scanned with auto-save off). Pure `mergeRows`.
- **Click = open the analysis.** A card whose repo has a cached analysis opens it instantly
  in an output tab (no AI call) via the shared `openCachedAnalysis` helper in `cache.js`
  (also used by Options' History). No cache → falls back to the source page.
- **Hover actions, zero resting clutter.** An action row fades in on card hover:
  `↻ Re-scan` (RERUN message → fresh output tab), `Source ↗` (platform-aware:
  github/gitlab/npm/pypi via pure `sourceUrl()`), `✕` remove (two-step inline confirm;
  deletes the local cache entry + the saved row via `store.deleteRepo` →
  `idbDelete('repos', hashRepoId)`, best-effort so a store hiccup never throws).
- **Settings link** (⚙) in the Library header; `store.saveRepo` now persists `description`
  so future cards have a real blurb.

Pure helpers (`mergeRows`, `sourceUrl`, `libraryRow` platform/cachedAt mapping) live in
`library-data.js` with unit tests.

> kp3 difference: kp3's Library talks to a VelesDB server (`scrollPoints(url)`,
> `deleteRepo(url, repoId)` → `DELETE /points/{id}`) and shows a "VelesDB unreachable —
> showing local history" notice. Here both stores are local, so the note instead counts
> rows that exist only in the cache.

## 2. Feature discovery: the `?` Guide (output tab)

One small `?` button in the header export bar (with a pulse dot until first opened —
`guideSeen` flag). Opens a dismissable overlay (click-outside / Esc / `?` key):

1. **Scan anything** — supported sites + instant cache behavior.
2. **The tabs** — one-liners for the core read, Lenses ▾, Library ▾.
3. **Lens cheat-sheet** — generated from `SCAN_EXPLAINERS` (best for · cost); entries added
   for Connections (19) and Combine (20) so their menu tooltips work too.
4. **Your library** — buttons to open Library and Settings.
5. **Keyboard** — ← → cycle tabs · 1–9 jump · ? guide · Esc close.

No new tabs, no banners; discovery costs one small button.

## 3. First-run path (options)

- `chrome.runtime.onInstalled` (fresh install) opens the Settings page.
- Settings gets a **Getting started** strip — 3 steps (connect a provider → click the icon
  on a repo page → read the Verdict, press `?` for the guide). Rendered only while **no**
  provider is connected; disappears once one is.
- Settings header gains an **Open Library →** link.

## 4. Out of scope

- No changes to scan prompts, lens logic, per-part model routing, or the docs website.
- No re-litigation of the OAuth-via-Claude-subscription approach (kept per the user's call).

## 5. Testing

All new logic that can be pure is pure and covered by unit tests in
`tests/library-data.test.js` (mergeRows, sourceUrl, platform/cachedAt row mapping). Full
suite: 284 tests passing. UI wiring follows existing patterns. Run `npm test`.
