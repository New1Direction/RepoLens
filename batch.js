// Batch Scan page — paste URLs, watch them scan one by one.
import { initTheme } from './theme.js';

initTheme();

const textarea = document.getElementById('batch-urls');
const scanBtn = document.getElementById('scan-btn');
const clearBtn = document.getElementById('clear-btn');
const countEl = document.getElementById('url-count');
const progressEl = document.getElementById('progress');
const batchRowsEl = document.getElementById('batch-rows');
const progCountEl = document.getElementById('prog-count');
const doneBar = document.getElementById('done-bar');
const doneMsg = document.getElementById('done-msg');

let sessionKey = null;
let polling = false;

// ─── URL parsing ────────────────────────────────────────────────────────────

function parseUrls(raw) {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && (l.startsWith('http') || l.startsWith('https')));
}

// ─── Input handling ──────────────────────────────────────────────────────────

function updateCount() {
  const urls = parseUrls(textarea.value);
  const n = urls.length;
  countEl.textContent = n ? `${n} URL${n === 1 ? '' : 's'}` : '';
  scanBtn.disabled = n < 1;
  scanBtn.textContent = n ? `Scan ${n} repo${n === 1 ? '' : 's'}` : 'Scan';
}

textarea.addEventListener('input', updateCount);

// Pre-fill from library "Refresh stale" button
chrome.storage.session.get('repolens_batch_prefill').then(({ repolens_batch_prefill }) => {
  if (!repolens_batch_prefill?.length) return;
  chrome.storage.session.remove('repolens_batch_prefill');
  textarea.value = repolens_batch_prefill.join('\n');
  updateCount();
}).catch(() => {});

clearBtn.addEventListener('click', () => {
  textarea.value = '';
  updateCount();
  progressEl.style.display = 'none';
  doneBar.style.display = 'none';
  batchRowsEl.innerHTML = '';
  sessionKey = null;
  polling = false;
});

// ─── Rendering ───────────────────────────────────────────────────────────────

const STATUS_ICON = { queued: '·', scanning: null, done: '✓', error: '✕' };
const STATUS_LABEL = { queued: 'queued', scanning: 'scanning…', done: 'saved', error: 'failed' };
const FIT_LABELS = { strong: 'Strong', solid: 'Solid', care: 'Care', risky: 'Risky' };

function rowHtml(item, idx) {
  const icon = STATUS_ICON[item.status] ?? '';
  const isScanning = item.status === 'scanning';
  const iconHtml = isScanning
    ? '<span class="row-dot"></span>'
    : `<span class="row-icon">${icon}</span>`;
  const label = STATUS_LABEL[item.status] ?? item.status;
  const fitHtml = item.fit ? `<span class="row-fit fit-${item.fit}">${FIT_LABELS[item.fit] ?? item.fit}</span>` : '';
  const errHtml = item.error ? `<span class="row-status" style="color:var(--bad-ink)">${item.error.slice(0, 60)}</span>` : '';
  const displayId = item.repoId || item.url?.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') || `#${idx + 1}`;
  return `<div class="batch-row ${item.status}" data-idx="${idx}">
    ${iconHtml}
    <span class="row-id" title="${displayId}">${displayId}</span>
    ${fitHtml || errHtml || `<span class="row-status">${label}</span>`}
  </div>`;
}

function renderRows(items) {
  batchRowsEl.innerHTML = items.map((item, i) => rowHtml(item, i)).join('');
}

function renderDone(items) {
  const done = items.filter((i) => i.status === 'done').length;
  const errors = items.filter((i) => i.status === 'error').length;
  const parts = [`${done} repo${done === 1 ? '' : 's'} saved`];
  if (errors) parts.push(`${errors} failed`);
  doneMsg.textContent = parts.join(', ') + '.';
  doneBar.style.display = 'flex';
}

// ─── Polling ─────────────────────────────────────────────────────────────────

async function poll(key) {
  polling = true;
  const deadline = Date.now() + 300_000; // 5 min hard cap
  while (polling && Date.now() < deadline) {
    const stored = await chrome.storage.session.get(key).catch(() => ({}));
    const data = stored[key];
    if (!data) { await sleep(500); continue; }

    const items = data.items || [];
    const done = items.filter((i) => i.status !== 'queued' && i.status !== 'scanning').length;
    progCountEl.textContent = `${done} / ${items.length}`;
    renderRows(items);

    if (data.done) {
      progressEl.querySelector('.progress-title').textContent = 'Done';
      renderDone(items);
      polling = false;
      return;
    }
    await sleep(500);
  }
  polling = false;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ─── Start scan ──────────────────────────────────────────────────────────────

scanBtn.addEventListener('click', async () => {
  const urls = parseUrls(textarea.value);
  if (!urls.length) return;

  // Disable input during scan
  textarea.disabled = true;
  scanBtn.disabled = true;
  clearBtn.disabled = true;
  doneBar.style.display = 'none';

  // Show progress immediately with all items queued
  const initItems = urls.map((url) => ({ url, status: 'queued', fit: null, error: null }));
  renderRows(initItems);
  progCountEl.textContent = `0 / ${urls.length}`;
  progressEl.style.display = 'block';

  // Send to background
  sessionKey = 'repolens_batch_' + crypto.randomUUID();
  await chrome.storage.session.set({ [sessionKey]: { type: 'batch', total: urls.length, items: initItems, done: false } });

  chrome.runtime.sendMessage({ type: 'BATCH_SCAN', sessionKey, urls }).catch(() => {});

  await poll(sessionKey);

  // Re-enable input
  textarea.disabled = false;
  clearBtn.disabled = false;
  updateCount();
});
