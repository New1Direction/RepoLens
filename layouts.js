// Shared layout primitives for lens results. Each returns an HTML string with all
// dynamic values escaped; empty/invalid input returns '' (renders nothing), matching
// the diagram.js convention. CSS for every `lk-*` class lives in output-tab.html.

import { esc } from './format.js';

// spine(items): items = [{ marker, label, body, kind? }] — a connected vertical sequence.
export function spine(items) {
  const rows = (items || []).filter((i) => i && (i.label || i.body || i.marker));
  if (!rows.length) return '';
  return `<div class="lk-spine">${rows
    .map(
      (i) => `
    <div class="lk-spine-row${i.kind ? ' lk-' + esc(i.kind) : ''}">
      <div class="lk-spine-marker">${esc(i.marker ?? '')}</div>
      <div class="lk-spine-main">
        ${i.label ? `<div class="lk-spine-label">${esc(i.label)}</div>` : ''}
        ${i.body ? `<div class="lk-spine-body">${esc(i.body)}</div>` : ''}
      </div>
    </div>`
    )
    .join('')}</div>`;
}

// flow(nodes): nodes = [{ label, body, kind?, note? }] — node → node → node with arrows.
export function flow(nodes) {
  const ns = (nodes || []).filter((n) => n && (n.label || n.body));
  if (!ns.length) return '';
  return `<div class="lk-flow">${ns
    .map(
      (n, idx) => `
    ${idx ? '<div class="lk-flow-arrow">↓</div>' : ''}
    <div class="lk-flow-node${n.kind ? ' lk-' + esc(n.kind) : ''}">
      ${n.label ? `<div class="lk-flow-label">${esc(n.label)}</div>` : ''}
      ${n.body ? `<div class="lk-flow-body">${esc(n.body)}</div>` : ''}
      ${n.note ? `<div class="lk-flow-note">${esc(n.note)}</div>` : ''}
    </div>`
    )
    .join('')}</div>`;
}

// ranked(rows): rows = [{ label, weight (0..100), body }] — scored rows with bars.
export function ranked(rows) {
  const rs = (rows || []).filter((r) => r && (r.label || r.body));
  if (!rs.length) return '';
  return `<div class="lk-ranked">${rs
    .map((r) => {
      const w = Math.max(0, Math.min(100, Number(r.weight) || 0));
      const wlabel =
        r.weight !== undefined && r.weight !== null && r.weight !== ''
          ? `<span class="lk-ranked-w">${esc(String(r.weight))}</span>`
          : '';
      return `<div class="lk-ranked-row">
      <div class="lk-ranked-head"><span class="lk-ranked-label">${esc(r.label ?? '')}</span>${wlabel}</div>
      <div class="lk-ranked-track"><div class="lk-ranked-fill" style="width:${w}%"></div></div>
      ${r.body ? `<div class="lk-ranked-body">${esc(r.body)}</div>` : ''}
    </div>`;
    })
    .join('')}</div>`;
}

// matrix2x2(spec): spec = { axes?: {x,y}, cells: [{label,sub?,items?}]×4 } — a true 2×2 grid.
export function matrix2x2(spec) {
  const cells = (spec && spec.cells) || [];
  if (cells.length < 4) return '';
  const ax = (spec && spec.axes) || {};
  const cell = (c) => `<div class="lk-quad">
    <div class="lk-quad-label">${esc(c.label ?? '')}</div>
    ${c.sub ? `<div class="lk-quad-sub">${esc(c.sub)}</div>` : ''}
    ${c.items && c.items.length ? `<ul class="lk-quad-list">${c.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  </div>`;
  return `<div class="lk-matrix-wrap">
    ${ax.x ? `<div class="lk-axis-x">${esc(ax.x)} →</div>` : ''}
    <div class="lk-matrix">${cells.slice(0, 4).map(cell).join('')}</div>
  </div>`;
}

// optionMatrix(axes, combos): axes = [{axis, options[]}], combos = [{picks[], concept}].
export function optionMatrix(axes, combos) {
  const ax = (axes || []).filter((a) => a && a.axis);
  if (!ax.length) return '';
  const axRows = ax
    .map(
      (a) => `<div class="lk-om-row">
    <div class="lk-om-axis">${esc(a.axis)}</div>
    <div class="lk-om-opts">${(a.options || []).map((o) => `<span class="lk-om-opt">${esc(o)}</span>`).join('')}</div>
  </div>`
    )
    .join('');
  const comboCards = (combos || [])
    .filter((c) => c && (c.concept || (c.picks || []).length))
    .map(
      (c) => `<div class="lk-om-combo">
      <div class="lk-om-picks">${(c.picks || []).map(esc).join(' + ')}</div>
      <div class="lk-om-concept">${esc(c.concept ?? '')}</div>
    </div>`
    )
    .join('');
  return `<div class="lk-om">${axRows}</div>${comboCards ? `<div class="lk-om-cards">${comboCards}</div>` : ''}`;
}
