import { describe, it, expect } from 'vitest';
import { toCanvasSvg, toExcalidraw } from '../canvas-export.js';

const scene = {
  id: 'repo:1',
  scope: 'blueprint',
  title: 'esbuild',
  nodes: [
    { id: 'cli', label: 'CLI', kind: 'entrypoint', layer: null, x: 40, y: 40, pinned: false, ref: {} },
    { id: 'core', label: 'Core', kind: 'subsystem', layer: null, x: 300, y: 120, pinned: false, ref: {} },
  ],
  edges: [{ id: 'e1', from: 'cli', to: 'core', rel: 'depends-on', note: null, userDrawn: false }],
  annotations: [{ id: 'a1', x: 60, y: 220, text: 'check this <b>', tone: 'warn' }],
  camera: { x: 0, y: 0, zoom: 1 },
};

describe('toCanvasSvg', () => {
  it('emits an <svg> with a node label and escaped annotation text', () => {
    const svg = toCanvasSvg(scene);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('CLI');
    expect(svg).toContain('check this &lt;b&gt;');
    expect(svg).not.toContain('check this <b>');
  });

  it('coerces non-numeric coordinates so they cannot inject into SVG attributes', () => {
    const evil = {
      nodes: [
        {
          id: 'x',
          label: 'X',
          kind: 'module',
          layer: null,
          x: '40" onload="alert(1)',
          y: 0,
          pinned: false,
          ref: {},
        },
      ],
      edges: [],
      annotations: [{ id: 'a', x: '0"><script>bad', y: 0, text: 'n', tone: 'note' }],
    };
    const svg = toCanvasSvg(evil);
    expect(svg).not.toContain('onload');
    expect(svg).not.toContain('<script>bad');
  });

  // M-1: the engine records a wider auto-width on `_w`; the exporter must use it for
  // the rect width and the edge source-x so wide cards don't clip / detach their edges.
  it('uses the node auto-width (_w) for the rect width and edge source endpoint', () => {
    const wide = {
      nodes: [
        {
          id: 'a',
          label: 'A very wide label',
          kind: 'module',
          layer: null,
          x: 0,
          y: 0,
          _w: 210,
          pinned: false,
          ref: {},
        },
        { id: 'b', label: 'B', kind: 'module', layer: null, x: 400, y: 0, pinned: false, ref: {} },
      ],
      edges: [{ id: 'e1', from: 'a', to: 'b', rel: 'depends-on', note: null, userDrawn: false }],
      annotations: [],
    };
    const svg = toCanvasSvg(wide);
    expect(svg).toContain('width="210"'); // rect width honors _w, not the 132 constant
    // edge starts at the right edge of node a: x = 0 + _w(210), not 0 + NW(132)
    expect(svg).toContain('d="M210,');
  });

  // B-7: bounds used Math.min(...nodes.map(...)) / Math.max(...), which RangeErrors
  // (call-stack overflow) when spreading a large array as call args. The reduce path
  // must not throw. 1M nodes is comfortably past the spread-arg ceiling.
  it('does not throw on a scene with a very large node array', () => {
    const big = {
      nodes: Array.from({ length: 1_000_000 }, (_, i) => ({
        id: 'n' + i,
        label: 'N',
        kind: 'module',
        x: i,
        y: i,
      })),
      edges: [],
      annotations: [],
    };
    expect(() => toCanvasSvg(big)).not.toThrow();
  });

  it('computes correct bounds for a small scene (reduce matches the old spread)', () => {
    const s = {
      nodes: [
        { id: 'a', label: 'A', kind: 'module', x: 40, y: 40 },
        { id: 'b', label: 'B', kind: 'module', x: 300, y: 120, _w: 50 },
      ],
      edges: [],
      annotations: [],
    };
    // minX = min(0, 40, 300) - 20 = -20 ; minY = min(0, 40, 120) - 20 = -20
    // maxX = max(40+NW(132), 300+_w(50), 200) + 20 = 350 + 20 = 370
    // maxY = max(40+NH(44), 120+44, 200) + 60 = 200 + 60 = 260
    // viewBox = "minX minY (maxX-minX) (maxY-minY)" = "-20 -20 390 280"
    const svg = toCanvasSvg(s);
    expect(svg).toContain('viewBox="-20 -20 390 280"');
  });
});

describe('toExcalidraw', () => {
  it('emits valid excalidraw JSON with rectangles, bound text, and an arrow', () => {
    const doc = JSON.parse(toExcalidraw(scene));
    expect(doc.type).toBe('excalidraw');
    expect(doc.version).toBe(2);
    const types = doc.elements.map((e) => e.type);
    expect(types).toContain('rectangle');
    expect(types).toContain('text');
    expect(types).toContain('arrow');
    const arrow = doc.elements.find((e) => e.type === 'arrow');
    const ids = new Set(doc.elements.map((e) => e.id));
    expect(ids.has(arrow.startBinding.elementId)).toBe(true);
    expect(ids.has(arrow.endBinding.elementId)).toBe(true);
  });
  it('is deterministic for the same scene', () => {
    expect(toExcalidraw(scene)).toBe(toExcalidraw(scene));
  });
});
