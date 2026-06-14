// Library Home — a triage grid over every analyzed repo. Rows merge the saved library
// (IndexedDB) with the local analysis cache (so repos scanned with auto-save off still
// show), and each card manages its repo: click to reopen the saved analysis, hover for
// re-scan / source / remove actions.

import { scrollPoints, deleteRepo, exportStores, importStores, clearLibrary, listCollections, saveCollection, deleteCollection, listDecisions } from './store.js';
import { rankRepos } from './store/search.js';
import { DECISION_META } from './decision-log.js';
import { makeCollection, validateCollectionName, addRepoToCollection, toggleRepoInCollection, collectionContains, sortedCollections, repoCollections, removeRepoFromCollection, nextColor, COLLECTION_COLORS } from './collections.js';
import { listCached, removeCached, openCachedAnalysis, importCache, clearCache } from './cache.js';
import { libraryRow, sortRows, filterRows, allCapabilities, relativeTime, sourceUrl, mergeRows, libraryStats } from './library-data.js';
import { buildBackup, validateBackup, summarizeBackup, backupFilename } from './backup.js';
import { html, escapeHtml as esc } from './safe-html.js';
import { initTheme } from './theme.js';
import { veeSvg } from './mascot.js';
import { initPalette } from './palette.js';

// Honour the user's chosen theme on this standalone page (sets <html data-theme>).
initTheme();

const MAX_BACKUP_BYTES = 50 * 1024 * 1024; // refuse absurd import files before parsing

const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Rust: '#dea584', Go: '#00ADD8',
  Java: '#b07219', Ruby: '#701516', 'C++': '#f34b7d', C: '#555555', 'C#': '#178600', PHP: '#4F5D95',
  Swift: '#F05138', Kotlin: '#A97BFF', Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883', Dart: '#00B4AB',
};
const langColor = (n) => LANG_COLORS[n] || '#64748b';

let allRows = [];
let cacheByRepo = new Map(); // repoId → full cached analysis (instant reopen)
let decisionMap = new Map(); // repoId → decision payload
const state = { query: '', sort: 'fit', capability: '', collection: '', decision: '', view: 'list' };

// Collections ("Boards") — user-curated groups of repos. Loaded once on init,
// kept in memory, and persisted per-change. `collection` in state holds the id of
// the active filter ('' = All).
let collections = [];

// Colors come from a fixed palette, but a hand-crafted imported backup could carry
// anything — validate before it reaches an inline `style` (prevents CSS injection).
const safeColor = (v) => (/^#[0-9a-fA-F]{3,8}$/.test(v) ? v : COLLECTION_COLORS[0]);

// Bulk selection: a toolbar toggle reveals per-card checkboxes; the action bar
// removes every checked repo in one go. `selected` holds repoIds (kept even when
// a row is filtered out of view, so the count reflects the true selection).
let selectionMode = false;
const selected = new Set();

// Compare basket: holds up to 2 repoIds; when full, the compare panel is shown.
const compareSet = new Set();

function card(r) {
  const owner = r.repoId.includes('/') ? r.repoId.slice(0, r.repoId.indexOf('/')) : '';
  const dots = r.languages
    .map((l) => `<span class="lc-dot" style="background:${langColor(l.name)}" title="${esc(l.name)}"></span>`)
    .join('');
  const tags = r.capabilities.slice(0, 4).map((c) => `<span class="lc-tag">${esc(c)}</span>`).join('');
  const when = relativeTime(r.savedAt);
  const sel = selected.has(r.repoId);
  const boards = repoCollections(collections, r.repoId);
  const boardDots = boards.length
    ? `<span class="lc-boards" title="${esc(boards.map((b) => b.name).join(', '))}">${boards
        .slice(0, 5)
        .map((b) => `<span class="lc-board-dot" style="background:${safeColor(b.color)}"></span>`)
        .join('')}</span>`
    : '';
  const dec = decisionMap.get(r.repoId);
  const decBadge = dec
    ? `<span class="lc-decision" data-d="${esc(dec.decision)}" title="Your decision: ${esc(dec.decision)}">${esc(DECISION_META[dec.decision]?.label || dec.decision)}</span>`
    : '';
  return `<div class="lib-card${sel ? ' is-selected' : ''}" data-repo="${esc(r.repoId)}" title="${r.hasCache ? 'Open the saved analysis (instant, no AI call)' : 'Open the project page'}">
    <div class="lc-top">
      <input type="checkbox" class="lc-check"${sel ? ' checked' : ''} aria-label="Select ${esc(r.name)} for removal" title="Select for bulk removal">
      <span class="lc-name">${esc(r.name)}</span>
      ${owner ? `<span class="lc-owner">${esc(owner)}</span>` : ''}
      <span class="lc-chip fit-${r.fit.level}">${esc(r.fit.label)}</span>
      ${decBadge}
    </div>
    ${r.blurb ? `<div class="lc-blurb">${esc(r.blurb)}</div>` : ''}
    <div class="lc-meta">
      ${r.health ? `<span class="lc-health">♥ ${r.health}</span>` : ''}
      ${r.stars >= 1 ? `<span class="lc-stars">${r.stars >= 1000 ? (r.stars / 1000).toFixed(1) + 'k' : r.stars}★</span>` : ''}
      ${r.category ? `<span class="lc-cat">${esc(r.category)}</span>` : ''}
      ${dots ? `<span class="lc-langs">${dots}</span>` : ''}
      ${when ? `<span class="lc-when" title="Last scanned ${esc(r.savedAt)}">scanned ${esc(when)}</span>` : ''}
    </div>
    ${tags || boardDots ? `<div class="lc-tags">${tags}${boardDots}</div>` : ''}
    <div class="lc-actions">
      <button class="lc-act${compareSet.has(r.repoId) ? ' lc-act-cmp-on' : ''}" data-act="compare" title="${compareSet.has(r.repoId) ? 'Remove from compare' : 'Add to compare (pick 2)'}">⇄</button>
      <button class="lc-act" data-act="boards" title="Add to a collection">▦ Boards</button>
      <button class="lc-act" data-act="rescan" title="Run a fresh scan (AI call)">↻ Re-scan</button>
      <button class="lc-act" data-act="source" title="Open the project page">Source ↗</button>
      <button class="lc-act lc-act-del" data-act="remove" title="Remove from library and local history">✕</button>
    </div>
  </div>`;
}

function render() {
  jkIdx = -1;
  const grid = document.getElementById('grid');
  let rows = sortRows(filterRows(allRows, state), state.sort);
  // Collection filter is applied here (not in the pure filterRows) so library-data
  // stays unaware of collections — the membership lives only in this module.
  if (state.collection) {
    const active = collections.find((c) => c.id === state.collection);
    const ids = new Set(active ? active.repoIds : []);
    rows = rows.filter((r) => ids.has(r.repoId));
  }
  // Decision filter: same pattern — decisionMap lives here, not in library-data.
  if (state.decision) {
    rows = rows.filter((r) => decisionMap.get(r.repoId)?.decision === state.decision);
  }
  document.getElementById('count').textContent =
    rows.length === allRows.length ? `${allRows.length} repos` : `${rows.length} of ${allRows.length}`;
  grid.innerHTML = rows.length ? rows.map(card).join('') : '<p style="color:var(--muted);padding:20px 0">No repos match these filters.</p>';
  grid.querySelectorAll('.lib-card').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.lc-act')) return; // action buttons handle themselves
      if (selectionMode) {
        if (e.target.closest('.lc-check')) return; // the checkbox's own change handles it
        toggleSelect(el.dataset.repo, el);
        return;
      }
      openRow(el.dataset.repo);
    });
    const cb = el.querySelector('.lc-check');
    cb?.addEventListener('change', () => toggleSelect(el.dataset.repo, el, cb.checked));
  });
  grid.querySelectorAll('.lc-act').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const repoId = btn.closest('.lib-card').dataset.repo;
      if (btn.dataset.act === 'source') openSource(repoId);
      else if (btn.dataset.act === 'rescan') rescan(repoId);
      else if (btn.dataset.act === 'remove') removeRepo(repoId, btn);
      else if (btn.dataset.act === 'boards') { e.stopPropagation(); openBoardsPopover(repoId, btn); }
      else if (btn.dataset.act === 'compare') { e.stopPropagation(); toggleCompare(repoId); }
    });
  });
  if (selectionMode) updateSelectionBar(); // keep the bar's count / "Select all" label in sync
}

const rowFor = (repoId) => allRows.find((r) => r.repoId === repoId);

function openRow(repoId) {
  const cached = cacheByRepo.get(repoId);
  if (cached) openCachedAnalysis(cached);
  else openSource(repoId);
}

function openSource(repoId) {
  chrome.tabs.create({ url: sourceUrl(rowFor(repoId)?.platform || '', repoId) });
}

async function rescan(repoId) {
  const key = 'repolens_' + crypto.randomUUID();
  try {
    await chrome.runtime.sendMessage({
      type: 'RERUN', sessionKey: key,
      platform: rowFor(repoId)?.platform || 'github', repoId,
    });
  } catch { /* background asleep — the output tab will surface any failure */ }
  chrome.tabs.create({ url: chrome.runtime.getURL(`output-tab.html?key=${key}`) });
}

// Two-step inline confirm: the first click arms the button, the second deletes.
async function removeRepo(repoId, btn) {
  if (!btn.dataset.armed) {
    btn.dataset.armed = '1';
    btn.textContent = 'Remove?';
    setTimeout(() => { btn.dataset.armed = ''; btn.textContent = '✕'; }, 2500);
    return;
  }
  const cached = cacheByRepo.get(repoId);
  if (cached) {
    try { await removeCached(cached.platform, cached.repoId); } catch { /* already gone */ }
  }
  await deleteRepo(repoId); // best-effort; never throws
  cacheByRepo.delete(repoId);
  allRows = allRows.filter((row) => row.repoId !== repoId);
  await pruneRepoFromCollections(repoId); // keep collection membership honest
  renderCaps();
  renderCollections();
  render();
  renderStats();
}

// Drop a now-deleted repo from any collection that referenced it (persisted).
async function pruneRepoFromCollections(repoId) {
  const touched = collections.filter((c) => collectionContains(c, repoId));
  if (!touched.length) return;
  collections = collections.map((c) => removeRepoFromCollection(c, repoId, { now: new Date().toISOString() }));
  for (const c of touched) {
    try { await saveCollection(collections.find((x) => x.id === c.id)); } catch { /* best-effort */ }
  }
}

// ─── bulk multi-select delete ──────────────────────────────────────────────────

// repoIds currently passing the search/capability filter (what "Select all" acts on).
const visibleIds = () => sortRows(filterRows(allRows, state), state.sort).map((r) => r.repoId);

function toggleSelect(repoId, cardEl, force) {
  const next = force === undefined ? !selected.has(repoId) : force;
  if (next) selected.add(repoId);
  else selected.delete(repoId);
  cardEl.classList.toggle('is-selected', next);
  const cb = cardEl.querySelector('.lc-check');
  if (cb) cb.checked = next;
  updateSelectionBar();
}

function updateSelectionBar() {
  const n = selected.size;
  const count = document.getElementById('sel-count');
  if (count) count.textContent = `${n} selected`;
  const del = document.getElementById('sel-del');
  if (del) {
    del.disabled = !n;
    if (delArmed) { delArmed = false; clearTimeout(delTimer); delTimer = null; resetDelBtn(del); } // a changed selection cancels a pending confirm
  }
  const all = document.getElementById('sel-all');
  if (all) {
    const vis = visibleIds();
    const allChosen = vis.length > 0 && vis.every((id) => selected.has(id));
    all.textContent = allChosen ? 'Select none' : 'Select all';
  }
  const stack = document.getElementById('sel-stack');
  if (stack) {
    const ok = n >= 2 && n <= 6;
    stack.disabled = !ok;
    stack.title = ok
      ? `Build a wiring diagram from ${n} repos`
      : n < 2 ? 'Select 2–6 repos to build a stack' : 'Select at most 6 repos';
  }
}

function selectAllToggle() {
  const vis = visibleIds();
  const allChosen = vis.length > 0 && vis.every((id) => selected.has(id));
  vis.forEach((id) => (allChosen ? selected.delete(id) : selected.add(id)));
  render(); // reflect the new checkbox / is-selected state across the grid
  updateSelectionBar();
}

function resetDelBtn(btn) {
  if (!btn) return;
  btn.classList.remove('armed');
  btn.textContent = 'Delete selected';
}

// doRender=false lets a caller (deleteSelected) tear the mode down and then run
// its own single renderCaps→render→renderStats pass, avoiding a stale double render.
function setSelectionMode(on, doRender = true) {
  selectionMode = on;
  document.getElementById('grid')?.classList.toggle('selecting', on);
  document.getElementById('selbar')?.classList.toggle('hidden', !on);
  const btn = document.getElementById('select');
  if (btn) {
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? '☑ Selecting…' : '☑ Select';
  }
  if (!on) {
    selected.clear();
    clearTimeout(delTimer);
    delTimer = null;
    delArmed = false;
    resetDelBtn(document.getElementById('sel-del'));
  }
  if (doRender) {
    render();
    updateSelectionBar();
  }
}

// Two-step inline confirm, mirroring the per-card remove + Clear flows.
let delArmed = false;
let delTimer = null;
function deleteSelectedFlow(btn) {
  if (!selected.size) return;
  if (!delArmed) {
    delArmed = true;
    btn.classList.add('armed');
    btn.textContent = `Delete ${selected.size}? Confirm`;
    delTimer = setTimeout(() => { delArmed = false; resetDelBtn(btn); }, 3000);
    return;
  }
  clearTimeout(delTimer);
  delTimer = null;
  delArmed = false;
  resetDelBtn(btn);
  deleteSelected();
}

async function deleteSelected() {
  const ids = [...selected];
  if (!ids.length) return;
  setStatus(`Removing ${ids.length} repo${ids.length === 1 ? '' : 's'}…`);
  for (const repoId of ids) {
    const cached = cacheByRepo.get(repoId);
    if (cached) {
      try { await removeCached(cached.platform, cached.repoId); } catch { /* already gone */ }
    }
    await deleteRepo(repoId); // best-effort; never throws
    cacheByRepo.delete(repoId);
  }
  const idSet = new Set(ids);
  allRows = allRows.filter((r) => !idSet.has(r.repoId));
  selected.clear();
  if (!allRows.length) { location.reload(); return; } // fall back to the clean empty state
  setSelectionMode(false, false); // tear down the mode; we render once below
  renderCaps();
  render();
  renderStats();
  setStatus(`Removed ${ids.length} repo${ids.length === 1 ? '' : 's'}.`);
}

// ─── stats bar ────────────────────────────────────────────────────────────────

function renderStats() {
  const host = document.getElementById('stats');
  if (!host) return;
  const s = libraryStats(allRows);
  if (!s.total) { host.classList.add('hidden'); host.innerHTML = ''; return; }
  host.classList.remove('hidden');
  const pill = (level, n) => (n ? html`<span class="ls-pill ${level}">${n} ${level}</span>` : '');
  const staleCount = allRows.filter((r) => {
    if (!r.savedAt) return false;
    return (Date.now() - new Date(r.savedAt).getTime()) > 7 * 86_400_000;
  }).length;
  const stalePill = staleCount
    ? html`<button class="ls-stale" id="refresh-stale" title="Queue stale repos for a fresh scan">↻ ${staleCount} stale</button>`
    : '';
  host.innerHTML = String(html`
    <span class="ls-total">${s.total} repo${s.total === 1 ? '' : 's'}</span>
    <span class="ls-pills">${['strong', 'solid', 'care', 'risky', 'unrated'].map((lvl) => pill(lvl, s.byFit[lvl]))}</span>
    ${s.avgHealth != null ? html`<span class="ls-health">avg health ${s.avgHealth}</span>` : ''}
    ${stalePill}
  `);
  document.getElementById('refresh-stale')?.addEventListener('click', refreshStale);
}

async function refreshStale() {
  const stale = allRows.filter((r) => {
    if (!r.savedAt) return false;
    return (Date.now() - new Date(r.savedAt).getTime()) > 7 * 86_400_000;
  });
  if (!stale.length) return;
  const urls = stale.map((r) => sourceUrl(r.platform || '', r.repoId));
  try {
    await chrome.storage.session.set({ repolens_batch_prefill: urls });
  } catch { /* session storage unavailable — open batch anyway */ }
  chrome.tabs.create({ url: chrome.runtime.getURL('batch.html') });
}

// ─── backup: export / import / clear ───────────────────────────────────────────

function setStatus(msg, isErr = false) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
  el.classList.toggle('err', !!isErr);
}

async function exportLibrary() {
  try {
    setStatus('Preparing backup…');
    const [stores, cached] = await Promise.all([exportStores(), listCached().catch(() => [])]);
    const backup = buildBackup({ repos: stores.repos, nodes: stores.nodes, edges: stores.edges, cache: cached, collections: stores.collections });
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFilename(backup.exportedAt);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const c = backup.counts;
    setStatus(`Exported ${c.repos} repo${c.repos === 1 ? '' : 's'}, ${c.cache} cached, ${c.edges} connection${c.edges === 1 ? '' : 's'}.`);
  } catch (e) {
    setStatus('Export failed: ' + (e?.message || e), true);
  }
}

function pickImportFile() {
  document.getElementById('file-input')?.click();
}

async function onFileChosen(e) {
  const file = e.target.files?.[0];
  e.target.value = ''; // let the same file be re-picked later
  if (!file) return;
  if (file.size > MAX_BACKUP_BYTES) {
    setStatus('That backup is too large (max 50 MB).', true);
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    setStatus('That file isn’t valid JSON.', true);
    return;
  }
  const { ok, errors, warnings, value } = validateBackup(parsed);
  if (!ok) {
    setStatus(errors[0] || 'That isn’t a RepoLens backup file.', true);
    return;
  }
  showImportConfirm(value, summarizeBackup(parsed), warnings || []);
}

function showImportConfirm(value, counts, warnings = []) {
  const host = document.getElementById('import-confirm');
  if (!host) return;
  setStatus('');
  host.classList.remove('hidden');
  const warn = warnings.length ? html`<p class="lic-msg" style="color:var(--fit-care)">${warnings[0]}</p>` : '';
  host.innerHTML = String(html`
    ${warn}
    <p class="lic-msg">This backup has <b>${counts.repos}</b> repo${counts.repos === 1 ? '' : 's'}, <b>${counts.cache}</b> cached scan${counts.cache === 1 ? '' : 's'} and <b>${counts.edges}</b> connection${counts.edges === 1 ? '' : 's'}. How should it be applied?</p>
    <div class="lic-actions">
      <button class="lib-btn" id="imp-merge" title="Add these repos to your library, overwriting any with the same id">Merge into my library</button>
      <button class="lib-btn lib-btn-danger" id="imp-replace" title="Wipe the current library and restore only this backup">Replace everything</button>
      <button class="lib-btn" id="imp-cancel">Cancel</button>
    </div>
  `);
  host.querySelector('#imp-merge').addEventListener('click', () => applyImport(value, 'merge'));
  host.querySelector('#imp-replace').addEventListener('click', () => applyImport(value, 'replace'));
  host.querySelector('#imp-cancel').addEventListener('click', () => host.classList.add('hidden'));
}

async function applyImport(value, mode) {
  document.getElementById('import-confirm')?.classList.add('hidden');
  try {
    setStatus(mode === 'replace' ? 'Replacing library…' : 'Merging backup…');
    const written = await importStores(value, { mode });
    const cacheN = await importCache(value.cache, { mode }).catch(() => 0);
    const cachePart = cacheN ? `, ${cacheN} cached scan${cacheN === 1 ? '' : 's'}` : '';
    setStatus(`Imported ${written.repos} repo${written.repos === 1 ? '' : 's'}${cachePart}. Reloading…`);
    setTimeout(() => location.reload(), 700);
  } catch (e) {
    setStatus('Import failed: ' + (e?.message || e), true);
  }
}

// Two-step inline confirm, mirroring the per-card remove arm.
let clearArmed = false;
let clearTimer = null;
async function clearLibraryFlow(btn) {
  if (!clearArmed) {
    clearArmed = true;
    btn.classList.add('armed');
    btn.textContent = '🗑 Confirm?';
    clearTimer = setTimeout(() => {
      clearArmed = false;
      btn.classList.remove('armed');
      btn.textContent = '🗑 Clear';
    }, 3000);
    return;
  }
  clearTimeout(clearTimer);
  clearArmed = false;
  btn.classList.remove('armed');
  btn.textContent = '🗑 Clear';
  try {
    setStatus('Clearing library…');
    await clearLibrary();
    await clearCache().catch(() => {});
    setStatus('Library cleared. Reloading…');
    setTimeout(() => location.reload(), 600);
  } catch (e) {
    setStatus('Clear failed: ' + (e?.message || e), true);
  }
}

function wireToolbar() {
  document.getElementById('export')?.addEventListener('click', exportLibrary);
  document.getElementById('import')?.addEventListener('click', pickImportFile);
  document.getElementById('file-input')?.addEventListener('change', onFileChosen);
  document.getElementById('clear')?.addEventListener('click', (e) => clearLibraryFlow(e.currentTarget));
  document.getElementById('select')?.addEventListener('click', () => setSelectionMode(!selectionMode));
  document.getElementById('digest-json')?.addEventListener('click', () => exportDigest('json'));
  document.getElementById('digest-csv')?.addEventListener('click', () => exportDigest('csv'));
  document.getElementById('auto-organize')?.addEventListener('click', () => autoOrganize());
  document.getElementById('batch-scan-link')?.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('batch.html') }));
  document.getElementById('compare-btn')?.addEventListener('click', () => {
    compareSet.clear();
    updateCompareToolbar();
    renderComparePanel();
    render();
  });
  document.getElementById('sel-all')?.addEventListener('click', selectAllToggle);
  document.getElementById('sel-del')?.addEventListener('click', (e) => deleteSelectedFlow(e.currentTarget));
  document.getElementById('sel-stack')?.addEventListener('click', buildStack);
  document.getElementById('sel-done')?.addEventListener('click', () => setSelectionMode(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selectionMode) setSelectionMode(false);
  });
}

async function buildStack() {
  const repoIds = [...selected];
  if (repoIds.length < 2 || repoIds.length > 6) return;
  const key = 'repolens_' + crypto.randomUUID();
  await chrome.storage.session.set({ [key]: { loading: true, status: 'fetching' } });
  chrome.runtime.sendMessage({ type: 'STACK_BUILD', sessionKey: key, repoIds });
  chrome.tabs.create({ url: chrome.runtime.getURL(`stack-tab.html?key=${key}`) });
  setSelectionMode(false);
}

function renderCaps() {
  const host = document.getElementById('caps');
  host.innerHTML = allCapabilities(allRows).map((c) => `<button class="lib-cap" data-cap="${esc(c)}">${esc(c)}</button>`).join('');
  host.querySelectorAll('.lib-cap').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cap = btn.dataset.cap;
      state.capability = state.capability === cap ? '' : cap;
      host.querySelectorAll('.lib-cap').forEach((b) => b.classList.toggle('on', b.dataset.cap === state.capability));
      render();
    });
  });
}

// ─── Tech Radar view ─────────────────────────────────────────────────────────

const RADAR_ICONS = { adopt: '✅', trial: '🔬', hold: '⏸', reject: '🚫' };

function toggleRadarView() {
  state.view = state.view === 'radar' ? 'list' : 'radar';
  const btn = document.getElementById('lib-btn-radar');
  btn?.classList.toggle('on', state.view === 'radar');
  document.getElementById('radar-panel')?.classList.toggle('hidden', state.view !== 'radar');
  document.getElementById('grid')?.classList.toggle('hidden', state.view === 'radar');
  if (state.view === 'radar') renderRadar(); else render();
}

function renderRadar() {
  const host = document.getElementById('radar-panel');
  if (!host) return;
  const byDecision = { adopt: [], trial: [], hold: [], reject: [] };
  for (const [repoId, dec] of decisionMap.entries()) {
    if (byDecision[dec.decision]) {
      const row = allRows.find((r) => r.repoId === repoId);
      if (row) byDecision[dec.decision].push({ row, note: dec.note });
    }
  }
  const hasAny = Object.values(byDecision).some((arr) => arr.length > 0);
  if (!hasAny) {
    host.innerHTML = '<p class="radar-empty-msg">No decisions recorded yet.<br>Open a repo analysis and use the <strong>Decision Log</strong> on the Verdict tab to record Adopt, Trial, Hold, or Reject.</p>';
    return;
  }
  const cols = ['adopt', 'trial', 'hold', 'reject'].map((key) => {
    const meta = DECISION_META[key];
    const items = byDecision[key];
    const icon = RADAR_ICONS[key];
    const chips = items.length
      ? items.map(({ row }) => {
          const label = row.repoId.includes('/') ? row.repoId.split('/')[1] : row.repoId;
          return `<button class="radar-chip" data-repo="${esc(row.repoId)}" title="${esc(row.repoId)}${row.blurb ? ': ' + esc(row.blurb) : ''}">${esc(label)}</button>`;
        }).join('')
      : `<span class="radar-empty-col">—</span>`;
    return `<div class="radar-col">
      <div class="radar-col-head" style="color:${meta.color};border-bottom-color:${meta.border}">
        <span>${icon}</span> ${esc(meta.label)} <span class="radar-col-n">${items.length}</span>
      </div>
      <div class="radar-chips">${chips}</div>
    </div>`;
  });
  host.innerHTML = `
    <div class="radar-toolbar">
      <button class="lib-btn" id="radar-copy-md" title="Copy Tech Radar as Markdown">⧉ Copy as Markdown</button>
    </div>
    <div class="radar-grid">${cols.join('')}</div>`;
  host.querySelectorAll('.radar-chip').forEach((btn) => {
    btn.addEventListener('click', () => openRow(btn.dataset.repo));
  });
  document.getElementById('radar-copy-md')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const md = radarToMarkdown(byDecision);
    await navigator.clipboard.writeText(md).catch(() => {});
    const orig = btn.textContent;
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1600);
  });
}

function radarToMarkdown(byDecision) {
  const lines = ['# Tech Radar', '_Generated by RepoLens_', ''];
  for (const key of ['adopt', 'trial', 'hold', 'reject']) {
    const meta = DECISION_META[key];
    const icon = RADAR_ICONS[key];
    const items = byDecision[key];
    lines.push(`## ${icon} ${meta.label} (${items.length})`);
    if (!items.length) { lines.push('_None_', ''); continue; }
    lines.push('| Repo | Note |', '|------|------|');
    for (const { row, note } of items) {
      const url = sourceUrl(row.platform || '', row.repoId);
      const link = url ? `[${row.repoId}](${url})` : row.repoId;
      lines.push(`| ${link} | ${note || '—'} |`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

// ─── Decision filter ─────────────────────────────────────────────────────────

function renderDecisionFilter() {
  const host = document.getElementById('decision-filter');
  if (!host) return;
  const counts = { adopt: 0, trial: 0, hold: 0, reject: 0 };
  for (const dec of decisionMap.values()) {
    if (counts[dec.decision] != null) counts[dec.decision]++;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) { host.classList.add('hidden'); host.innerHTML = ''; return; }
  host.classList.remove('hidden');
  const chip = (id, label, n) =>
    `<button class="lib-coll${state.decision === id ? ' on' : ''}" data-dec="${esc(id || '')}">${esc(label)}<span class="coll-n">${n}</span></button>`;
  host.innerHTML = [
    chip('', 'All decisions', total),
    counts.adopt ? chip('adopt', 'Adopt', counts.adopt) : '',
    counts.trial ? chip('trial', 'Trial', counts.trial) : '',
    counts.hold  ? chip('hold',  'Hold',  counts.hold)  : '',
    counts.reject ? chip('reject', 'Reject', counts.reject) : '',
  ].join('');
  host.querySelectorAll('[data-dec]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.decision = btn.dataset.dec;
      renderDecisionFilter();
      render();
    });
  });
}

// ─── Collections ("Boards") ──────────────────────────────────────────────────

// Renders the filter bar: All · each collection (name + count) · + New · Delete.
function renderCollections() {
  const host = document.getElementById('collections');
  if (!host) return;
  const cols = sortedCollections(collections);
  const chip = (id, label, count, color) =>
    `<button class="lib-coll${state.collection === id ? ' on' : ''}" data-coll="${esc(id)}">` +
    `${color ? `<span class="coll-dot" style="background:${safeColor(color)}"></span>` : ''}${esc(label)}` +
    `<span class="coll-n">${count}</span></button>`;
  const chips = [
    chip('', 'All', allRows.length, ''),
    ...cols.map((c) => chip(c.id, c.name, c.repoIds.length, c.color)),
    `<button class="lib-coll lib-coll-new" data-coll-new="1" title="Create a collection">＋ New</button>`,
    state.collection ? `<button class="lib-coll lib-coll-del" data-coll-del="1" title="Delete this collection">Delete collection</button>` : '',
  ].join('');
  host.innerHTML = chips;

  host.querySelectorAll('[data-coll]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.collection = btn.dataset.coll;
      renderCollections();
      render();
    });
  });
  host.querySelector('[data-coll-new]')?.addEventListener('click', () => createCollection());
  host.querySelector('[data-coll-del]')?.addEventListener('click', (e) => confirmDeleteCollection(e.currentTarget));
}

// Create a collection (optionally adding a repo to it straight away).
async function createCollection(addRepoId) {
  const name = window.prompt('Name this collection');
  if (name === null) return null; // cancelled
  const check = validateCollectionName(name, collections);
  if (!check.ok) { setStatus(check.error, true); return null; }
  let col = makeCollection(name, { id: crypto.randomUUID(), color: nextColor(collections.length), now: new Date().toISOString() });
  if (addRepoId) col = addRepoToCollection(col, addRepoId, { now: col.createdAt });
  collections = [...collections, col];
  try { await saveCollection(col); setStatus(`Created “${col.name}”`); }
  catch { setStatus('Could not save the collection.', true); }
  renderCollections();
  render();
  return col;
}

// Two-step inline confirm (matches the repo-delete pattern — no native confirm()).
function confirmDeleteCollection(btn) {
  if (!btn.dataset.armed) {
    btn.dataset.armed = '1';
    btn.textContent = 'Delete — sure?';
    setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = 'Delete collection'; } }, 2500);
    return;
  }
  const id = state.collection;
  collections = collections.filter((c) => c.id !== id);
  deleteCollection(id); // best-effort; never throws
  state.collection = '';
  renderCollections();
  render();
}

// Per-card assignment popover — toggle the repo's membership in each collection.
let openPopover = null;
function closeBoardsPopover() {
  if (!openPopover) return;
  openPopover.remove();
  openPopover = null;
  document.removeEventListener('click', onPopoverDocClick, true);
  document.removeEventListener('keydown', onPopoverKey, true);
}
function onPopoverDocClick(e) { if (openPopover && !openPopover.contains(e.target)) closeBoardsPopover(); }
function onPopoverKey(e) { if (e.key === 'Escape') closeBoardsPopover(); }

function openBoardsPopover(repoId, anchor) {
  closeBoardsPopover();
  const cols = sortedCollections(collections);
  const list = cols.length
    ? cols.map((c) => `<button class="bp-row" data-id="${esc(c.id)}">` +
        `<span class="bp-check">${collectionContains(c, repoId) ? '✓' : ''}</span>` +
        `<span class="coll-dot" style="background:${safeColor(c.color)}"></span>` +
        `<span class="bp-name">${esc(c.name)}</span></button>`).join('')
    : `<div class="bp-empty">No collections yet.</div>`;
  const pop = document.createElement('div');
  pop.className = 'boards-pop';
  pop.innerHTML = list + `<button class="bp-row bp-new" data-new="1">＋ New collection…</button>`;
  document.body.appendChild(pop);

  const r = anchor.getBoundingClientRect();
  const left = Math.min(window.scrollX + r.left, window.scrollX + window.innerWidth - pop.offsetWidth - 12);
  pop.style.top = `${window.scrollY + r.bottom + 6}px`;
  pop.style.left = `${Math.max(window.scrollX + 8, left)}px`;
  openPopover = pop;

  pop.querySelectorAll('.bp-row[data-id]').forEach((b) => {
    b.addEventListener('click', async () => {
      await toggleMembership(b.dataset.id, repoId);
      const col = collections.find((c) => c.id === b.dataset.id);
      b.querySelector('.bp-check').textContent = col && collectionContains(col, repoId) ? '✓' : '';
    });
  });
  pop.querySelector('[data-new]')?.addEventListener('click', async () => {
    closeBoardsPopover();
    await createCollection(repoId);
  });
  // Defer so the click that opened the popover doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener('click', onPopoverDocClick, true);
    document.addEventListener('keydown', onPopoverKey, true);
  }, 0);
}

async function toggleMembership(collectionId, repoId) {
  const idx = collections.findIndex((c) => c.id === collectionId);
  if (idx < 0) return;
  const updated = toggleRepoInCollection(collections[idx], repoId, { now: new Date().toISOString() });
  collections = collections.map((c, i) => (i === idx ? updated : c));
  try { await saveCollection(updated); } catch { setStatus('Could not update the collection.', true); }
  renderCollections(); // counts changed
  render();            // card dots + (if filtering this collection) membership
}

// ─── Compare mode ─────────────────────────────────────────────────────────────

function toggleCompare(repoId) {
  if (compareSet.has(repoId)) {
    compareSet.delete(repoId);
  } else if (compareSet.size < 2) {
    compareSet.add(repoId);
  } else {
    // Swap out the first entry when the basket is full.
    const [first] = compareSet;
    compareSet.delete(first);
    compareSet.add(repoId);
  }
  updateCompareToolbar();
  renderComparePanel();
  render();
}

function updateCompareToolbar() {
  const btn = document.getElementById('compare-btn');
  if (!btn) return;
  const n = compareSet.size;
  btn.classList.toggle('hidden', n === 0);
  btn.classList.toggle('on', n === 2);
  btn.textContent = n === 2 ? '⇄ Comparing 2 ✕' : `⇄ ${n}/2 ✕`;
}

const fmtStars = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));

function comparePanelHtml(a, b) {
  const decA = decisionMap.get(a.repoId);
  const decB = decisionMap.get(b.repoId);
  const capSet = new Set([...a.capabilities, ...b.capabilities]);
  const caps = [...capSet].sort().slice(0, 20);
  const maxHealth = Math.max(a.health, b.health, 1);
  const maxStars = Math.max(a.stars, b.stars, 1);

  const fitChip = (r) => `<span class="lc-chip fit-${r.fit.level}" style="margin:0">${esc(r.fit.label)}</span>`;
  const decChip = (dec) => dec
    ? `<span class="lc-decision" data-d="${esc(dec.decision)}">${esc(DECISION_META[dec.decision]?.label || dec.decision)}</span>`
    : '<span class="cmp-none">—</span>';
  const bar = (v, max) => `<div class="cmp-bar-track"><div class="cmp-bar-fill" style="width:${Math.round((v / max) * 100)}%"></div></div>`;
  const langPips = (r) => r.languages.map((l) => `<span class="lc-dot" style="background:${langColor(l.name)}" title="${esc(l.name)}"></span>`).join('');
  const cell = (v, fallback = '<span class="cmp-none">—</span>') => v || fallback;

  const rows = [
    ['Fit',       fitChip(a),                                         fitChip(b)],
    ['Health',    a.health ? `${a.health}% ${bar(a.health, maxHealth)}` : '', b.health ? `${b.health}% ${bar(b.health, maxHealth)}` : ''],
    ['Stars',     a.stars  ? `${fmtStars(a.stars)} ${bar(a.stars, maxStars)}`  : '', b.stars  ? `${fmtStars(b.stars)} ${bar(b.stars, maxStars)}`  : ''],
    ['Category',  a.category ? esc(a.category) : '',                 b.category ? esc(b.category) : ''],
    ['Languages', langPips(a) || '',                                  langPips(b) || ''],
    ['Decision',  decChip(decA),                                      decChip(decB)],
  ];

  const metaRows = rows.map(([label, va, vb]) =>
    `<div class="cmp-row">
      <div class="cmp-label">${label}</div>
      <div class="cmp-cell lc-langs">${cell(va)}</div>
      <div class="cmp-cell lc-langs">${cell(vb)}</div>
    </div>`
  ).join('');

  const capRows = caps.length
    ? `<div class="cmp-row cmp-caps-header"><div class="cmp-label">Capabilities</div><div class="cmp-cell"></div><div class="cmp-cell"></div></div>` +
      caps.map((cap) =>
        `<div class="cmp-row cmp-cap-row">
          <div class="cmp-label cmp-cap-name">${esc(cap)}</div>
          <div class="cmp-cell ${a.capabilities.includes(cap) ? 'cmp-yes' : 'cmp-no'}">${a.capabilities.includes(cap) ? '✓' : '✗'}</div>
          <div class="cmp-cell ${b.capabilities.includes(cap) ? 'cmp-yes' : 'cmp-no'}">${b.capabilities.includes(cap) ? '✓' : '✗'}</div>
        </div>`
      ).join('')
    : '';

  return `
    <div class="cmp-header">
      <span class="cmp-title">Compare</span>
      <div class="cmp-col-heads">
        <div class="cmp-col-head"><span class="cmp-repo-name">${esc(a.name)}</span><span class="cmp-repo-id">${esc(a.repoId)}</span></div>
        <div class="cmp-col-head"><span class="cmp-repo-name">${esc(b.name)}</span><span class="cmp-repo-id">${esc(b.repoId)}</span></div>
      </div>
      <button class="lib-btn" id="cmp-close" title="Close compare panel">✕</button>
    </div>
    <div class="cmp-body">${metaRows}${capRows}</div>`;
}

function renderComparePanel() {
  const host = document.getElementById('compare-panel');
  if (!host) return;
  if (compareSet.size !== 2) { host.classList.add('hidden'); host.innerHTML = ''; return; }
  const [idA, idB] = [...compareSet];
  const a = allRows.find((r) => r.repoId === idA);
  const b = allRows.find((r) => r.repoId === idB);
  if (!a || !b) { host.classList.add('hidden'); return; }
  host.classList.remove('hidden');
  host.innerHTML = comparePanelHtml(a, b);
  host.querySelector('#cmp-close')?.addEventListener('click', () => {
    compareSet.clear();
    updateCompareToolbar();
    renderComparePanel();
    render();
  });
}

// Renders a static, code-owned empty-state string. STATIC ONLY — never pass
// user-influenced data here (it is assigned straight to innerHTML).
function showEmpty(staticHtml) {
  document.getElementById('grid').classList.add('hidden');
  document.getElementById('caps').classList.add('hidden');
  const e = document.getElementById('empty');
  e.classList.remove('hidden');
  e.innerHTML = staticHtml;
}

// ─── Ask Across My Library ────────────────────────────────────────────────────

function buildAskDocs() {
  return allRows.map((r) => {
    const full = cacheByRepo.get(r.repoId);
    const dec = decisionMap.get(r.repoId);
    return {
      repoId: r.repoId,
      category: r.category || '',
      capabilities: r.capabilities,
      health: r.health || 0,
      description: r.blurb || '',
      eli5: full?.eli5 || r.blurb || '',
      decision: dec?.decision || null,
    };
  });
}

function renderAskResult({ loading = false, answer = '', error = '' } = {}) {
  const host = document.getElementById('ask-answer');
  if (!host) return;
  if (!loading && !answer && !error) { host.classList.add('hidden'); host.innerHTML = ''; return; }
  host.classList.remove('hidden');
  if (loading) {
    host.innerHTML = '<span class="ask-spinner">Asking your library…</span>';
    return;
  }
  if (error) {
    host.innerHTML = `<span class="ask-err">${esc(error)}</span><button class="ask-dismiss" aria-label="Dismiss">✕</button>`;
    host.querySelector('.ask-dismiss')?.addEventListener('click', () => renderAskResult());
    return;
  }
  host.innerHTML = `<div class="ask-text">${esc(answer)}</div><button class="ask-dismiss" aria-label="Dismiss answer">✕</button>`;
  host.querySelector('.ask-dismiss')?.addEventListener('click', () => renderAskResult());
}

async function submitAsk(question) {
  const q = (question || '').trim();
  if (!q) return;

  const allDocs = buildAskDocs();
  if (!allDocs.length) { renderAskResult({ error: 'No repos in your library yet.' }); return; }

  // BM25-rank the docs against the question; fall back to the first 6 if ranking finds nothing.
  const ranked = rankRepos(allDocs, q, { topK: 6 });
  const contextDocs = ranked.length >= 2 ? ranked : allDocs.slice(0, 6);

  const btn = document.getElementById('ask-btn');
  if (btn) btn.disabled = true;
  renderAskResult({ loading: true });

  let resp;
  try {
    resp = await chrome.runtime.sendMessage({ type: 'ASK_LIBRARY', question: q, docs: contextDocs });
  } catch (e) {
    renderAskResult({ error: 'Could not reach the extension. Try again.' });
    if (btn) btn.disabled = false;
    return;
  }

  if (btn) btn.disabled = false;

  if (resp?.ok) {
    renderAskResult({ answer: resp.answer });
  } else {
    renderAskResult({ error: resp?.error || 'Ask failed.' });
  }
}

// ─── Digest export ───────────────────────────────────────────────────────────

function exportDigest(format) {
  if (!allRows.length) return;
  const rows = sortRows(filterRows(allRows, state), state.sort);
  if (format === 'json') {
    const data = rows.map((r) => ({
      repoId: r.repoId,
      fit: r.fit?.level,
      fitLabel: r.fit?.label,
      stars: r.stars ?? null,
      language: r.language ?? null,
      license: r.license ?? null,
      blurb: r.blurb ?? '',
      capabilities: r.capabilities ?? [],
      savedAt: r.savedAt ?? null,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `repolens-digest-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  } else {
    const header = 'repoId,fit,stars,language,license,blurb,savedAt';
    const csvRow = (r) => [
      r.repoId, r.fit?.level ?? '', r.stars ?? '', r.language ?? '', r.license ?? '',
      `"${(r.blurb ?? '').replace(/"/g, '""').slice(0, 200)}"`,
      r.savedAt ? new Date(r.savedAt).toISOString() : '',
    ].join(',');
    const blob = new Blob([[header, ...rows.map(csvRow)].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `repolens-digest-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

// ─── Auto-organize into language collections ──────────────────────────────────

async function autoOrganize() {
  if (!allRows.length) return;
  setStatus('Organizing by language…');

  const byLang = new Map();
  for (const r of allRows) {
    const lang = r.language || (r.languages?.[0]?.name);
    if (!lang) continue;
    if (!byLang.has(lang)) byLang.set(lang, []);
    byLang.get(lang).push(r.repoId);
  }

  let created = 0;
  let updated = 0;
  for (const [lang, repoIds] of byLang) {
    if (repoIds.length < 2) continue; // skip singletons
    let col = collections.find((c) => c.name.toLowerCase() === lang.toLowerCase());
    if (!col) {
      col = makeCollection(lang, nextColor(collections));
      await saveCollection(col);
      collections.push(col);
      created++;
    }
    for (const repoId of repoIds) {
      if (!collectionContains(col, repoId)) {
        col = addRepoToCollection(col, repoId);
        updated++;
      }
    }
    await saveCollection(col);
    const idx = collections.findIndex((c) => c.id === col.id);
    if (idx >= 0) collections[idx] = col;
  }

  renderCollections();
  render();
  setStatus(`Auto-organized: ${created} new group${created !== 1 ? 's' : ''}, ${updated} repo${updated !== 1 ? 's' : ''} assigned.`);
}

// ─── j/k keyboard card navigation ────────────────────────────────────────────

let jkIdx = -1;

function getVisibleCards() {
  return [...document.querySelectorAll('#grid .lib-card')];
}

function setJkFocus(idx) {
  const cards = getVisibleCards();
  if (!cards.length) return;
  jkIdx = Math.max(0, Math.min(idx, cards.length - 1));
  cards.forEach((c, i) => c.classList.toggle('jk-active', i === jkIdx));
  cards[jkIdx]?.scrollIntoView({ block: 'nearest' });
}

document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
  if (e.key === 'j' || e.key === 'k') {
    e.preventDefault();
    const cards = getVisibleCards();
    if (!cards.length) return;
    if (jkIdx === -1) { setJkFocus(0); return; }
    setJkFocus(jkIdx + (e.key === 'j' ? 1 : -1));
  }
  if (e.key === 'Enter' && jkIdx >= 0) {
    const cards = getVisibleCards();
    cards[jkIdx]?.click();
  }
});

// ─── Library palette ─────────────────────────────────────────────────────────

function initLibraryPalette() {
  const commands = [
    { section: 'Filter by decision', name: 'Show: All decisions', action: () => { state.decision = ''; renderDecisionFilter(); render(); } },
    { name: 'Show: Adopt only', action: () => { state.decision = 'adopt'; renderDecisionFilter(); render(); } },
    { name: 'Show: Trial only', action: () => { state.decision = 'trial'; renderDecisionFilter(); render(); } },
    { name: 'Show: Hold only', action: () => { state.decision = 'hold'; renderDecisionFilter(); render(); } },
    { name: 'Show: Rejected only', action: () => { state.decision = 'reject'; renderDecisionFilter(); render(); } },
    { section: 'Sort', name: 'Sort: Best fit', action: () => { state.sort = 'fit'; document.getElementById('sort').value = 'fit'; chrome.storage.local.set({ librarySort: 'fit' }); render(); } },
    { name: 'Sort: Health', action: () => { state.sort = 'health'; document.getElementById('sort').value = 'health'; chrome.storage.local.set({ librarySort: 'health' }); render(); } },
    { name: 'Sort: Recently scanned', action: () => { state.sort = 'recent'; document.getElementById('sort').value = 'recent'; chrome.storage.local.set({ librarySort: 'recent' }); render(); } },
    { name: 'Sort: Stars', action: () => { state.sort = 'stars'; document.getElementById('sort').value = 'stars'; chrome.storage.local.set({ librarySort: 'stars' }); render(); } },
    { name: 'Sort: Name', action: () => { state.sort = 'name'; document.getElementById('sort').value = 'name'; chrome.storage.local.set({ librarySort: 'name' }); render(); } },
    { section: 'View', name: 'Tech Radar', description: 'Organize repos by Adopt/Trial/Hold/Reject decision', action: () => { if (state.view !== 'radar') toggleRadarView(); } },
    { name: 'List view', description: 'Default card grid', action: () => { if (state.view !== 'list') toggleRadarView(); } },
    { section: 'Actions', name: 'Auto-organize by language', description: 'Group repos into language collections', action: () => autoOrganize() },
    { name: 'Batch Scan', description: 'Scan multiple repos at once', action: () => chrome.tabs.create({ url: chrome.runtime.getURL('batch.html') }) },
    { name: 'Export Digest (JSON)', description: 'Download library as JSON', action: () => exportDigest('json') },
    { name: 'Export Digest (CSV)', description: 'Download library as CSV', action: () => exportDigest('csv') },
    { name: 'Export Backup', description: 'Full library backup', action: () => exportLibrary() },
    { name: 'Import Backup', description: 'Restore from a backup file', action: () => pickImportFile() },
    { name: 'Select mode', description: 'Select repos for bulk actions', action: () => setSelectionMode(!selectionMode) },
    { name: 'Open Settings', action: () => chrome.runtime.openOptionsPage() },
  ];
  initPalette(commands);
  document.getElementById('open-palette')?.addEventListener('click', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
  });
}

async function init() {
  document.getElementById('settings')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('lib-btn-radar')?.addEventListener('click', toggleRadarView);
  wireToolbar(); // before the empty-state return, so Import works on an empty library

  const [points, cachedList, prefs, savedCollections, savedDecisions] = await Promise.all([
    scrollPoints(),
    listCached().catch(() => []),
    chrome.storage.local.get(['librarySort', 'mascotEnabled']).catch(() => ({})),
    listCollections().catch(() => []),
    listDecisions().catch(() => []),
  ]);
  decisionMap = new Map(savedDecisions.map((d) => [d.repoId, d]));
  if (prefs?.librarySort) state.sort = prefs.librarySort; // restore the last chosen sort
  const mascotOn = prefs?.mascotEnabled !== false; // default on
  collections = savedCollections;
  cacheByRepo = new Map(cachedList.filter((c) => c && c.repoId).map((c) => [c.repoId, c]));

  // Saved-library rows win (richer capabilities); local cache fills the gaps (repos
  // scanned with auto-save off) and supplies a blurb for older payloads.
  const savedRows = points.map((p) => libraryRow(p.payload));
  const cacheRows = cachedList.filter((c) => c && c.repoId).map((c) => libraryRow(c));
  allRows = mergeRows(savedRows, cacheRows).map((r) => {
    const cached = cacheByRepo.get(r.repoId);
    return { ...r, hasCache: !!cached, blurb: r.blurb || cached?.description || '' };
  });

  const note = document.getElementById('note');
  if (note) {
    const extra = cacheRows.filter((c) => !savedRows.some((s) => s.repoId === c.repoId)).length;
    if (extra) {
      note.classList.remove('hidden');
      note.textContent = `${extra} repo${extra === 1 ? '' : 's'} shown from local scan history (not saved to your library).`;
    }
  }

  if (!allRows.length) {
    // veeSvg() is a static, code-owned string — safe for the STATIC-only showEmpty.
    const vee = mascotOn ? `<div class="vee is-empty" aria-hidden="true" style="margin-bottom:14px">${veeSvg()}</div>` : '';
    showEmpty(
      `${vee}<h2>No repos yet</h2><p>Open any <b>GitHub / GitLab / npm / PyPI</b> page and click the RepoLens icon —<br>every scan lands here automatically.</p>`
    );
    return;
  }
  renderCaps();
  renderCollections();
  renderDecisionFilter();
  render();
  renderStats();
  initLibraryPalette();
  const askInput = document.getElementById('ask-input');
  const askBtn = document.getElementById('ask-btn');
  const doAsk = () => submitAsk(askInput?.value);
  askBtn?.addEventListener('click', doAsk);
  askInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAsk(); });

  const searchEl = document.getElementById('search');
  let searchTimer = null;
  searchEl.addEventListener('input', (e) => {
    state.query = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 180); // debounce: don't re-render the whole grid on every keystroke
  });

  // '/' focuses search; Escape clears it when search is focused.
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    const inInput = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
    if (e.key === '/' && !inInput) {
      e.preventDefault();
      searchEl.focus();
      searchEl.select();
    }
    if (e.key === 'Escape' && document.activeElement === searchEl && searchEl.value) {
      e.preventDefault();
      searchEl.value = '';
      state.query = '';
      render();
      searchEl.blur();
    }
  });
  const sortSel = document.getElementById('sort');
  sortSel.value = state.sort; // reflect the restored preference in the dropdown
  sortSel.addEventListener('change', (e) => {
    state.sort = e.target.value;
    chrome.storage.local.set({ librarySort: state.sort }).catch(() => {});
    render();
  });
}

init();
