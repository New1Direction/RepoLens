import { describe, it, expect } from 'vitest';
import { layoutStack } from '../canvas-layout.js';
const repo = (id) => ({ id, label: id, kind: 'repo', layer: null, x: 0, y: 0, pinned: false, ref: {} });
const gap = (id) => ({ id, label: id, kind: 'gap', layer: null, x: 0, y: 0, pinned: false, ref: {} });

describe('layoutStack', () => {
  it('places repos left→right by adoption order', () => {
    const placed = layoutStack([repo('b'), repo('a')], ['a', 'b']);
    const by = Object.fromEntries(placed.map((n) => [n.id, n]));
    expect(by.a.x).toBeLessThan(by.b.x);
    expect(by.a.y).toBe(by.b.y);
  });
  it('puts gap cards in a row below the repos', () => {
    const placed = layoutStack([repo('a'), gap('gap:0')], ['a']);
    const by = Object.fromEntries(placed.map((n) => [n.id, n]));
    expect(by['gap:0'].y).toBeGreaterThan(by.a.y);
  });
  it('keeps pinned nodes', () => {
    const placed = layoutStack([{ ...repo('a'), x: 9, y: 9, pinned: true }], ['a']);
    expect(placed[0]).toMatchObject({ x: 9, y: 9 });
  });
});
