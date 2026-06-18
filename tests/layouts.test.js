import { describe, it, expect } from 'vitest';
import { spine, flow, ranked } from '../layouts.js';

describe('layouts: spine', () => {
  it('empty input → empty string', () => {
    expect(spine([])).toBe('');
    expect(spine(null)).toBe('');
  });
  it('one row per item, escaped', () => {
    const html = spine([
      { marker: 'S', label: 'Substitute', body: 'swap <x> for y' },
      { marker: 'C', label: 'Combine', body: 'merge' },
    ]);
    expect((html.match(/lk-spine-row/g) || []).length).toBe(2);
    expect(html).toContain('&lt;x&gt;'); // body escaped
    expect(html).toContain('lk-spine-marker');
  });
  it('kind adds a modifier class', () => {
    expect(spine([{ marker: '✕', label: 'wall', kind: 'wall', body: 'b' }])).toContain('lk-wall');
  });
});

describe('layouts: flow', () => {
  it('empty → empty string', () => {
    expect(flow([])).toBe('');
  });
  it('N nodes → N node blocks and N-1 arrows', () => {
    const html = flow([
      { label: 'A', body: '1' },
      { label: 'B', body: '2' },
      { label: 'C', body: '3' },
    ]);
    expect((html.match(/lk-flow-node/g) || []).length).toBe(3);
    expect((html.match(/lk-flow-arrow/g) || []).length).toBe(2);
  });
  it('escapes and renders an optional note', () => {
    const html = flow([{ label: 'A', body: 'b', note: 'rides <z>' }]);
    expect(html).toContain('lk-flow-note');
    expect(html).toContain('&lt;z&gt;');
  });
});

describe('layouts: ranked', () => {
  it('empty → empty string', () => {
    expect(ranked([])).toBe('');
  });
  it('clamps weight to 0..100 and renders a bar per row', () => {
    const html = ranked([
      { label: 'a', weight: 250, body: 'x' },
      { label: 'b', weight: -5, body: 'y' },
    ]);
    expect((html.match(/lk-ranked-row/g) || []).length).toBe(2);
    expect(html).toContain('width:100%');
    expect(html).toContain('width:0%');
  });
});

import { matrix2x2, optionMatrix } from '../layouts.js';

describe('layouts: matrix2x2', () => {
  it('fewer than 4 cells → empty string', () => {
    expect(matrix2x2({ cells: [{ label: 'a' }] })).toBe('');
    expect(matrix2x2(null)).toBe('');
  });
  it('renders exactly 4 quadrants with escaped items', () => {
    const html = matrix2x2({
      axes: { x: 'Urgent', y: 'Important' },
      cells: [
        { label: 'Do', sub: 'imp · urgent', items: ['ship <it>'] },
        { label: 'Schedule', items: [] },
        { label: 'Delegate', items: ['x'] },
        { label: 'Eliminate', items: ['y'] },
      ],
    });
    expect((html.match(/lk-quad(?![-])/g) || []).length).toBe(4);
    expect(html).toContain('&lt;it&gt;');
  });
});

describe('layouts: optionMatrix', () => {
  it('no axes → empty string', () => {
    expect(optionMatrix([], [])).toBe('');
  });
  it('renders an axis row per axis and a card per combo', () => {
    const html = optionMatrix(
      [
        { axis: 'Store', options: ['vector', 'flat'] },
        { axis: 'Trigger', options: ['poll', 'push'] },
      ],
      [{ picks: ['vector', 'push'], concept: 'reactive <core>' }]
    );
    expect((html.match(/lk-om-row/g) || []).length).toBe(2);
    expect((html.match(/lk-om-combo/g) || []).length).toBe(1);
    expect(html).toContain('&lt;core&gt;');
  });
});
