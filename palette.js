// Command palette — Cmd/K (Mac) or Ctrl+K (Win/Linux) opens a fuzzy-search
// panel over any RepoLens page.
//
// Usage:
//   import { initPalette } from './palette.js';
//   initPalette([
//     { name: 'Open Library', description: 'Browse your saved repos', action: () => ... },
//     { name: 'Run Maintenance', section: 'Lenses', action: () => ... },
//   ]);
//
// Command shape:
//   { name, description?, shortcut?, section?, action }
//   section groups commands under a labelled separator.

const _esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function _fuzzy(needle, haystack) {
  if (!needle) return true;
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  let ni = 0;
  for (let i = 0; i < h.length && ni < n.length; i++) {
    if (h[i] === n[ni]) ni++;
  }
  return ni === n.length;
}

function _matches(cmd, q) {
  return _fuzzy(q, cmd.name) || (cmd.description && _fuzzy(q, cmd.description));
}

export function initPalette(commands) {
  if (document.getElementById('palette-overlay')) return; // already mounted

  const overlay = document.createElement('div');
  overlay.id = 'palette-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Command palette');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <div id="palette-modal">
      <input id="palette-input" type="text" placeholder="Type a command…" autocomplete="off" spellcheck="false"
             aria-label="Search commands" aria-autocomplete="list" aria-controls="palette-list">
      <div id="palette-list" role="listbox"></div>
      <div id="palette-footer">
        <span>↑↓ navigate</span>
        <span>↵ run</span>
        <span>Esc close</span>
        <kbd>⌘K</kbd>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  let isOpen = false;
  let filtered = [...commands];
  let selIdx = 0;

  function _renderList(q = '') {
    filtered = q ? commands.filter((c) => _matches(c, q)) : [...commands];
    if (selIdx >= filtered.length) selIdx = 0;

    const list = document.getElementById('palette-list');
    if (!list) return;

    if (!filtered.length) {
      list.innerHTML = '<div class="pl-empty">No commands match</div>';
      return;
    }

    let lastSection = null;
    list.innerHTML = filtered.map((c, i) => {
      let sectionHtml = '';
      if (c.section && c.section !== lastSection) {
        lastSection = c.section;
        sectionHtml = `<div class="pl-section">${_esc(c.section)}</div>`;
      }
      return `${sectionHtml}<div class="pl-item${i === selIdx ? ' pl-selected' : ''}" data-idx="${i}" role="option" aria-selected="${i === selIdx}">
        <span class="pl-name">${_esc(c.name)}</span>
        ${c.description ? `<span class="pl-desc">${_esc(c.description)}</span>` : ''}
        ${c.shortcut ? `<kbd class="pl-shortcut">${_esc(c.shortcut)}</kbd>` : ''}
      </div>`;
    }).join('');
  }

  function _scrollSelected() {
    document.querySelector(`#palette-list .pl-item[data-idx="${selIdx}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  function _moveSel(delta) {
    selIdx = Math.max(0, Math.min(selIdx + delta, filtered.length - 1));
    document.querySelectorAll('#palette-list .pl-item').forEach((el, i) => {
      el.classList.toggle('pl-selected', i === selIdx);
      el.setAttribute('aria-selected', String(i === selIdx));
    });
    _scrollSelected();
  }

  function _open() {
    isOpen = true;
    overlay.classList.add('visible');
    const input = document.getElementById('palette-input');
    if (input) { input.value = ''; input.focus(); }
    selIdx = 0;
    _renderList('');
  }

  function _close() {
    isOpen = false;
    overlay.classList.remove('visible');
  }

  function _run() {
    const cmd = filtered[selIdx];
    if (cmd?.action) { _close(); cmd.action(); }
  }

  // Global shortcut: Cmd/Ctrl+K (not when focused on a form element)
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      if (!e.target.matches('input, textarea, select')) {
        e.preventDefault();
        isOpen ? _close() : _open();
      }
      return;
    }
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); _close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); _moveSel(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); _moveSel(-1); return; }
    if (e.key === 'Enter') { e.preventDefault(); _run(); return; }
  });

  // Click backdrop to close
  overlay.addEventListener('click', (e) => { if (e.target === overlay) _close(); });

  // Click an item to run
  document.getElementById('palette-list')?.addEventListener('click', (e) => {
    const item = e.target.closest('.pl-item');
    if (!item) return;
    selIdx = parseInt(item.dataset.idx, 10) || 0;
    _run();
  });

  // Filter as the user types
  document.getElementById('palette-input')?.addEventListener('input', (e) => {
    selIdx = 0;
    _renderList(e.target.value.trim());
  });
}
