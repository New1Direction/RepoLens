// Library Home — a triage grid over every analyzed repo. Rows merge the saved library
// (IndexedDB) with the local analysis cache (so repos scanned with auto-save off still
// show), and each card manages its repo: click to reopen the saved analysis, hover for
// re-scan / source / remove actions.

import { scrollPoints, deleteRepo, exportStores, importStores, clearLibrary } from './store.js';
import { listCached, removeCached, openCachedAnalysis, importCache, clearCache } from './cache.js';
import { libraryRow, sortRows, filterRows, allCapabilities, relativeTime, sourceUrl, mergeRows, libraryStats } from './library-data.js';
import { buildBackup, validateBackup, summarizeBackup, backupFilename } from './backup.js';
import { html, escapeHtml as esc } from './safe-html.js';
import { initTheme } from './theme.js';

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
const state = { query: '', sort: 'fit', capability: '' };

// Bulk selection: a toolbar toggle reveals per-card checkboxes; the action bar
// removes every checked repo in one go. `selected` holds repoIds (kept even when
// a row is filtered out of view, so the count reflects the true selection).
let selectionMode = false;
const selected = new Set();

function card(r) {
  const owner = r.repoId.includes('/') ? r.repoId.slice(0, r.repoId.indexOf('/')) : '';
  const dots = r.languages
    .map((l) => `<span class="lc-dot" style="background:${langColor(l.name)}" title="${esc(l.name)}"></span>`)
    .join('');
  const tags = r.capabilities.slice(0, 4).map((c) => `<span class="lc-tag">${esc(c)}</span>`).join('');
  const when = relativeTime(r.savedAt);
  const sel = selected.has(r.repoId);
  return `<div class="lib-card${sel ? ' is-selected' : ''}" data-repo="${esc(r.repoId)}" title="${r.hasCache ? 'Open the saved analysis (instant, no AI call)' : 'Open the project page'}">
    <div class="lc-top">
      <input type="checkbox" class="lc-check"${sel ? ' checked' : ''} aria-label="Select ${esc(r.name)} for removal" title="Select for bulk removal">
      <span class="lc-name">${esc(r.name)}</span>
      ${owner ? `<span class="lc-owner">${esc(owner)}</span>` : ''}
      <span class="lc-chip fit-${r.fit.level}">${esc(r.fit.label)}</span>
    </div>
    ${r.blurb ? `<div class="lc-blurb">${esc(r.blurb)}</div>` : ''}
    <div class="lc-meta">
      ${r.health ? `<span class="lc-health">♥ ${r.health}</span>` : ''}
      ${r.category ? `<span class="lc-cat">${esc(r.category)}</span>` : ''}
      ${dots ? `<span class="lc-langs">${dots}</span>` : ''}
      ${when ? `<span class="lc-when" title="Last scanned ${esc(r.savedAt)}">scanned ${esc(when)}</span>` : ''}
    </div>
    ${tags ? `<div class="lc-tags">${tags}</div>` : ''}
    <div class="lc-actions">
      <button class="lc-act" data-act="rescan" title="Run a fresh scan (AI call)">↻ Re-scan</button>
      <button class="lc-act" data-act="source" title="Open the project page">Source ↗</button>
      <button class="lc-act lc-act-del" data-act="remove" title="Remove from library and local history">✕</button>
    </div>
  </div>`;
}

function render() {
  const grid = document.getElementById('grid');
  const rows = sortRows(filterRows(allRows, state), state.sort);
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
    btn.addEventListener('click', () => {
      const repoId = btn.closest('.lib-card').dataset.repo;
      if (btn.dataset.act === 'source') openSource(repoId);
      else if (btn.dataset.act === 'rescan') rescan(repoId);
      else if (btn.dataset.act === 'remove') removeRepo(repoId, btn);
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
  renderCaps();
  render();
  renderStats();
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
  host.innerHTML = String(html`
    <span class="ls-total">${s.total} repo${s.total === 1 ? '' : 's'}</span>
    <span class="ls-pills">${['strong', 'solid', 'care', 'risky', 'unrated'].map((lvl) => pill(lvl, s.byFit[lvl]))}</span>
    ${s.avgHealth != null ? html`<span class="ls-health">avg health ${s.avgHealth}</span>` : ''}
  `);
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
    const backup = buildBackup({ repos: stores.repos, nodes: stores.nodes, edges: stores.edges, cache: cached });
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
  document.getElementById('sel-all')?.addEventListener('click', selectAllToggle);
  document.getElementById('sel-del')?.addEventListener('click', (e) => deleteSelectedFlow(e.currentTarget));
  document.getElementById('sel-done')?.addEventListener('click', () => setSelectionMode(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selectionMode) setSelectionMode(false);
  });
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

// Renders a static, code-owned empty-state string. STATIC ONLY — never pass
// user-influenced data here (it is assigned straight to innerHTML).
function showEmpty(staticHtml) {
  document.getElementById('grid').classList.add('hidden');
  document.getElementById('caps').classList.add('hidden');
  const e = document.getElementById('empty');
  e.classList.remove('hidden');
  e.innerHTML = staticHtml;
}

async function init() {
  document.getElementById('settings')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  wireToolbar(); // before the empty-state return, so Import works on an empty library

  const [points, cachedList, prefs] = await Promise.all([
    scrollPoints(),
    listCached().catch(() => []),
    chrome.storage.local.get('librarySort').catch(() => ({})),
  ]);
  if (prefs?.librarySort) state.sort = prefs.librarySort; // restore the last chosen sort
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
    showEmpty(
      `<h2>No repos yet</h2><p>Open any <b>GitHub / GitLab / npm / PyPI</b> page and click the RepoLens icon —<br>every scan lands here automatically.</p>`
    );
    return;
  }
  renderCaps();
  render();
  renderStats();
  let searchTimer = null;
  document.getElementById('search').addEventListener('input', (e) => {
    state.query = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 180); // debounce: don't re-render the whole grid on every keystroke
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
