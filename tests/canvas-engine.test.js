// @vitest-environment repolensdom
// (Spec annotated jsdom; repo ships no DOM dep and `npm install` is off-limits,
// so this resolves — via a resolve.alias in vitest.config.js — to an in-repo
// minimal DOM environment. The test body below is unchanged from the spec.)
import { describe, it, expect, beforeEach } from 'vitest';
import { mountCanvas } from '../canvas-engine.js';

const scene = () => ({
  id: 'repo:1', scope: 'blueprint', title: 't',
  nodes: [
    { id: 'a', label: 'A', kind: 'module', layer: null, x: 0, y: 0, pinned: false, ref: {} },
    { id: 'b', label: 'B', kind: 'module', layer: null, x: 200, y: 0, pinned: false, ref: {} },
  ],
  edges: [{ id: 'e1', from: 'a', to: 'b', rel: 'depends-on', note: null, userDrawn: false }],
  annotations: [], camera: { x: 0, y: 0, zoom: 1 }, tour: null, source: {},
});

describe('mountCanvas', () => {
  let host;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });

  it('renders one <g> per node and one path per edge', () => {
    mountCanvas(host, scene(), {});
    expect(host.querySelectorAll('[data-node]').length).toBe(2);
    expect(host.querySelectorAll('[data-edge]').length).toBe(1);
  });

  it('moveNode persists via onChange and updates the node transform without re-creating nodes', () => {
    let saved = null;
    const api = mountCanvas(host, scene(), { onChange: (s) => { saved = s; } });
    const before = host.querySelector('[data-node="a"]');
    api.moveNode('a', 50, 60);
    const after = host.querySelector('[data-node="a"]');
    expect(after).toBe(before);
    expect(after.getAttribute('transform')).toContain('50');
    expect(saved.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 50, y: 60 });
  });

  it('setSpotlight toggles classes without changing node count', () => {
    const api = mountCanvas(host, scene(), {});
    api.setSpotlight(['a']);
    expect(host.querySelector('[data-node="a"]').classList.contains('is-spotlight')).toBe(true);
    expect(host.querySelector('[data-node="b"]').classList.contains('is-dim')).toBe(true);
    expect(host.querySelectorAll('[data-node]').length).toBe(2);
  });
});
