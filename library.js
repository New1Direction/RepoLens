// Library Home — a triage grid over every analyzed repo. Rows merge the saved library
// (IndexedDB) with the local analysis cache (so repos scanned with auto-save off still
// show), and each card manages its repo: click to reopen the saved analysis, hover for
// re-scan / source / remove actions.

import { scrollPoints, deleteRepo } from './store.js';
import { listCached, removeCached, openCachedAnalysis } from './cache.js';
import { libraryRow, sortRows, filterRows, allCapabilities, relativeTime, sourceUrl, mergeRows } from './library-data.js';

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Rust: '#dea584', Go: '#00ADD8',
  Java: '#b07219', Ruby: '#701516', 'C++': '#f34b7d', C: '#555555', 'C#': '#178600', PHP: '#4F5D95',
  Swift: '#F05138', Kotlin: '#A97BFF', Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883', Dart: '#00B4AB',
};
const langColor = (n) => LANG_COLORS[n] || '#64748b';

let allRows = [];
let cacheByRepo = new Map(); // repoId → full cached analysis (instant reopen)
const state = { query: '', sort: 'fit', capability: '' };

function card(r) {
  const owner = r.repoId.includes('/') ? r.repoId.slice(0, r.repoId.indexOf('/')) : '';
  const dots = r.languages
    .map((l) => `<span class="lc-dot" style="background:${langColor(l.name)}" title="${esc(l.name)}"></span>`)
    .join('');
  const tags = r.capabilities.slice(0, 4).map((c) => `<span class="lc-tag">${esc(c)}</span>`).join('');
  const when = relativeTime(r.savedAt);
  return `<div class="lib-card" data-repo="${esc(r.repoId)}" title="${r.hasCache ? 'Open the saved analysis (instant, no AI call)' : 'Open the project page'}">
    <div class="lc-top">
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
      openRow(el.dataset.repo);
    });
  });
  grid.querySelectorAll('.lc-act').forEach((btn) => {
    btn.addEventListener('click', () => {
      const repoId = btn.closest('.lib-card').dataset.repo;
      if (btn.dataset.act === 'source') openSource(repoId);
      else if (btn.dataset.act === 'rescan') rescan(repoId);
      else if (btn.dataset.act === 'remove') removeRepo(repoId, btn);
    });
  });
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

function showEmpty(html) {
  document.getElementById('grid').classList.add('hidden');
  document.getElementById('caps').classList.add('hidden');
  const e = document.getElementById('empty');
  e.classList.remove('hidden');
  e.innerHTML = html;
}

async function init() {
  document.getElementById('settings')?.addEventListener('click', () => chrome.runtime.openOptionsPage());

  const [points, cachedList] = await Promise.all([
    scrollPoints(),
    listCached().catch(() => []),
  ]);
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
  document.getElementById('search').addEventListener('input', (e) => { state.query = e.target.value; render(); });
  document.getElementById('sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
}

init();
