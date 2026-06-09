// Library Home — a triage grid over every analyzed repo in VelesDB. Loads the saved payloads,
// derives a fit chip per repo (via library-data → verdict.js), and renders a sortable/filterable grid.

import { scrollPoints } from './store.js';
import { libraryRow, sortRows, filterRows, allCapabilities, relativeTime } from './library-data.js';

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Rust: '#dea584', Go: '#00ADD8',
  Java: '#b07219', Ruby: '#701516', 'C++': '#f34b7d', C: '#555555', 'C#': '#178600', PHP: '#4F5D95',
  Swift: '#F05138', Kotlin: '#A97BFF', Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883', Dart: '#00B4AB',
};
const langColor = (n) => LANG_COLORS[n] || '#64748b';

let allRows = [];
const state = { query: '', sort: 'fit', capability: '' };

const repoUrl = (repoId) =>
  repoId.includes('/') ? `https://github.com/${repoId}` : `https://www.google.com/search?q=${encodeURIComponent(repoId)}`;

function card(r) {
  const owner = r.repoId.includes('/') ? r.repoId.slice(0, r.repoId.indexOf('/')) : '';
  const dots = r.languages
    .map((l) => `<span class="lc-dot" style="background:${langColor(l.name)}" title="${esc(l.name)}"></span>`)
    .join('');
  const tags = r.capabilities.slice(0, 4).map((c) => `<span class="lc-tag">${esc(c)}</span>`).join('');
  const when = relativeTime(r.savedAt);
  return `<div class="lib-card" data-repo="${esc(r.repoId)}">
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
  </div>`;
}

function render() {
  const grid = document.getElementById('grid');
  const rows = sortRows(filterRows(allRows, state), state.sort);
  document.getElementById('count').textContent =
    rows.length === allRows.length ? `${allRows.length} repos` : `${rows.length} of ${allRows.length}`;
  grid.innerHTML = rows.length ? rows.map(card).join('') : '<p style="color:var(--muted);padding:20px 0">No repos match these filters.</p>';
  grid.querySelectorAll('.lib-card').forEach((el) => {
    el.addEventListener('click', () => chrome.tabs.create({ url: repoUrl(el.dataset.repo) }));
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

function showEmpty(html) {
  document.getElementById('grid').classList.add('hidden');
  document.getElementById('caps').classList.add('hidden');
  const e = document.getElementById('empty');
  e.classList.remove('hidden');
  e.innerHTML = html;
}

async function init() {
  const points = await scrollPoints();
  if (!points.length) {
    showEmpty(
      `<h2>No repos to show</h2><p>Nothing's been analyzed yet.<br>Analyze a few repos and they'll appear here.</p>`
    );
    return;
  }
  allRows = points.map((p) => libraryRow(p.payload));
  renderCaps();
  render();
  document.getElementById('search').addEventListener('input', (e) => { state.query = e.target.value; render(); });
  document.getElementById('sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
}

init();
