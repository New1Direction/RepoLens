import { describe, it, expect } from 'vitest';
import { toCanvasSvg, toExcalidraw } from '../canvas-export.js';

const scene = {
  id: 'repo:1', scope: 'blueprint', title: 'esbuild',
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
      nodes: [{ id: 'x', label: 'X', kind: 'module', layer: null, x: '40" onload="alert(1)', y: 0, pinned: false, ref: {} }],
      edges: [],
      annotations: [{ id: 'a', x: '0"><script>bad', y: 0, text: 'n', tone: 'note' }],
    };
    const svg = toCanvasSvg(evil);
    expect(svg).not.toContain('onload');
    expect(svg).not.toContain('<script>bad');
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
