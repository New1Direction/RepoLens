import { describe, it, expect } from 'vitest';
import { layoutBlueprint } from '../canvas-layout.js';

const N = (id) => ({ id, label: id, kind: 'module', layer: null, x: 0, y: 0, pinned: false, ref: null });

describe('layoutBlueprint', () => {
  it('places roots left of their dependents (increasing x by depth)', () => {
    const nodes = [N('cli'), N('core'), N('out')];
    const edges = [
      { id: 'e1', from: 'cli', to: 'core', rel: 'depends-on', note: null, userDrawn: false },
      { id: 'e2', from: 'core', to: 'out', rel: 'triggers', note: null, userDrawn: false },
    ];
    const placed = layoutBlueprint(nodes, edges);
    const by = Object.fromEntries(placed.map((n) => [n.id, n]));
    expect(by.cli.x).toBeLessThan(by.core.x);
    expect(by.core.x).toBeLessThan(by.out.x);
  });

  it('does not move pinned nodes', () => {
    const nodes = [{ ...N('a'), x: 999, y: 888, pinned: true }, N('b')];
    const edges = [{ id: 'e', from: 'a', to: 'b', rel: 'depends-on', note: null, userDrawn: false }];
    const placed = layoutBlueprint(nodes, edges);
    const a = placed.find((n) => n.id === 'a');
    expect(a).toMatchObject({ x: 999, y: 888 });
  });

  it('handles cycles without infinite loop', () => {
    const nodes = [N('a'), N('b')];
    const edges = [
      { id: 'e1', from: 'a', to: 'b', rel: 'depends-on', note: null, userDrawn: false },
      { id: 'e2', from: 'b', to: 'a', rel: 'depends-on', note: null, userDrawn: false },
    ];
    expect(() => layoutBlueprint(nodes, edges)).not.toThrow();
  });
});
