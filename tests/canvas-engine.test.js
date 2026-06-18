import { describe, it, expect } from 'vitest';
import { edgeBezier, NODE_W, NODE_H, nodeClass } from '../canvas-engine.js';

describe('edgeBezier', () => {
  it('starts at the source node right-middle and ends at the target left-middle', () => {
    const d = edgeBezier({ x: 0, y: 0 }, { x: 300, y: 0 });
    expect(d.startsWith(`M${NODE_W},${NODE_H / 2}`)).toBe(true);
    expect(d.includes(`300,${NODE_H / 2}`)).toBe(true);
  });
  it('emits exactly one cubic-bezier segment', () => {
    const d = edgeBezier({ x: 10, y: 20 }, { x: 100, y: 80 });
    expect((d.match(/C/g) || []).length).toBe(1);
  });
  it('routes the control points to the horizontal midpoint', () => {
    const d = edgeBezier({ x: 0, y: 0 }, { x: 200, y: 0 });
    const mx = (0 + NODE_W + 200) / 2;
    expect(d).toContain(`C${mx},`);
  });
});

describe('nodeClass', () => {
  it('includes kind, root, and fit when present', () => {
    expect(nodeClass({ kind: 'repo', ref: { root: false, fit: 'strong' } })).toBe(
      'rl-node rl-kind-repo rl-fit-strong'
    );
    expect(nodeClass({ kind: 'module', ref: { root: true } })).toBe('rl-node rl-kind-module is-root');
    expect(nodeClass({ kind: 'data', ref: {} })).toBe('rl-node rl-kind-data');
  });
  it('includes a layer class when node.layer is set', () => {
    expect(nodeClass({ kind: 'repo', layer: 'backend', ref: {} })).toBe(
      'rl-node rl-kind-repo rl-layer-backend'
    );
  });
});
