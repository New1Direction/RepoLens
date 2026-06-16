import { describe, it, expect } from 'vitest';
import { edgeBezier, NODE_W, NODE_H } from '../canvas-engine.js';

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
