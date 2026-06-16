// Library Home — a triage grid over every analyzed repo. Rows merge the saved library
// (IndexedDB) with the local analysis cache (so repos scanned with auto-save off still
// show), and each card manages its repo: click to reopen the saved analysis, hover for
// re-scan / source / remove actions.

import { scrollPoints, deleteRepo, exportStores, importStores, clearLibrary, listCollections, saveCollection, deleteCollection, listDecisions, saveDecision, listAllSnapshots } from './store.js';
import { rankRepos } from './store/search.js';
import { DECISION_META } from './decision-log.js';
import { makeCollection, validateCollectionName, addRepoToCollection, toggleRepoInCollection, collectionContains, sortedCollections, repoCollections, removeRepoFromCollection, nextColor, COLLECTION_COLORS } from './collections.js';
import { listCached, removeCached, openCachedAnalysis, importCache, clearCache } from './cache.js';
import { libraryRow, sortRows, filterRows, allCapabilities, relativeTime, sourceUrl, mergeRows, libraryStats } from './library-data.js';
import { snapshotTrend, sparkline } from './snapshots.js';
import { buildBackup, validateBackup, summarizeBackup, backupFilename } from './backup.js';
import { detectPlatform } from './url-detector.js';
import { html, escapeHtml as esc } from './safe-html.js';
import { initTheme } from './theme.js';
import { veeSvg } from './mascot.js';
import { initPalette } from './palette.js';
import { loadRubric, saveRubric, saveEval, clearEval, listEvals, computeScore, DEFAULT_RUBRIC } from './evaluations.js';
import { applyFilters } from './library-filters.js';

// Honour the user's chosen theme on this standalone page (sets <html data-theme>).
initTheme();

const MAX_BACKUP_BYTES = 50 * 1024 * 1024; // refuse absurd import files before parsing

const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Rust: '#dea584', Go: '#00ADD8',
  Java: '#b07219', Ruby: '#701516', 'C++': '#f34b7d', C: '#555555', 'C#': '#178600', PHP: '#4F5D95',
  Swift: '#F05138', Kotlin: '#A97BFF', Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883', Dart: '#00B4AB',
};
const langColor = (n) => LANG_COLORS[n] || '#64748b';

// Highlight search terms in card text. Returns HTML with <mark> around matches.
// Only used for plain text queries (not NL/AI filter). Safe: escapes all content.
function hilite(text, q) {
  const safe = esc(text);
  if (!q || q.length < 2) return safe;
  try {
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return safe.replace(re, '<mark class="lc-hl">$1</mark>');
  } catch { return safe; }
}

let allRows = [];
let snapsByRepo = new Map(); // repoId → snaps[] (batch-loaded once in init)
let cacheByRepo = new Map(); // repoId → full cached analysis (instant reopen)
let decisionMap = new Map(); // repoId → decision payload
const state = { query: '', sort: 'fit', capability: '', collection: '', decision: '', lang: '', view: 'list' };

// Fit levels best→worst — module-level so cards, the compare modal, and the stats
// bar share one source. (Was re-declared per-function, leaving the compare modal
// referencing an out-of-scope FIT_ORDER → runtime ReferenceError.)
const FIT_ORDER = ['strong', 'solid', 'care', 'risky'];

// NL filter state: when the user types ?query, the AI returns a ranked list of IDs.
let nlFilter = null; // null | { question, ids: string[], error?: string }

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

// Pinned repos: always float to the top of the grid regardless of sort.
let pinned = new Set();

// User notes: freeform text annotations keyed by repoId, persisted to local storage.
let notesMap = new Map();
const noteKey = (repoId) => `repolens_note_${repoId}`;

// Saved filters: named snapshots of {query,sort,capability,collection,decision,lang} state.
let savedFilters = [];
const SAVED_FILTERS_KEY = 'repolens_saved_filters';

// Evaluations Workbench: rubric criteria + per-repo scores.
let rubric = [...DEFAULT_RUBRIC];
let evalMap = new Map(); // repoId → { scores:{critId→1-5}, note, savedAt }

async function togglePin(repoId) {
  if (pinned.has(repoId)) pinned.delete(repoId);
  else pinned.add(repoId);
  await chrome.storage.local.set({ repolens_pinned: [...pinned] });
  render();
}

function card(r) {
  const hq = !nlFilter && state.query.length >= 2 ? state.query.toLowerCase() : '';
  const owner = r.repoId.includes('/') ? r.repoId.slice(0, r.repoId.indexOf('/')) : '';
  const dots = r.languages
    .map((l) => `<span class="lc-dot" style="background:${langColor(l.name)}" title="${esc(l.name)}"></span>`)
    .join('');
  const tags = r.capabilities.slice(0, 4).map((c) => `<span class="lc-tag" data-cap="${esc(c)}" title="Filter by ${esc(c)}">${hilite(c, hq)}</span>`).join('');
  const when = relativeTime(r.savedAt);
  const isToday = r.savedAt && (Date.now() - Date.parse(r.savedAt)) < 86_400_000;
  const isStale = r.savedAt && (Date.now() - Date.parse(r.savedAt)) > 30 * 86_400_000;
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
    ? `<span class="lc-decision" data-d="${esc(dec.decision)}" title="Decided ${dec.savedAt ? relativeTime(dec.savedAt) : 'some time ago'}">${esc(DECISION_META[dec.decision]?.label || dec.decision)}${dec.savedAt ? `<span class="lc-dec-when"> · ${esc(relativeTime(dec.savedAt))}</span>` : ''}</span>`
    : '';
  const deltaBadge = r.fitDelta
    ? (() => {
        const improved = FIT_ORDER.indexOf(r.fitDelta.to) < FIT_ORDER.indexOf(r.fitDelta.from);
        return `<span class="lc-fit-delta ${improved ? 'up' : 'down'}" title="Fit changed since last scan: ${r.fitDelta.from} → ${r.fitDelta.to}">${improved ? '↑' : '↓'} ${esc(r.fitDelta.from)} → ${esc(r.fitDelta.to)}</span>`;
      })()
    : '';
  const isPinned = pinned.has(r.repoId);
  const platformBadge = r.platform && r.platform !== 'github'
    ? `<span class="lc-platform" title="${esc(r.platform)}">${r.platform === 'npm' ? 'npm' : r.platform === 'pypi' ? 'PyPI' : r.platform === 'gitlab' ? 'GL' : esc(r.platform)}</span>`
    : '';
  const evalEntry = evalMap.get(r.repoId);
  const evalScore = evalEntry ? computeScore(evalEntry, rubric) : null;
  const evalBadge = evalScore !== null
    ? `<button class="lc-eval-badge" data-act="eval" title="Evaluation: ${evalScore.toFixed(1)}/5 — click to edit">▣ ${evalScore.toFixed(1)}</button>`
    : `<button class="lc-eval-badge lc-eval-empty" data-act="eval" title="Add evaluation scores">▣</button>`;
  return `<div class="lib-card${sel ? ' is-selected' : ''}${isPinned ? ' is-pinned' : ''}" data-repo="${esc(r.repoId)}" title="${r.hasCache ? 'Open the saved analysis (instant, no AI call)' : 'Open the project page'}">
    <div class="lc-top">
      <input type="checkbox" class="lc-check"${sel ? ' checked' : ''} aria-label="Select ${esc(r.name)} for removal" title="Select for bulk removal">
      <span class="lc-name">${hilite(r.name, hq)}</span>
      ${owner ? `<span class="lc-owner">${hilite(owner, hq)}</span>` : ''}
      ${platformBadge}
      <span class="lc-chip fit-${r.fit.level}"${r.fit.why ? ` title="${esc(r.fit.why)}"` : ''}>${esc(r.fit.label)}</span>
      ${deltaBadge}
      ${decBadge}
      ${evalBadge}
      ${isPinned ? `<span class="lc-pin-badge" title="Pinned">📌</span>` : ''}
    </div>
    ${r.blurb ? `<div class="lc-blurb">${hilite(r.blurb, hq)}</div>` : ''}
    ${notesMap.has(r.repoId) ? `<div class="lc-note-preview" data-act="note">${esc(notesMap.get(r.repoId).slice(0, 80))}${notesMap.get(r.repoId).length > 80 ? '…' : ''}</div>` : ''}
    <div class="lc-meta">
      ${r.health ? `<span class="lc-health">♥ ${r.health}</span>` : ''}
      ${r.stars >= 1 ? `<span class="lc-stars">${r.stars >= 1000 ? (r.stars / 1000).toFixed(1) + 'k' : r.stars}★</span>` : ''}
      ${r.category ? `<span class="lc-cat">${esc(r.category)}</span>` : ''}
      ${dots ? `<span class="lc-langs">${dots}</span>` : ''}
      ${isToday ? `<span class="lc-today" title="Scanned ${esc(when)}">Today</span>` : when ? `<span class="lc-when" title="Last scanned ${esc(r.savedAt)}">scanned ${esc(when)}</span>` : ''}
      ${isStale ? `<span class="lc-stale" title="Analysis is over 30 days old — consider re-scanning" data-act="rescan">⟳ stale</span>` : ''}
    </div>
    ${(() => {
      const trend = snapshotTrend(snapsByRepo.get(r.repoId) || []);
      if (!trend) return '';
      const svg = sparkline(trend.series, { metric: 'health', width: 96, height: 22 });
      if (!svg) return '';
      const sign = trend.healthDelta > 0 ? '+' : '';
      const delta = trend.healthDelta != null ? `${sign}${trend.healthDelta}` : '';
      return `<div class="lc-spark fit-${trend.fitTo}">${svg}<span class="lc-spark-cap">${delta ? `<b>${delta}</b> · ` : ''}${trend.count} scans${trend.daysSpan ? ` · ${trend.daysSpan}d` : ''}</span></div>`;
    })()}
    ${tags || boardDots ? `<div class="lc-tags">${tags}${boardDots}</div>` : ''}
    <div class="lc-actions">
      <button class="lc-act${isPinned ? ' lc-act-pin-on' : ''}" data-act="pin" title="${isPinned ? 'Unpin' : 'Pin to top'}">📌</button>
      ${cacheByRepo.has(r.repoId) ? `<button class="lc-act" data-act="quick-ask" title="Ask a quick question about this repo">? Ask</button>` : ''}
      <button class="lc-act${compareSet.has(r.repoId) ? ' lc-act-cmp-on' : ''}" data-act="compare" title="${compareSet.has(r.repoId) ? 'Remove from compare' : 'Add to compare (pick 2)'}">⇄</button>
      <button class="lc-act${notesMap.has(r.repoId) ? ' lc-act-note-on' : ''}" data-act="note" title="${notesMap.has(r.repoId) ? 'Edit note' : 'Add a personal note'}">✎</button>
      <button class="lc-act" data-act="boards" title="Add to a collection">▦ Boards</button>
      <button class="lc-act" data-act="rescan" title="Run a fresh scan (AI call)">↻ Re-scan</button>
      ${cacheByRepo.has(r.repoId) ? `<button class="lc-act" data-act="copy-md" title="Copy analysis summary as Markdown">📋</button>` : ''}
      <button class="lc-act" data-act="source" title="Open the project page">Source ↗</button>
      <button class="lc-act lc-act-del" data-act="remove" title="Remove from library and local history">✕</button>
    </div>
    <div class="lc-quick-ask hidden" id="lc-qa-${esc(r.repoId).replace(/[^a-z0-9]/gi, '-')}">
      <input class="lc-qa-input" placeholder="Ask a question…" type="text">
      <div class="lc-qa-answer hidden"></div>
    </div>
    <div class="lc-note-panel hidden" id="lc-np-${esc(r.repoId).replace(/[^a-z0-9]/gi, '-')}">
      <textarea class="lc-note-input" placeholder="Add a personal note…" rows="3"></textarea>
      <div class="lc-note-footer">
        <span class="lc-note-hint">Ctrl+Enter to save · Esc to close</span>
        <button class="lc-note-save">Save</button>
      </div>
    </div>
  </div>`;
}

function render() {
  jkIdx = -1;
  const grid = document.getElementById('grid');
  const rows = applyFilters(allRows, state, { decisionMap, evalMap, rubric, collections, nlFilter });
  document.getElementById('count').textContent =
    rows.length === allRows.length ? `${allRows.length} repos` : `${rows.length} of ${allRows.length}`;
  const pinnedRows = rows.filter((r) => pinned.has(r.repoId));
  const unpinnedRows = rows.filter((r) => !pinned.has(r.repoId));
  const pinnedSection = pinnedRows.length
    ? `<div class="lib-section-label">📌 Pinned</div>${pinnedRows.map(card).join('')}<div class="lib-section-label lib-section-rest">All repos</div>`
    : '';
  grid.innerHTML = rows.length
    ? `${pinnedSection}${unpinnedRows.map(card).join('')}`
    : '<p style="color:var(--muted);padding:20px 0">No repos match these filters.</p>';
  wireGridEvents(grid);
  if (selectionMode) updateSelectionBar(); // keep the bar's count / "Select all" label in sync
}

// ─── Delegated grid event wiring (called once; handles all current and future cards) ───

let _gridWired = false;
let _hoverCard = null;
let _hoverTimer = null;

function wireGridEvents(grid) {
  if (_gridWired) return;
  _gridWired = true;

  // Single click handler for cards and action buttons
  grid.addEventListener('click', (e) => {
    // Stale badge click → trigger rescan for that card
    if (e.target.classList.contains('lc-stale')) {
      e.stopPropagation();
      const el = e.target.closest('.lib-card');
      if (el) rescan(el.dataset.repo);
      return;
    }

    // Capability tag click → filter by that capability
    const tag = e.target.closest('.lc-tag[data-cap]');
    if (tag) {
      e.stopPropagation();
      const cap = tag.dataset.cap;
      state.capability = state.capability === cap ? '' : cap;
      renderCaps();
      render();
      return;
    }

    const btn = e.target.closest('.lc-act');
    if (btn) {
      e.stopPropagation();
      const repoId = btn.closest('.lib-card')?.dataset.repo;
      if (!repoId) return;
      const act = btn.dataset.act;
      if (act === 'source') openSource(repoId);
      else if (act === 'rescan') rescan(repoId);
      else if (act === 'remove') removeRepo(repoId, btn);
      else if (act === 'boards') openBoardsPopover(repoId, btn);
      else if (act === 'compare') toggleCompare(repoId);
      else if (act === 'pin') togglePin(repoId);
      else if (act === 'quick-ask') openQuickAsk(repoId, btn);
      else if (act === 'note') openNote(repoId, btn);
      else if (act === 'copy-md') copyCardMd(repoId, btn);
      else if (act === 'eval') showEvalPanel(repoId, btn);
      return;
    }
    if (e.target.closest('.lc-note-preview')) {
      const el = e.target.closest('.lib-card');
      if (el) openNote(el.dataset.repo, el.querySelector('[data-act="note"]'));
      return;
    }
    const el = e.target.closest('.lib-card');
    if (!el) return;
    if (selectionMode) {
      if (e.target.closest('.lc-check')) return;
      toggleSelect(el.dataset.repo, el);
      return;
    }
    openRow(el.dataset.repo);
  });

  // Checkbox change (bubbles, no need for per-card handler)
  grid.addEventListener('change', (e) => {
    if (!e.target.classList.contains('lc-check')) return;
    const el = e.target.closest('.lib-card');
    if (el) toggleSelect(el.dataset.repo, el, e.target.checked);
  });

  // Hover preview via mouseover/mouseout (mouseenter/leave don't bubble)
  grid.addEventListener('mouseover', (e) => {
    const el = e.target.closest('.lib-card');
    if (!el || !cacheByRepo.has(el.dataset.repo)) return;
    if (el === _hoverCard) return;
    clearTimeout(_hoverTimer);
    _hoverCard = el;
    _hoverTimer = setTimeout(() => showHoverPreview(el.dataset.repo, el), 350);
  });

  grid.addEventListener('mouseout', (e) => {
    const el = e.target.closest('.lib-card');
    if (!el) return;
    if (el.contains(e.relatedTarget)) return; // still inside the card
    _hoverCard = null;
    clearTimeout(_hoverTimer);
    scheduleHidePreview();
  });
}

const rowFor = (repoId) => allRows.find((r) => r.repoId === repoId);

function openQuickAsk(repoId, btn) {
  const safeId = repoId.replace(/[^a-z0-9]/gi, '-');
  const panel = document.getElementById(`lc-qa-${safeId}`);
  if (!panel) return;
  const isOpen = !panel.classList.contains('hidden');
  if (isOpen) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  const input = panel.querySelector('.lc-qa-input');
  input?.focus();

  const doAsk = async () => {
    const q = (input?.value || '').trim();
    if (!q) return;
    const analysis = cacheByRepo.get(repoId);
    if (!analysis) return;
    const answerEl = panel.querySelector('.lc-qa-answer');
    answerEl?.classList.remove('hidden');
    if (answerEl) answerEl.textContent = 'Thinking…';
    if (btn) btn.disabled = true;
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'ASK_CACHED', question: q, analysis });
      if (answerEl) answerEl.textContent = resp?.ok ? resp.answer : (resp?.error || 'Something went wrong.');
    } catch {
      if (answerEl) answerEl.textContent = 'Could not reach the extension.';
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); doAsk(); } });
  // Clear the event after first use by removing and re-adding the panel hidden on next render
}

// --- Hover preview ---
let hidePreviewTimer = null;

function scheduleHidePreview() {
  hidePreviewTimer = setTimeout(() => {
    const panel = document.getElementById('lc-hover-card');
    if (panel) panel.hidden = true;
  }, 120);
}

function showHoverPreview(repoId, cardEl) {
  const full = cacheByRepo.get(repoId);
  if (!full) return;

  const panel = document.getElementById('lc-hover-card');
  if (!panel) return;

  const row = rowFor(repoId);
  const dec = decisionMap.get(repoId);
  const note = notesMap.get(repoId);
  const eli5 = full.eli5 ? `<p class="lchc-eli5">${esc(full.eli5.slice(0, 200))}</p>` : '';
  const pros = Array.isArray(full.pros) && full.pros.length
    ? `<p class="lchc-section">Strengths</p><ul class="lchc-list lchc-pros">${full.pros.slice(0, 3).map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
    : '';
  const cons = Array.isArray(full.cons) && full.cons.length
    ? `<p class="lchc-section">Weaknesses</p><ul class="lchc-list lchc-cons">${full.cons.slice(0, 2).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
    : '';
  const decHtml = dec
    ? `<p class="lchc-dec"><span class="lc-decision" data-d="${esc(dec.decision)}">${esc(DECISION_META[dec.decision]?.label || dec.decision)}</span>${dec.savedAt ? ` <span class="lchc-when">${esc(relativeTime(dec.savedAt))}</span>` : ''}</p>`
    : '';
  const deltaHtml = row?.fitDelta
    ? (() => {
        const imp = FIT_ORDER.indexOf(row.fitDelta.to) < FIT_ORDER.indexOf(row.fitDelta.from);
        return `<p class="lchc-delta ${imp ? 'up' : 'down'}">${imp ? '↑' : '↓'} fit: ${esc(row.fitDelta.from)} → ${esc(row.fitDelta.to)}</p>`;
      })()
    : '';
  const noteHtml = note ? `<p class="lchc-note">"${esc(note.slice(0, 100))}${note.length > 100 ? '…' : ''}"</p>` : '';

  panel.innerHTML = decHtml + deltaHtml + noteHtml + eli5 + pros + cons;

  // Position: right of card if room, else left
  const rect = cardEl.getBoundingClientRect();
  const GAP = 10;
  const W = 260;
  let left = rect.right + GAP;
  if (left + W > window.innerWidth - 8) left = rect.left - W - GAP;
  left = Math.max(8, left);

  const top = Math.min(rect.top, window.innerHeight - panel.offsetHeight - 8);
  panel.style.left = `${left}px`;
  panel.style.top = `${Math.max(8, top)}px`;
  panel.hidden = false;

  // Let the mouse move onto the panel without dismissing it
  panel.classList.add('interactive');
  panel.onmouseenter = () => clearTimeout(hidePreviewTimer);
  panel.onmouseleave = scheduleHidePreview;
}

async function copyCardMd(repoId, btn) {
  const row = rowFor(repoId);
  const full = cacheByRepo.get(repoId);
  const dec = decisionMap.get(repoId);
  const note = notesMap.get(repoId);
  const lines = [
    `## [${repoId}](https://github.com/${repoId})`,
    '',
    row?.blurb || full?.description || full?.eli5?.slice(0, 120) || '',
    '',
    [
      full?.health?.score ? `**Health:** ${full.health.score}/100` : '',
      row?.stars >= 1 ? `**Stars:** ${row.stars >= 1000 ? (row.stars / 1000).toFixed(1) + 'k' : row.stars}` : '',
      row?.fit?.label ? `**Fit:** ${row.fit.label}` : '',
      dec ? `**Decision:** ${DECISION_META[dec.decision]?.label || dec.decision}` : '',
    ].filter(Boolean).join(' · '),
    full?.pros?.length ? `\n**Pros:** ${full.pros.slice(0, 3).join('; ')}` : '',
    full?.cons?.length ? `**Cons:** ${full.cons.slice(0, 2).join('; ')}` : '',
    note ? `\n> ${note}` : '',
    '',
    `_via RepoLens_`,
  ].filter((l) => l !== undefined).join('\n').trim();
  try {
    await navigator.clipboard.writeText(lines);
    const orig = btn?.textContent;
    if (btn) { btn.textContent = '✓'; setTimeout(() => { btn.textContent = orig; }, 1200); }
  } catch { /* clipboard denied — silent */ }
}

function openNote(repoId, btn) {
  const safeId = repoId.replace(/[^a-z0-9]/gi, '-');
  const panel = document.getElementById(`lc-np-${safeId}`);
  if (!panel) return;
  const isOpen = !panel.classList.contains('hidden');
  if (isOpen) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  const textarea = panel.querySelector('.lc-note-input');
  if (textarea) {
    textarea.value = notesMap.get(repoId) || '';
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
  }

  const saveNote = async () => {
    const text = (textarea?.value || '').trim();
    if (text) notesMap.set(repoId, text);
    else notesMap.delete(repoId);
    try {
      if (text) await chrome.storage.local.set({ [noteKey(repoId)]: text });
      else await chrome.storage.local.remove(noteKey(repoId));
    } catch { /* best-effort */ }
    panel.classList.add('hidden');
    render();
  };

  textarea?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { panel.classList.add('hidden'); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveNote(); }
  });
  panel.querySelector('.lc-note-save')?.addEventListener('click', saveNote);
}

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
  const compare = document.getElementById('sel-compare');
  if (compare) {
    compare.disabled = n < 2;
    compare.textContent = n >= 2 ? `⊞ Compare ${n}` : '⊞ Compare';
    compare.title = n >= 2 ? `Compare ${n} repos side-by-side` : 'Select 2+ repos to compare';
  }
  const decideEl = document.getElementById('sel-decide');
  if (decideEl) {
    decideEl.disabled = !n;
    decideEl.value = '';
  }
}

function selectAllToggle() {
  const vis = visibleIds();
  const allChosen = vis.length > 0 && vis.every((id) => selected.has(id));
  vis.forEach((id) => (allChosen ? selected.delete(id) : selected.add(id)));
  render(); // reflect the new checkbox / is-selected state across the grid
  updateSelectionBar();
}

// ─── N-way compare modal ──────────────────────────────────────────────────────

function compareSelected() {
  const repos = [...selected].map(id => allRows.find(r => r.repoId === id)).filter(Boolean);
  if (repos.length < 2) { setStatus('Select at least 2 repos to compare.'); return; }

  document.getElementById('rl-cmp-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'rl-cmp-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', `Compare ${repos.length} repos`);
  modal.setAttribute('aria-modal', 'true');

  const thCols = repos.map(r =>
    `<th><a href="https://github.com/${esc(r.repoId)}" target="_blank" rel="noopener" class="cmp2-name">${esc(r.name)}</a><br><span class="cmp2-id">${esc(r.repoId)}</span></th>`
  ).join('');

  const TABLE_ROWS = [
    { label: 'Fit', fn: r => `<span class="lc-chip fit-${esc(r.fit?.level ?? 'unrated')}">${esc(r.fit?.label ?? '—')}</span>` },
    { label: 'Fit delta', fn: r => r.fitDelta ? `<span class="lc-fit-delta ${FIT_ORDER.indexOf(r.fitDelta.to) < FIT_ORDER.indexOf(r.fitDelta.from) ? 'up' : 'down'}">${r.fitDelta.from} → ${r.fitDelta.to}</span>` : '—' },
    { label: 'Health', fn: r => r.health != null ? `${r.health}%` : '—' },
    { label: 'Stars', fn: r => r.stars != null ? (r.stars >= 1000 ? (r.stars / 1000).toFixed(1) + 'k' : String(r.stars)) : '—' },
    { label: 'Language', fn: r => esc(r.languages?.[0]?.name ?? '—') },
    { label: 'Decision', fn: r => { const d = decisionMap.get(r.repoId); return d ? `<span class="lc-decision" data-d="${esc(d.decision)}">${esc(DECISION_META[d.decision]?.label || d.decision)}</span>` : '—'; } },
    { label: 'Eval score', fn: r => { const ev = evalMap.get(r.repoId); const s = ev ? computeScore(ev, rubric) : null; return s !== null ? `${s.toFixed(1)}/5` : '—'; } },
    ...rubric.map(crit => ({
      label: crit.name,
      fn: r => { const ev = evalMap.get(r.repoId); const v = ev?.scores?.[crit.id]; return v != null ? '★'.repeat(v) + '☆'.repeat(5 - v) : '—'; },
    })),
    { label: 'Capabilities', fn: r => r.capabilities?.slice(0, 5).map(c => `<span class="cap-tag">${esc(c)}</span>`).join(' ') || '—' },
    { label: 'Note', fn: r => esc((notesMap.get(r.repoId) || '').slice(0, 80)) || '—' },
  ];

  const tBody = TABLE_ROWS.map(row =>
    `<tr><th class="cmp2-label">${esc(row.label)}</th>${repos.map(r => `<td>${row.fn(r)}</td>`).join('')}</tr>`
  ).join('');

  modal.innerHTML = `
    <div class="cmp2-inner">
      <div class="cmp2-bar">
        <span class="cmp2-title">Comparing ${repos.length} repos</span>
        <div class="cmp2-btns">
          <button class="lib-btn" id="cmp2-md">↓ Markdown</button>
          <button class="lib-btn" id="cmp2-csv">↓ CSV</button>
          <button class="lib-btn" id="cmp2-close" aria-label="Close">✕</button>
        </div>
      </div>
      <div class="cmp2-scroll">
        <table class="cmp2-table">
          <thead><tr><th class="cmp2-label-col"></th>${thCols}</tr></thead>
          <tbody>${tBody}</tbody>
        </table>
      </div>
    </div>`;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('visible'));

  const close = () => { modal.classList.remove('visible'); setTimeout(() => modal.remove(), 200); };
  modal.querySelector('#cmp2-close')?.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  const escFn = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escFn); } };
  document.addEventListener('keydown', escFn);
  modal.querySelector('#cmp2-md')?.addEventListener('click', () => exportCompareMatrix(repos, 'md'));
  modal.querySelector('#cmp2-csv')?.addEventListener('click', () => exportCompareMatrix(repos, 'csv'));
}

function exportCompareMatrix(repos, format) {
  const date = new Date().toISOString().slice(0, 10);
  const dl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href); };
  const getRow = r => {
    const dec = decisionMap.get(r.repoId);
    const ev = evalMap.get(r.repoId);
    const score = ev ? computeScore(ev, rubric) : null;
    return {
      repoId: r.repoId, fit: r.fit?.label ?? '—', health: r.health ?? '—', stars: r.stars ?? '—',
      language: r.languages?.[0]?.name ?? '—',
      decision: dec ? (DECISION_META[dec.decision]?.label || dec.decision) : '—',
      evalScore: score !== null ? score.toFixed(1) : '—',
      critScores: rubric.map(c => ev?.scores?.[c.id] ?? '—'),
      note: (notesMap.get(r.repoId) || '').slice(0, 80),
    };
  };
  if (format === 'csv') {
    const qv = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const hdr = ['repoId', 'fit', 'health', 'stars', 'language', 'decision', 'evalScore', ...rubric.map(c => c.name), 'note'].join(',');
    const rows = repos.map(r => { const d = getRow(r); return [qv(d.repoId), qv(d.fit), d.health, d.stars, qv(d.language), qv(d.decision), d.evalScore, ...d.critScores, qv(d.note)].join(','); });
    dl(new Blob([[hdr, ...rows].join('\n')], { type: 'text/csv' }), `repolens-compare-${date}.csv`);
  } else {
    const critCols = rubric.map(c => ` ${c.name} |`).join('');
    const hdr = `| Repo | Fit | Health | Stars | Language | Decision | Eval |${critCols} Note |`;
    const sep = `|---|---|---|---|---|---|---|${rubric.map(() => '---|').join('')}---|`;
    const rows = repos.map(r => {
      const d = getRow(r);
      return `| [${d.repoId}](https://github.com/${d.repoId}) | ${d.fit} | ${d.health} | ${d.stars} | ${d.language} | ${d.decision} | ${d.evalScore} |${d.critScores.map(s => ` ${s} |`).join('')} ${d.note.replace(/\|/g, '\\|')} |`;
    });
    dl(new Blob([`# Compare: ${repos.map(r => r.name).join(' · ')} — ${date}\n\n${hdr}\n${sep}\n${rows.join('\n')}\n`], { type: 'text/markdown' }), `repolens-compare-${date}.md`);
  }
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
  renderNlFilterBanner();
  setStatus(`Removed ${ids.length} repo${ids.length === 1 ? '' : 's'}.`);
}

async function bulkDecide(decision) {
  const ids = [...selected];
  if (!ids.length) return;
  const label = decision ? (DECISION_META[decision]?.label || decision) : 'cleared';
  setStatus(`Setting decision to ${label} for ${ids.length} repo${ids.length === 1 ? '' : 's'}…`);
  const now = new Date().toISOString();
  const { clearDecision } = await import('./store.js');
  for (const repoId of ids) {
    if (decision) {
      const rec = { repoId, decision, savedAt: now };
      await saveDecision(rec);
      decisionMap.set(repoId, rec);
    } else {
      await clearDecision(repoId);
      decisionMap.delete(repoId);
    }
  }
  setSelectionMode(false, false);
  renderDecisionFilter();
  render();
  setStatus(`Decision set to ${label} for ${ids.length} repo${ids.length === 1 ? '' : 's'}.`);
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
    return (Date.now() - new Date(r.savedAt).getTime()) > 30 * 86_400_000;
  }).length;
  const stalePill = staleCount
    ? html`<button class="ls-stale" id="refresh-stale" title="Queue stale repos for a fresh scan">↻ ${staleCount} stale</button>`
    : '';
  const FIT_ORDER_ALL = ['strong', 'solid', 'care', 'risky', 'unrated'];
  const barSegments = FIT_ORDER_ALL.filter((lvl) => s.byFit[lvl] > 0)
    .map((lvl) => `<span class="ls-bar-seg ls-bar-${lvl}" style="flex:${s.byFit[lvl]}" title="${s.byFit[lvl]} ${lvl}"></span>`)
    .join('');
  const decCounts = { adopt: 0, trial: 0, hold: 0, reject: 0 };
  for (const d of decisionMap.values()) if (decCounts[d.decision] != null) decCounts[d.decision]++;
  const totalDecided = decCounts.adopt + decCounts.trial + decCounts.hold + decCounts.reject;
  const undecided = s.total - totalDecided;
  const decSummary = totalDecided
    ? `<span class="ls-dec-row">${
        [
          decCounts.adopt  ? `<button class="ls-dec adopt"  title="Show Adopt"  data-filter-dec="adopt">${decCounts.adopt} Adopt</button>`  : '',
          decCounts.trial  ? `<button class="ls-dec trial"  title="Show Trial"  data-filter-dec="trial">${decCounts.trial} Trial</button>`  : '',
          decCounts.hold   ? `<button class="ls-dec hold"   title="Show Hold"   data-filter-dec="hold">${decCounts.hold} Hold</button>`   : '',
          decCounts.reject ? `<button class="ls-dec reject" title="Show Reject" data-filter-dec="reject">${decCounts.reject} Reject</button>` : '',
          undecided > 0    ? `<button class="ls-dec undecided" title="Show Undecided" data-filter-dec="undecided">${undecided} undecided</button>` : '',
        ].filter(Boolean).join('<span class="ls-dec-sep">·</span>')
      }</span>`
    : '';
  const triagePct = s.total ? Math.round((totalDecided / s.total) * 100) : 0;
  const triagePill = s.total > 0
    ? `<span class="ls-triage-pct" title="${totalDecided} of ${s.total} repos triaged">${triagePct}% triaged</span>`
    : '';
  host.innerHTML = String(html`
    <span class="ls-total">${s.total} repo${s.total === 1 ? '' : 's'}</span>
    ${triagePill}
    ${barSegments ? `<span class="ls-bar" title="Fit distribution">${barSegments}</span>` : ''}
    <span class="ls-pills">${FIT_ORDER_ALL.map((lvl) => pill(lvl, s.byFit[lvl]))}</span>
    ${s.avgHealth != null ? html`<span class="ls-health">avg health ${s.avgHealth}</span>` : ''}
    ${stalePill}
    ${decSummary}
  `);
  host.querySelectorAll('[data-filter-dec]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.decision = btn.dataset.filterDec;
      renderDecisionFilter();
      render();
    });
  });
  document.getElementById('refresh-stale')?.addEventListener('click', refreshStale);
}

function renderNlFilterBanner() {
  const host = document.getElementById('nl-filter-banner');
  if (!host) return;
  if (!nlFilter) { host.classList.add('hidden'); host.innerHTML = ''; return; }
  host.classList.remove('hidden');
  if (!nlFilter.ids) {
    host.innerHTML = `<span class="nlf-spinner">⟳</span> <span class="nlf-text">AI filtering for <em>${esc(nlFilter.question)}</em>…</span>`;
    return;
  }
  const count = nlFilter.ids.length;
  const errSpan = nlFilter.error ? `<span class="nlf-err">${esc(nlFilter.error)}</span>` : '';
  const result = !nlFilter.error
    ? (count ? `<span class="nlf-count">${count} match${count === 1 ? '' : 'es'}</span>` : '<span class="nlf-none">No matches found</span>')
    : errSpan;
  host.innerHTML = `<span class="nlf-label">✦ AI: <em>${esc(nlFilter.question)}</em></span>${result}<button class="nlf-clear" id="nlf-clear">✕ Clear</button>`;
  host.querySelector('#nlf-clear')?.addEventListener('click', () => {
    nlFilter = null;
    renderNlFilterBanner();
    render();
  });
}

async function refreshStale() {
  const stale = allRows.filter((r) => {
    if (!r.savedAt) return false;
    return (Date.now() - new Date(r.savedAt).getTime()) > 30 * 86_400_000;
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
    const backup = buildBackup({ repos: stores.repos, nodes: stores.nodes, edges: stores.edges, cache: cached, collections: stores.collections, decisions: stores.decisions, snapshots: stores.snapshots });
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
  let densityCompact = false;
  document.getElementById('density-toggle')?.addEventListener('click', () => {
    densityCompact = !densityCompact;
    document.getElementById('grid')?.classList.toggle('density-compact', densityCompact);
    const btn = document.getElementById('density-toggle');
    if (btn) { btn.textContent = densityCompact ? '⊞' : '⊟'; btn.classList.toggle('on', densityCompact); btn.title = densityCompact ? 'Switch to comfortable view' : 'Switch to compact view'; }
    chrome.storage.local.set({ libraryDensity: densityCompact ? 'compact' : 'comfortable' });
  });
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
  document.getElementById('sel-decide')?.addEventListener('change', async (e) => {
    const val = e.currentTarget.value;
    if (!val) return;
    e.currentTarget.value = '';
    await bulkDecide(val === 'clear' ? null : val);
  });
  document.getElementById('sel-compare')?.addEventListener('click', compareSelected);
  document.getElementById('sel-done')?.addEventListener('click', () => setSelectionMode(false));
  document.getElementById('discover-btn')?.addEventListener('click', openDiscovery);
  document.getElementById('discover-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const q = document.getElementById('discover-input')?.value.trim();
    if (!q) return;
    const resultsEl = document.querySelector('#discover-panel .dc-results');
    if (!resultsEl) return;
    resultsEl.innerHTML = '<div class="dc-loading">Searching GitHub…</div>';
    try {
      const items = await searchGitHub(q);
      showDiscoveryResults(items, resultsEl, `"${q}" — ${items.length} results`);
    } catch (err) {
      resultsEl.innerHTML = `<p class="dc-empty">Search failed: ${esc(err.message)}</p>`;
    }
  });
  document.getElementById('discover-panel')?.addEventListener('click', e => {
    const btn = e.target.closest('.dc-open');
    if (btn?.dataset.url) chrome.tabs.create({ url: btn.dataset.url });
  });
  document.getElementById('discover-recs')?.addEventListener('click', () => {
    document.getElementById('discover-input').value = '';
    recommendFromLibrary(document.querySelector('#discover-panel .dc-results'));
  });
  document.getElementById('drift-dismiss')?.addEventListener('click', () => {
    sessionStorage.setItem('drift_dismissed', '1');
    document.getElementById('drift-banner')?.classList.add('hidden');
  });
  document.getElementById('drift-refresh')?.addEventListener('click', () => {
    sessionStorage.setItem('drift_dismissed', '1');
    document.getElementById('drift-banner')?.classList.add('hidden');
    refreshStale();
  });
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

const CAPS_VISIBLE = 10;

function renderCaps() {
  const host = document.getElementById('caps');
  const caps = allCapabilities(allRows);
  if (!caps.length) { host.innerHTML = ''; return; }

  const visibleCaps = caps.slice(0, CAPS_VISIBLE);
  const hiddenCaps = caps.slice(CAPS_VISIBLE);
  const showAll = host.dataset.expanded === '1';
  const renderCap = (c) => `<button class="lib-cap${state.capability === c ? ' on' : ''}" data-cap="${esc(c)}">${esc(c)}</button>`;

  const moreBtn = hiddenCaps.length
    ? (showAll
        ? `<button class="lib-cap lib-cap-more" data-toggle-caps>− less</button>`
        : `<button class="lib-cap lib-cap-more" data-toggle-caps>+ ${hiddenCaps.length} more</button>`)
    : '';

  host.innerHTML = visibleCaps.map(renderCap).join('')
    + (showAll ? hiddenCaps.map(renderCap).join('') : '')
    + moreBtn;

  if (!host._capsDelegated) {
    host._capsDelegated = true;
    host.addEventListener('click', (e) => {
      if (e.target.dataset.toggleCaps !== undefined) {
        host.dataset.expanded = host.dataset.expanded === '1' ? '' : '1';
        renderCaps();
        return;
      }
      const btn = e.target.closest('[data-cap]');
      if (!btn) return;
      state.capability = state.capability === btn.dataset.cap ? '' : btn.dataset.cap;
      renderCaps();
      render();
    });
  }
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
  const undecidedCount = allRows.filter((r) => !decisionMap.has(r.repoId)).length;
  const chip = (id, label, n) =>
    `<button class="lib-coll${state.decision === id ? ' on' : ''}" data-dec="${esc(id || '')}">${esc(label)}<span class="coll-n">${n}</span></button>`;
  host.innerHTML = [
    chip('', 'All decisions', total),
    counts.adopt ? chip('adopt', 'Adopt', counts.adopt) : '',
    counts.trial ? chip('trial', 'Trial', counts.trial) : '',
    counts.hold  ? chip('hold',  'Hold',  counts.hold)  : '',
    counts.reject ? chip('reject', 'Reject', counts.reject) : '',
    undecidedCount ? chip('undecided', 'Undecided', undecidedCount) : '',
  ].join('');
  if (!host._decDelegated) {
    host._decDelegated = true;
    host.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-dec]');
      if (!btn) return;
      state.decision = btn.dataset.dec;
      renderDecisionFilter();
      render();
    });
  }
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

  if (!host._collDelegated) {
    host._collDelegated = true;
    host.addEventListener('click', (e) => {
      if (e.target.closest('[data-coll-new]')) { showCollectionInput(host); return; }
      if (e.target.closest('[data-coll-del]')) { confirmDeleteCollection(e.target.closest('[data-coll-del]')); return; }
      const btn = e.target.closest('[data-coll]');
      if (!btn) return;
      state.collection = btn.dataset.coll;
      renderCollections();
      render();
    });
  }
}

function showCollectionInput(host, addRepoId) {
  const existing = host.querySelector('.coll-inline-input');
  if (existing) { existing.focus(); return; }
  const wrap = document.createElement('div');
  wrap.className = 'coll-inline-wrap';
  wrap.innerHTML = `<input class="coll-inline-input" placeholder="Collection name…" maxlength="40" type="text">`;
  host.appendChild(wrap);
  const input = wrap.querySelector('input');
  input.focus();
  const finish = async () => {
    const name = input.value.trim();
    wrap.remove();
    if (!name) return;
    await createCollection(addRepoId, name);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(); }
    if (e.key === 'Escape') { e.preventDefault(); wrap.remove(); }
  });
  input.addEventListener('blur', () => { setTimeout(() => wrap.isConnected && wrap.remove(), 150); });
}

// Create a collection (optionally adding a repo to it straight away).
async function createCollection(addRepoId, name) {
  if (name === undefined) {
    // Legacy path — only reached if called directly without inline input
    name = window.prompt('Name this collection');
  }
  if (!name) return null;
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
  pop.querySelector('[data-new]')?.addEventListener('click', () => {
    closeBoardsPopover();
    const host = document.getElementById('collections');
    if (host) showCollectionInput(host, repoId);
    else createCollection(repoId);
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

  const fitChip = (r) => `<span class="lc-chip fit-${r.fit.level}" style="margin:0"${r.fit.why ? ` title="${esc(r.fit.why)}"` : ''}>${esc(r.fit.label)}</span>`;
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
      <button class="lib-btn cmp-ai-btn" id="cmp-ai" title="Ask AI which repo to pick">✦ Ask AI</button>
      <button class="lib-btn" id="cmp-close" title="Close compare panel">✕</button>
    </div>
    <div id="cmp-verdict"></div>
    <div class="cmp-body">${metaRows}${capRows}</div>`;
}

function renderVerdictHtml(result, nameA, nameB) {
  const winnerName = result.winner === 'a' ? nameA : result.winner === 'b' ? nameB : null;
  const winnerBadge = winnerName
    ? `<span class="cmp-winner-badge">✓ ${esc(winnerName)}</span>`
    : `<span class="cmp-winner-badge cmp-tie">⇄ Tie</span>`;
  const picks = (result.pickA || result.pickB) ? `
    <div class="cmp-pick-row">
      ${result.pickA ? `<div class="cmp-pick"><span class="cmp-pick-label">${esc(nameA)}</span>${esc(result.pickA)}</div>` : ''}
      ${result.pickB ? `<div class="cmp-pick"><span class="cmp-pick-label">${esc(nameB)}</span>${esc(result.pickB)}</div>` : ''}
    </div>` : '';
  const tradeoffs = result.tradeoffs?.length
    ? `<ul class="cmp-tradeoffs">${result.tradeoffs.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
    : '';
  return `
    <div class="cmp-verdict">
      <div class="cmp-verdict-top">${winnerBadge}<span class="cmp-verdict-reason">${esc(result.reason)}</span></div>
      ${result.verdict ? `<p class="cmp-verdict-text">${esc(result.verdict)}</p>` : ''}
      ${picks}
      ${tradeoffs}
    </div>`;
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

  host.querySelector('#cmp-ai')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '…';
    const verdictEl = host.querySelector('#cmp-verdict');
    if (verdictEl) verdictEl.innerHTML = '<div class="cmp-ai-loading">Comparing with AI…</div>';

    const fullA = { ...(cacheByRepo.get(idA) || a), repoId: idA };
    const fullB = { ...(cacheByRepo.get(idB) || b), repoId: idB };
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'COMPARE_REPOS', a: fullA, b: fullB });
      if (resp?.ok && resp.result) {
        if (verdictEl) verdictEl.innerHTML = renderVerdictHtml(resp.result, a.name || idA, b.name || idB);
      } else {
        if (verdictEl) verdictEl.innerHTML = `<div class="cmp-ai-error">${esc(resp?.error || 'Comparison failed')}</div>`;
      }
    } catch (err) {
      if (verdictEl) verdictEl.innerHTML = `<div class="cmp-ai-error">${esc(err?.message || 'Comparison failed')}</div>`;
    }
    btn.disabled = false;
    btn.textContent = '✦ Ask AI';
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
  } else if (format === 'md') {
    const date = new Date().toISOString().slice(0, 10);
    const groups = { strong: [], solid: [], care: [], risky: [], unrated: [] };
    const labels = { strong: 'Strong fit', solid: 'Solid fit', care: 'Needs care', risky: 'Risky', unrated: 'Unrated' };
    for (const r of rows) {
      const k = r.fit?.level in groups ? r.fit.level : 'unrated';
      groups[k].push(r);
    }
    const decLabel = (repoId) => {
      const d = decisionMap.get(repoId);
      return d ? ` · **${DECISION_META[d.decision]?.label || d.decision}**` : '';
    };
    const noteText = (repoId) => {
      const n = notesMap.get(repoId);
      return n ? `\n  > ${n.replace(/\n/g, '\n  > ')}` : '';
    };
    const repoLine = (r) => {
      const meta = [
        r.health ? `♥ ${r.health}` : '',
        r.stars >= 1 ? `${r.stars >= 1000 ? (r.stars / 1000).toFixed(1) + 'k' : r.stars}★` : '',
        r.languages[0]?.name || '',
      ].filter(Boolean).join(' · ');
      return `- **[${r.repoId}](https://github.com/${r.repoId})**${decLabel(r.repoId)}${meta ? ` — ${meta}` : ''}\n  ${r.blurb ? r.blurb.slice(0, 120) : ''}${noteText(r.repoId)}`;
    };
    const sections = Object.entries(groups)
      .filter(([, rs]) => rs.length)
      .map(([key, rs]) => `## ${labels[key]} (${rs.length})\n\n${rs.map(repoLine).join('\n\n')}`)
      .join('\n\n---\n\n');
    const md = `# RepoLens Library — ${date}\n\n_${rows.length} repos · Generated by [RepoLens](https://github.com/New1Direction/repolens)_\n\n---\n\n${sections}\n`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `repolens-library-${date}.md`;
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

// ─── Decision Matrix export ───────────────────────────────────────────────────

function exportDecisionMatrix(format = 'csv') {
  const rows = getVisibleRows();
  if (!rows.length) { setStatus('No repos to export.'); return; }
  const date = new Date().toISOString().slice(0, 10);
  const dl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href); };

  if (format === 'csv') {
    const qv = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const critHeaders = rubric.map(c => qv(c.name)).join(',');
    const hdr = `repoId,name,platform,fit,health,stars,language,decision,decisionDate,evalScore,${critHeaders},evalNote,note,savedAt`;
    const csvRows = rows.map(r => {
      const dec = decisionMap.get(r.repoId);
      const ev = evalMap.get(r.repoId);
      const score = ev ? computeScore(ev, rubric) : null;
      return [
        qv(r.repoId), qv(r.name), qv(r.platform ?? ''),
        r.fit?.level ?? '', r.health ?? '', r.stars ?? '',
        qv(r.languages?.[0]?.name ?? ''),
        dec?.decision ?? '', dec?.savedAt ? new Date(dec.savedAt).toISOString().slice(0, 10) : '',
        score !== null ? score.toFixed(2) : '',
        rubric.map(c => ev?.scores?.[c.id] ?? '').join(','),
        qv(ev?.note ?? ''), qv(notesMap.get(r.repoId) ?? ''),
        r.savedAt ? new Date(r.savedAt).toISOString().slice(0, 10) : '',
      ].join(',');
    });
    dl(new Blob([[hdr, ...csvRows].join('\n')], { type: 'text/csv' }), `repolens-matrix-${date}.csv`);
  } else {
    const critCols = rubric.map(c => ` ${c.name} |`).join('');
    const hdr = `| Repo | Fit | Health | Stars | Language | Decision | Eval |${critCols} Note |`;
    const sep = `|---|---|---|---|---|---|---|${rubric.map(() => '---|').join('')}---|`;
    const mdRows = rows.map(r => {
      const dec = decisionMap.get(r.repoId);
      const ev = evalMap.get(r.repoId);
      const score = ev ? computeScore(ev, rubric) : null;
      const note = (notesMap.get(r.repoId) || ev?.note || '').slice(0, 60).replace(/\|/g, '\\|');
      return `| [${r.repoId}](https://github.com/${r.repoId}) | ${r.fit?.label ?? '—'} | ${r.health ?? '—'} | ${r.stars ?? '—'} | ${r.languages?.[0]?.name ?? '—'} | ${dec ? (DECISION_META[dec.decision]?.label || dec.decision) : '—'} | ${score !== null ? score.toFixed(1) : '—'} |${rubric.map(c => ` ${ev?.scores?.[c.id] ?? '—'} |`).join('')} ${note} |`;
    });
    dl(new Blob([`# RepoLens Decision Matrix — ${date}\n\n_${rows.length} repos · Generated by RepoLens_\n\n${hdr}\n${sep}\n${mdRows.join('\n')}\n`], { type: 'text/markdown' }), `repolens-matrix-${date}.md`);
  }
  setStatus(`Exported ${rows.length} repos to decision matrix.`);
}

// ─── Discovery mode ───────────────────────────────────────────────────────────

let discoveryOpen = false;

function openDiscovery() {
  const panel = document.getElementById('discover-panel');
  if (!panel) return;
  discoveryOpen = !discoveryOpen;
  panel.classList.toggle('hidden', !discoveryOpen);
  document.getElementById('discover-btn')?.classList.toggle('on', discoveryOpen);
  if (discoveryOpen) {
    document.getElementById('discover-input')?.focus();
    const resultsEl = panel.querySelector('.dc-results');
    if (resultsEl && !resultsEl.firstChild) recommendFromLibrary(resultsEl);
  }
}

async function searchGitHub(query) {
  const res = await fetch(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=12`,
    { headers: { Accept: 'application/vnd.github.v3+json' } }
  );
  if (!res.ok) throw new Error(`GitHub search failed (${res.status})`);
  return (await res.json()).items || [];
}

function showDiscoveryResults(items, resultsEl, heading) {
  const existing = new Set(allRows.map(r => r.repoId));
  const fresh = items.filter(item => !existing.has(item.full_name));
  if (!fresh.length) { resultsEl.innerHTML = '<p class="dc-empty">No new repos found — all results are already in your library.</p>'; return; }
  const stars = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k★' : `${n || 0}★`;
  const cards = fresh.map(item => `
    <div class="dc-card">
      <div class="dc-card-top">
        <span class="dc-name">${esc(item.name)}</span>
        <span class="dc-meta">${stars(item.stargazers_count)}</span>
        ${item.language ? `<span class="dc-lang">${esc(item.language)}</span>` : ''}
      </div>
      <p class="dc-desc">${esc((item.description || '').slice(0, 120))}</p>
      <div class="dc-foot">
        <button class="lib-btn dc-open" data-url="${esc(item.html_url)}">Open &amp; Scan ↗</button>
        <span class="dc-id">${esc(item.full_name)}</span>
      </div>
    </div>`).join('');
  resultsEl.innerHTML = heading ? `<div class="dc-heading">${esc(heading)}</div>${cards}` : cards;
}

async function recommendFromLibrary(resultsEl) {
  if (!resultsEl) resultsEl = document.querySelector('#discover-panel .dc-results');
  if (!resultsEl) return;

  const adopted = allRows.filter(r => { const d = decisionMap.get(r.repoId); return d && (d.decision === 'adopt' || d.decision === 'trial'); });
  if (!adopted.length) {
    resultsEl.innerHTML = '<p class="dc-empty">Adopt or trial some repos to unlock recommendations.</p>';
    return;
  }

  const capFreq = {};
  for (const r of adopted) for (const c of r.capabilities || []) capFreq[c] = (capFreq[c] || 0) + 1;
  const topCaps = Object.entries(capFreq).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => c);

  const langFreq = {};
  for (const r of adopted) { const l = r.languages?.[0]?.name; if (l) langFreq[l] = (langFreq[l] || 0) + 1; }
  const topLang = Object.entries(langFreq).sort((a, b) => b[1] - a[1])[0]?.[0];

  const query = [topCaps.join(' '), topLang ? `language:${topLang}` : ''].filter(Boolean).join(' ') || 'developer tools';
  resultsEl.innerHTML = '<div class="dc-loading">Finding recommendations…</div>';
  try {
    const items = await searchGitHub(query);
    showDiscoveryResults(items, resultsEl, `Recommended from ${adopted.length} adopted/trial repos`);
  } catch (err) {
    resultsEl.innerHTML = `<p class="dc-empty">Recommendation search failed: ${esc(err.message)}</p>`;
  }
}

function getVisibleRows() {
  return applyFilters(allRows, state, { decisionMap, evalMap, rubric, collections, nlFilter });
}

function showQuickWins() {
  const HIGH_FIT = new Set(['strong', 'solid']);
  const wins = allRows.filter((r) => HIGH_FIT.has(r.fit?.level) && !decisionMap.has(r.repoId));
  if (!wins.length) { setStatus('No quick wins found — all strong/solid repos already have a decision.'); return; }
  // Apply as an NL-style filter without a real AI call: reuse the nlFilter infra with a synthetic result.
  nlFilter = { question: `✦ Quick wins (${wins.length} strong/solid, undecided)`, ids: wins.map((r) => r.repoId) };
  state.query = '';
  state.decision = '';
  renderDecisionFilter();
  renderNlFilterBanner();
  render();
  setStatus(`Showing ${wins.length} quick-win repo${wins.length === 1 ? '' : 's'} — strong or solid fit with no decision yet.`);
}

function exportVisible(format) {
  const rows = getVisibleRows();
  if (!rows.length) { setStatus('No visible repos to export.'); return; }
  const date = new Date().toISOString().slice(0, 10);
  const decLabel = (repoId) => {
    const d = decisionMap.get(repoId);
    return d ? ` · **${DECISION_META[d.decision]?.label || d.decision}**` : '';
  };
  const noteText = (repoId) => {
    const n = notesMap.get(repoId);
    return n ? `\n  > ${n.replace(/\n/g, '\n  > ')}` : '';
  };
  const repoLine = (r) => {
    const meta = [
      r.health ? `♥ ${r.health}` : '',
      r.stars >= 1 ? `${r.stars >= 1000 ? (r.stars / 1000).toFixed(1) + 'k' : r.stars}★` : '',
      r.languages[0]?.name || '',
    ].filter(Boolean).join(' · ');
    return `- **[${r.repoId}](https://github.com/${r.repoId})**${decLabel(r.repoId)}${meta ? ` — ${meta}` : ''}\n  ${r.blurb ? r.blurb.slice(0, 120) : ''}${noteText(r.repoId)}`;
  };
  const filter = [
    state.query && `query: "${state.query}"`,
    state.capability && `capability: ${state.capability}`,
    state.collection && `collection: ${collections.find((c) => c.id === state.collection)?.name || state.collection}`,
    state.decision && `decision: ${state.decision}`,
    nlFilter?.question && `AI filter: "${nlFilter.question}"`,
  ].filter(Boolean).join(', ');
  const md = `# RepoLens — Filtered Export (${date})\n\n_${rows.length} repos${filter ? ` · Filters: ${filter}` : ''} · Generated by RepoLens_\n\n---\n\n${rows.map(repoLine).join('\n\n')}\n`;
  const blob = new Blob([md], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `repolens-filtered-${date}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
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

// ─── Quick-decision popover (d key) ──────────────────────────────────────────

const FIT_SUGGESTION = { strong: 'adopt', solid: 'trial', care: 'hold', risky: 'reject' };

function showQuickDecision(repoId, anchorEl) {
  document.getElementById('rl-qdec')?.remove();
  const current = decisionMap.get(repoId)?.decision ?? null;
  const row = allRows.find((r) => r.repoId === repoId);
  const suggested = row?.fit?.level ? (FIT_SUGGESTION[row.fit.level] ?? null) : null;
  const fitLabel = row?.fit?.label ?? '';
  const health = row?.health ?? null;

  const pop = document.createElement('div');
  pop.id = 'rl-qdec';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Quick decision');
  const choices = [
    { key: 'adopt',  label: 'Adopt',  color: '#22c55e' },
    { key: 'trial',  label: 'Trial',  color: '#3b82f6' },
    { key: 'hold',   label: 'Hold',   color: '#f59e0b' },
    { key: 'reject', label: 'Reject', color: '#ef4444' },
  ];
  const veeHint = suggested
    ? `<button class="qdec-vee" data-d="${suggested}" title="Accept Vee's suggestion"><span class="qdec-vee-ic" aria-hidden="true">✦</span><span class="qdec-vee-tier">${esc(DECISION_META[suggested]?.label || suggested)}</span><span class="qdec-vee-why">${esc(fitLabel)}${health ? ` · ♥ ${health}` : ''}</span></button>`
    : '';
  pop.innerHTML = `<p class="qdec-heading">${esc(repoId.replace(/^[^/]+\//, ''))}</p>` +
    veeHint +
    choices.map((c) => {
      const isSuggested = suggested === c.key && current !== c.key;
      return `<button class="qdec-btn${current === c.key ? ' qdec-active' : ''}${isSuggested ? ' qdec-suggested' : ''}" data-d="${c.key}" style="--qdec-color:${c.color}">${c.label}${isSuggested ? '<span class="qdec-sug-mark" aria-label="Vee suggestion"> ✦</span>' : ''}</button>`;
    }).join('') +
    (current ? `<button class="qdec-btn qdec-clear" data-d="">Clear</button>` : '');

  async function pick(d) {
    pop.remove();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('mousedown', onOutside, true);
    if (d) {
      const rec = { repoId, decision: d, savedAt: new Date().toISOString() };
      await saveDecision(rec);
      decisionMap.set(repoId, rec);
    } else {
      const { clearDecision } = await import('./store.js');
      await clearDecision(repoId);
      decisionMap.delete(repoId);
    }
    renderDecisionFilter();
    render();
  }

  pop.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-d]');
    if (!btn) return;
    pick(btn.dataset.d);
  });

  function onKey(e) {
    if (e.key === 'Escape') { pop.remove(); document.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onOutside, true); e.stopPropagation(); }
    const map = { a: 'adopt', t: 'trial', h: 'hold', r: 'reject', c: '' };
    if (e.key in map) { e.preventDefault(); e.stopPropagation(); pick(map[e.key]); }
  }
  function onOutside(e) {
    if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onOutside, true); }
  }

  document.addEventListener('keydown', onKey, true);
  document.addEventListener('mousedown', onOutside, true);

  document.body.appendChild(pop);
  const rect = anchorEl.getBoundingClientRect();
  const pw = pop.offsetWidth || 180, ph = pop.offsetHeight || 140;
  let left = rect.left;
  let top = rect.bottom + 6;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  if (top + ph > window.innerHeight - 8) top = rect.top - ph - 6;
  pop.style.left = `${Math.max(8, left)}px`;
  pop.style.top = `${Math.max(8, top)}px`;
  pop.querySelector('.qdec-btn')?.focus();
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
  const inField = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
  if (inField) return;

  if (e.key === 'j' || e.key === 'k') {
    e.preventDefault();
    const cards = getVisibleCards();
    if (!cards.length) return;
    if (jkIdx === -1) { setJkFocus(0); return; }
    setJkFocus(jkIdx + (e.key === 'j' ? 1 : -1));
    return;
  }
  if (e.key === 'Enter' && jkIdx >= 0) {
    const cards = getVisibleCards();
    cards[jkIdx]?.click();
    return;
  }
  if (e.key === 'Escape' && jkIdx >= 0) {
    e.preventDefault();
    getVisibleCards().forEach((c) => c.classList.remove('jk-active'));
    jkIdx = -1;
    return;
  }
  if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    document.getElementById('search')?.focus();
    return;
  }
  if (jkIdx < 0) return;
  const cards = getVisibleCards();
  const activeCard = cards[jkIdx];
  if (!activeCard) return;
  const repoId = activeCard.dataset.repo;
  if (e.key === 'n') {
    openNote(repoId, activeCard.querySelector('[data-act="note"]'));
  }
  if (e.key === 'c') {
    activeCard.querySelector('[data-act="compare"]')?.click();
  }
  if (e.key === 'p') {
    const pinBtn = activeCard.querySelector('[data-act="pin"]');
    if (pinBtn) pinBtn.click();
  }
  if (e.key === 'd') {
    e.preventDefault();
    showQuickDecision(repoId, activeCard);
  }
  if (e.key === 'o') {
    e.preventDefault();
    const row = allRows.find((r) => r.repoId === repoId);
    if (row) window.open(sourceUrl(row), '_blank', 'noopener');
  }
  if (e.key === 'r') {
    e.preventDefault();
    rescan(repoId);
  }
  if (e.key === 'e') {
    e.preventDefault();
    const evalBtn = activeCard.querySelector('[data-act="eval"]');
    showEvalPanel(repoId, evalBtn || activeCard);
  }
});

// ─── Evaluations Workbench ────────────────────────────────────────────────────

function showEvalPanel(repoId, anchorEl) {
  document.getElementById('rl-eval-panel')?.remove();
  const entry = evalMap.get(repoId) ?? { scores: {}, note: '' };
  const row = allRows.find((r) => r.repoId === repoId);
  const name = row?.name || repoId;

  const pop = document.createElement('div');
  pop.id = 'rl-eval-panel';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', `Evaluate ${name}`);

  const criteriaHtml = rubric.map((crit) => {
    const score = entry.scores[crit.id] ?? 0;
    const stars = [1, 2, 3, 4, 5].map((v) =>
      `<button class="ep-star${v <= score ? ' active' : ''}" data-crit="${esc(crit.id)}" data-val="${v}" aria-label="${v}/5">${v <= score ? '★' : '☆'}</button>`
    ).join('');
    return `<div class="ep-row"><span class="ep-crit">${esc(crit.name)}</span><span class="ep-stars">${stars}</span></div>`;
  }).join('');

  const scoreAvg = computeScore(entry, rubric);

  pop.innerHTML = `
    <div class="ep-header">
      <span class="ep-title">▣ Evaluate</span>
      <span class="ep-name">${esc(name)}</span>
      ${scoreAvg !== null ? `<span class="ep-avg">${scoreAvg.toFixed(1)}/5</span>` : ''}
    </div>
    <div class="ep-criteria">${criteriaHtml}</div>
    <textarea class="ep-note" placeholder="Note (optional)…" rows="2">${esc(entry.note || '')}</textarea>
    <div class="ep-footer">
      <button class="ep-save">Save</button>
      ${evalMap.has(repoId) ? `<button class="ep-clear">Clear</button>` : ''}
    </div>`;

  document.body.appendChild(pop);

  // Position near anchor
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const W = 280;
    let left = rect.left;
    if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;
    pop.style.left = `${Math.max(8, left)}px`;
    pop.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 280)}px`;
  }

  // Star clicks — update entry scores live
  pop.addEventListener('click', (e) => {
    const star = e.target.closest('.ep-star');
    if (star) {
      const crit = star.dataset.crit;
      const val = Number(star.dataset.val);
      entry.scores[crit] = entry.scores[crit] === val ? 0 : val;
      // Re-render stars for this criterion
      pop.querySelectorAll(`.ep-star[data-crit="${crit}"]`).forEach((s) => {
        const sv = Number(s.dataset.val);
        const on = sv <= (entry.scores[crit] || 0);
        s.classList.toggle('active', on);
        s.textContent = on ? '★' : '☆';
      });
      // Update avg display
      const newAvg = computeScore(entry, rubric);
      const avgEl = pop.querySelector('.ep-avg');
      if (avgEl) avgEl.textContent = newAvg !== null ? `${newAvg.toFixed(1)}/5` : '';
      else if (newAvg !== null) {
        pop.querySelector('.ep-header').insertAdjacentHTML('beforeend', `<span class="ep-avg">${newAvg.toFixed(1)}/5</span>`);
      }
    }
  });

  pop.querySelector('.ep-save')?.addEventListener('click', async () => {
    entry.note = pop.querySelector('.ep-note')?.value || '';
    await saveEval(repoId, entry);
    evalMap.set(repoId, { ...entry, savedAt: new Date().toISOString() });
    pop.remove();
    render();
  });

  pop.querySelector('.ep-clear')?.addEventListener('click', async () => {
    await clearEval(repoId);
    evalMap.delete(repoId);
    pop.remove();
    render();
  });

  // Dismiss on outside click
  const dismiss = (e) => { if (!pop.contains(e.target) && e.target !== anchorEl) { pop.remove(); document.removeEventListener('mousedown', dismiss); } };
  setTimeout(() => document.addEventListener('mousedown', dismiss), 50);

  // Esc key
  pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { pop.remove(); document.removeEventListener('mousedown', dismiss); } });
}

async function editRubric() {
  const current = rubric.map((c) => c.name).join('\n');
  const input = prompt(`Rubric criteria (one per line, max 6):\n\n${current}`);
  if (input === null) return;
  const names = input.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 6);
  if (!names.length) return;
  // Preserve existing ids by name match; new names get generated ids.
  const newRubric = names.map((name) => {
    const existing = rubric.find((c) => c.name === name);
    return existing ?? { id: name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20), name, weight: 1 };
  });
  rubric = newRubric;
  await saveRubric(rubric);
  setStatus('Rubric updated.');
}

// ─── Auto-decide from Vee ─────────────────────────────────────────────────────

async function applyVeeSuggestions() {
  const undecided = allRows.filter((r) => r.fit.level !== 'unrated' && !decisionMap.has(r.repoId));
  if (!undecided.length) { setStatus('All rated repos already have a decision.'); return; }
  const now = new Date().toISOString();
  setStatus(`Applying Vee's suggestions to ${undecided.length} repos…`);
  for (const row of undecided) {
    const decision = FIT_SUGGESTION[row.fit.level];
    if (!decision) continue;
    const rec = { repoId: row.repoId, decision, savedAt: now };
    await saveDecision(rec);
    decisionMap.set(row.repoId, rec);
  }
  renderDecisionFilter();
  renderStats();
  render();
  setStatus(`Vee auto-decided ${undecided.length} repo${undecided.length === 1 ? '' : 's'}.`);
}

// ─── Saved filters ────────────────────────────────────────────────────────────

function currentFilterSnapshot() {
  return { query: state.query, sort: state.sort, capability: state.capability, collection: state.collection, decision: state.decision, lang: state.lang };
}

async function saveCurrentFilter(name) {
  savedFilters = savedFilters.filter((f) => f.name !== name);
  savedFilters.push({ name, snapshot: currentFilterSnapshot() });
  await chrome.storage.local.set({ [SAVED_FILTERS_KEY]: savedFilters });
}

async function deleteSavedFilter(name) {
  savedFilters = savedFilters.filter((f) => f.name !== name);
  await chrome.storage.local.set({ [SAVED_FILTERS_KEY]: savedFilters });
}

function applySavedFilter(f) {
  Object.assign(state, f.snapshot);
  const sortEl = document.getElementById('sort');
  if (sortEl) sortEl.value = state.sort || 'fit';
  const langEl = document.getElementById('lang-filter');
  if (langEl) langEl.value = state.lang || '';
  nlFilter = null;
  renderDecisionFilter();
  renderNlFilterBanner();
  render();
}

// ─── Library palette ─────────────────────────────────────────────────────────

function initLibraryPalette() {
  const commands = [
    { section: 'Filter by decision', name: 'Show: All decisions', action: () => { state.decision = ''; renderDecisionFilter(); render(); } },
    { name: 'Show: Adopt only', action: () => { state.decision = 'adopt'; renderDecisionFilter(); render(); } },
    { name: 'Show: Trial only', action: () => { state.decision = 'trial'; renderDecisionFilter(); render(); } },
    { name: 'Show: Hold only', action: () => { state.decision = 'hold'; renderDecisionFilter(); render(); } },
    { name: 'Show: Rejected only', action: () => { state.decision = 'reject'; renderDecisionFilter(); render(); } },
    { name: 'Show: Undecided only', action: () => { state.decision = 'undecided'; renderDecisionFilter(); render(); } },
    { name: '✦ Quick wins — strong/solid fit, no decision', description: 'Surface your easiest triage calls first', action: () => { showQuickWins(); } },
    { name: '⚠ Needs attention — risky/care, no decision', description: 'Repos with poor fit that still need a Hold or Reject decision', action: () => {
      const ids = allRows.filter((r) => (r.fit.level === 'risky' || r.fit.level === 'care') && !decisionMap.has(r.repoId)).map((r) => r.repoId);
      nlFilter = ids.length
        ? { question: `Needs attention (${ids.length} risky/care, undecided)`, ids }
        : { question: 'Needs attention', ids: [], error: 'All risky/care repos already have a decision — great triage!' };
      render();
    } },
    { name: '↕ Show: Fit changed since last scan', description: 'Repos whose fit verdict improved or regressed after a re-scan', action: () => {
      const ids = allRows.filter((r) => r.fitDelta).map((r) => r.repoId);
      nlFilter = ids.length
        ? { question: 'Fit changed since last scan', ids }
        : { question: 'Fit changed since last scan', ids: [], error: 'No fit changes yet — re-scan repos to track deltas' };
      render();
    } },
    { section: 'Sort', name: 'Sort: Best fit', action: () => { state.sort = 'fit'; document.getElementById('sort').value = 'fit'; chrome.storage.local.set({ librarySort: 'fit' }); render(); } },
    { name: 'Sort: Health', action: () => { state.sort = 'health'; document.getElementById('sort').value = 'health'; chrome.storage.local.set({ librarySort: 'health' }); render(); } },
    { name: 'Sort: Recently scanned', action: () => { state.sort = 'recent'; document.getElementById('sort').value = 'recent'; chrome.storage.local.set({ librarySort: 'recent' }); render(); } },
    { name: 'Sort: Stars', action: () => { state.sort = 'stars'; document.getElementById('sort').value = 'stars'; chrome.storage.local.set({ librarySort: 'stars' }); render(); } },
    { name: 'Sort: Name', action: () => { state.sort = 'name'; document.getElementById('sort').value = 'name'; chrome.storage.local.set({ librarySort: 'name' }); render(); } },
    { name: 'Sort: Recently decided', action: () => { state.sort = 'decided'; document.getElementById('sort').value = 'decided'; chrome.storage.local.set({ librarySort: 'decided' }); render(); } },
    { name: 'Sort: Fit changed', description: 'Repos with fit delta (improved or regressed) at the top', action: () => { state.sort = 'delta'; document.getElementById('sort').value = 'delta'; chrome.storage.local.set({ librarySort: 'delta' }); render(); } },
    { name: 'Sort: Eval score', description: 'Repos with highest evaluation score at the top', action: () => { state.sort = 'eval'; document.getElementById('sort').value = 'eval'; chrome.storage.local.set({ librarySort: 'eval' }); render(); } },
    { section: 'Evaluations', name: '▣ Evaluate focused repo', description: 'Open the scoring panel for the focused card (or press e)', action: () => {
      const cards = getVisibleCards();
      if (jkIdx < 0 || !cards[jkIdx]) { setStatus('Focus a card first (j/k) then press e, or use the ▣ button on a card.'); return; }
      const repoId = cards[jkIdx].dataset.repo;
      showEvalPanel(repoId, cards[jkIdx].querySelector('[data-act="eval"]') || cards[jkIdx]);
    } },
    { name: '▣ Edit rubric criteria', description: 'Change the scoring criteria used by the Evaluations Workbench', action: () => editRubric() },
    { name: '▣ Show: Evaluated repos only', description: 'Filter to repos with at least one eval score', action: () => {
      const ids = allRows.filter((r) => evalMap.has(r.repoId)).map((r) => r.repoId);
      nlFilter = ids.length
        ? { question: `Evaluated (${ids.length} repos)`, ids }
        : { question: 'Evaluated repos', ids: [], error: 'No evaluations yet — press e on a focused card to score a repo' };
      render();
    } },
    { section: 'View', name: 'Tech Radar', description: 'Organize repos by Adopt/Trial/Hold/Reject decision', action: () => { if (state.view !== 'radar') toggleRadarView(); } },
    { name: 'List view', description: 'Default card grid', action: () => { if (state.view !== 'list') toggleRadarView(); } },
    { section: 'Pins', name: 'Unpin all', description: 'Remove all pinned repos from the top section', action: async () => { pinned.clear(); await chrome.storage.local.set({ repolens_pinned: [] }); render(); } },
    { section: 'Actions', name: 'Auto-organize by language', description: 'Group repos into language collections', action: () => autoOrganize() },
    { name: 'Re-scan all stale (30+ days)', description: 'Open Batch Scan pre-filled with repos not scanned in 30 days', action: () => refreshStale() },
    { name: '⟳ Show: Stale only', description: 'Filter to repos not scanned in 30 days', action: () => {
      const ids = allRows.filter((r) => r.savedAt && (Date.now() - Date.parse(r.savedAt)) > 30 * 86_400_000).map((r) => r.repoId);
      nlFilter = ids.length
        ? { question: 'Stale (not scanned in 30 days)', ids }
        : { question: 'Stale repos', ids: [], error: 'No stale repos — all scans are under 30 days old' };
      render();
    } },
    { name: 'Batch Scan', description: 'Scan multiple repos at once', action: () => chrome.tabs.create({ url: chrome.runtime.getURL('batch.html') }) },
    { name: 'Export visible repos (Markdown)', description: 'Download only the currently filtered repos as Markdown', action: () => exportVisible('md') },
    { name: 'Export Library (Markdown)', description: 'Download library as a readable Markdown report', action: () => exportDigest('md') },
    { name: 'Export Digest (JSON)', description: 'Download library as JSON', action: () => exportDigest('json') },
    { name: 'Export Digest (CSV)', description: 'Download library as CSV', action: () => exportDigest('csv') },
    { name: '⊞ Export Decision Matrix (CSV)', description: 'Full matrix: fit, health, decision, eval score, rubric criteria, notes', action: () => exportDecisionMatrix('csv') },
    { name: '⊞ Export Decision Matrix (Markdown)', description: 'Same as CSV but formatted as a Markdown table', action: () => exportDecisionMatrix('md') },
    { name: 'Export Backup', description: 'Full library backup', action: () => exportLibrary() },
    { name: '🔍 Discover repos', description: 'Search GitHub and get recommendations based on your library', action: () => openDiscovery() },
    { name: 'Import Backup', description: 'Restore from a backup file', action: () => pickImportFile() },
    { section: 'Saved filters', name: '★ Save current filter…', description: 'Bookmark this filter combo by name', action: async () => {
      const name = prompt('Name this filter:');
      if (!name?.trim()) return;
      await saveCurrentFilter(name.trim());
      setStatus(`Filter saved: "${name.trim()}"`);
    } },
    { name: 'Select mode', description: 'Select repos for bulk actions', action: () => setSelectionMode(!selectionMode) },
    { section: 'Vee', name: '✦ Auto-decide all undecided (Vee)', description: 'Apply Vee\'s fit-based suggestion to every undecided rated repo', action: () => applyVeeSuggestions() },
    { name: 'Open Settings', action: () => chrome.runtime.openOptionsPage() },
  ];

  function getCommands() {
    if (!savedFilters.length) return commands;
    const filterCmds = savedFilters.map((f) => ({
      name: `★ ${f.name}`,
      description: [f.snapshot.decision && `decision: ${f.snapshot.decision}`, f.snapshot.lang && `lang: ${f.snapshot.lang}`, f.snapshot.query && `"${f.snapshot.query}"`].filter(Boolean).join(' · ') || 'saved filter',
      action: () => applySavedFilter(f),
    }));
    const deleteCmds = savedFilters.map((f) => ({
      name: `Delete saved filter: ${f.name}`,
      action: async () => { await deleteSavedFilter(f.name); setStatus(`Deleted filter "${f.name}"`); },
    }));
    // Insert saved filter commands right before the 'Save current filter…' entry
    const saveIdx = commands.findIndex((c) => c.name === '★ Save current filter…');
    return [...commands.slice(0, saveIdx), ...filterCmds, ...deleteCmds, ...commands.slice(saveIdx)];
  }

  initPalette(getCommands);
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
    chrome.storage.local.get(['librarySort', 'mascotEnabled', 'repolens_pinned', SAVED_FILTERS_KEY]).catch(() => ({})),
    listCollections().catch(() => []),
    listDecisions().catch(() => []),
  ]);
  decisionMap = new Map(savedDecisions.map((d) => [d.repoId, d]));
  pinned = new Set(Array.isArray(prefs?.repolens_pinned) ? prefs.repolens_pinned : []);
  savedFilters = Array.isArray(prefs?.[SAVED_FILTERS_KEY]) ? prefs[SAVED_FILTERS_KEY] : [];

  // Load evaluations workbench data in parallel with the rest of init.
  [rubric, evalMap] = await Promise.all([loadRubric(), listEvals()]);

  // Load user notes keyed by repoId
  try {
    const allLocal = await chrome.storage.local.get(null);
    for (const [k, v] of Object.entries(allLocal)) {
      if (k.startsWith('repolens_note_') && typeof v === 'string' && v.trim()) {
        notesMap.set(k.slice('repolens_note_'.length), v.trim());
      }
    }
  } catch { /* best-effort */ }
  // Drift alert: show banner if background worker found stale repos
  chrome.storage.local.get('repolens_drift').then(({ repolens_drift: drift }) => {
    if (drift?.staleCount && !sessionStorage.getItem('drift_dismissed')) {
      const banner = document.getElementById('drift-banner');
      const msg = banner?.querySelector('.drift-msg');
      if (banner && msg) { msg.textContent = `${drift.staleCount} repos haven't been scanned in 14+ days.`; banner.classList.remove('hidden'); }
    }
  }).catch(() => {});

  if (prefs?.librarySort) state.sort = prefs.librarySort;
  if (prefs?.libraryDensity === 'compact') {
    document.getElementById('grid')?.classList.add('density-compact');
    const btn = document.getElementById('density-toggle');
    if (btn) { btn.textContent = '⊞'; btn.classList.add('on'); btn.title = 'Switch to comfortable view'; }
  }
  const mascotOn = prefs?.mascotEnabled !== false; // default on
  collections = savedCollections;
  cacheByRepo = new Map(cachedList.filter((c) => c && c.repoId).map((c) => [c.repoId, c]));

  // Saved-library rows win (richer capabilities); local cache fills the gaps (repos
  // scanned with auto-save off) and supplies a blurb for older payloads.
  snapsByRepo = await listAllSnapshots();
  const savedRows = points.map((p) => libraryRow(p.payload));
  const cacheRows = cachedList.filter((c) => c && c.repoId).map((c) => libraryRow(c));
  allRows = mergeRows(savedRows, cacheRows).map((r) => {
    const cached = cacheByRepo.get(r.repoId);
    const searchParts = [cached?.eli5, cached?.technical, (cached?.use_cases || []).join(' ')].filter(Boolean);
    return {
      ...r,
      hasCache: !!cached,
      blurb: r.blurb || cached?.description || '',
      searchText: searchParts.join(' '),
    };
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
  // Pre-fill search from URL hash (e.g., library.html#search=owner/repo)
  const hashSearch = new URLSearchParams(location.hash.slice(1)).get('search');
  if (hashSearch && document.getElementById('search')) {
    state.query = hashSearch;
    document.getElementById('search').value = hashSearch;
  }

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
    if (nlFilter) { nlFilter = null; renderNlFilterBanner(); }
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 180); // debounce: don't re-render the whole grid on every keystroke
  });
  searchEl.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const val = searchEl.value.trim();
    if (!val) return;
    // If the user typed a URL, open it to trigger analysis instead of searching
    const detected = detectPlatform(val.startsWith('http') ? val : `https://${val}`);
    if (detected) {
      e.preventDefault();
      const platformUrls = {
        github: `https://github.com/${detected.repoId}`,
        gitlab: `https://gitlab.com/${detected.repoId}`,
        npm: `https://www.npmjs.com/package/${detected.repoId}`,
        pypi: `https://pypi.org/project/${detected.repoId}`,
      };
      chrome.tabs.create({ url: platformUrls[detected.platform] || val });
      searchEl.value = '';
      state.query = '';
      return;
    }
    // NL filter: "?" prefix routes to AI ranking
    if (val.startsWith('?')) {
      e.preventDefault();
      const question = val.slice(1).trim();
      if (!question) return;
      nlFilter = { question, ids: null }; // loading state
      renderNlFilterBanner();
      const docs = buildAskDocs();
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'FILTER_LIBRARY', question, docs });
        nlFilter = { question, ids: resp?.ok ? (resp.ids || []) : [], error: resp?.error };
      } catch (err) {
        nlFilter = { question, ids: [], error: err?.message || 'Filter failed' };
      }
      state.query = '';
      searchEl.value = '';
      renderNlFilterBanner();
      render();
    }
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

  const langSel = document.getElementById('lang-filter');
  if (langSel) {
    // Populate from allRows — sorted by frequency descending.
    const freq = new Map();
    for (const r of allRows) {
      const l = r.language || r.languages?.[0]?.name;
      if (l) freq.set(l, (freq.get(l) || 0) + 1);
    }
    const langs = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    langs.forEach(([lang]) => {
      const opt = document.createElement('option');
      opt.value = lang;
      opt.textContent = lang;
      langSel.appendChild(opt);
    });
    langSel.addEventListener('change', (e) => {
      state.lang = e.target.value;
      render();
    });
  }
}

init();
