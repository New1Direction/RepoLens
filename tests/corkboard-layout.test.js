import { describe, it, expect } from 'vitest';
import { layoutCorkboard } from '../canvas-layout.js';
const N = (id) => ({ id, label: id, kind: 'repo', layer: null, x: 0, y: 0, pinned: false, ref: {} });

describe('layoutCorkboard', () => {
  it('assigns every node a finite position', () => {
    const placed = layoutCorkboard([N('a'), N('b'), N('c')], []);
    for (const n of placed) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });
  it('seeds connected repos at least as close as unrelated ones', () => {
    const nodes = [N('a'), N('b'), N('x'), N('y')];
    const edges = [{ id: 'e', from: 'a', to: 'b', rel: 'ALTERNATIVE_TO' }];
    const placed = layoutCorkboard(nodes, edges);
    const by = Object.fromEntries(placed.map((n) => [n.id, n]));
    const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
    expect(d(by.a, by.b)).toBeLessThanOrEqual(Math.max(d(by.a, by.x), d(by.a, by.y)));
  });
  it('keeps pinned nodes where they are', () => {
    const placed = layoutCorkboard([{ ...N('a'), x: 500, y: 500, pinned: true }, N('b')], []);
    expect(placed.find((n) => n.id === 'a')).toMatchObject({ x: 500, y: 500 });
  });
});
