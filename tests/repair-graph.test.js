import { describe, it, expect } from 'vitest';
import { repairGraph } from '../repair-graph.js';

describe('repairGraph', () => {
  it('drops edges whose endpoints are missing', () => {
    const raw = {
      nodes: [{ id: 'a', name: 'A' }],
      edges: [{ from: 'a', to: 'ghost', relation: 'depends-on' }],
    };
    const { edges, issues } = repairGraph(raw);
    expect(edges).toHaveLength(0);
    expect(issues.some((i) => i.level === 'dropped' && /dangling/.test(i.code))).toBe(true);
  });

  it('coerces kind and relation aliases to the known set', () => {
    const raw = {
      nodes: [{ id: 'a', name: 'A', kind: 'FUNCTION' }, { id: 'b', name: 'B', kind: 'service' }],
      edges: [{ from: 'a', to: 'b', relation: 'imports' }],
    };
    const { nodes, edges } = repairGraph(raw);
    expect(nodes[0].kind).toBe('module');
    expect(nodes[1].kind).toBe('subsystem');
    expect(edges[0].rel).toBe('depends-on');
  });

  it('dedupes node ids and drops nodes missing an id', () => {
    const raw = {
      nodes: [{ id: 'a', name: 'A' }, { id: 'a', name: 'A2' }, { name: 'noid' }],
      edges: [],
    };
    const { nodes, issues } = repairGraph(raw);
    expect(nodes).toHaveLength(1);
    expect(issues.some((i) => /dedupe/.test(i.code))).toBe(true);
    expect(issues.some((i) => /missing-id/.test(i.code))).toBe(true);
  });

  it('fills missing label/kind defaults', () => {
    const { nodes } = repairGraph({ nodes: [{ id: 'a' }], edges: [] });
    expect(nodes[0].label).toBe('a');
    expect(nodes[0].kind).toBe('module');
  });

  it('throws in strict mode on a dropped issue', () => {
    expect(() => repairGraph({ nodes: [], edges: [{ from: 'x', to: 'y' }] }, { strict: true })).toThrow();
  });

  // L-1: pinned nodes whose coords arrive as numeric strings (e.g. from JSON) must
  // keep their position — Number.isFinite('100') is false, so coords would collapse to 0.
  it('preserves a pinned node whose coordinates are numeric strings', () => {
    const { nodes } = repairGraph({ nodes: [{ id: 'a', name: 'A', pinned: true, x: '100', y: '250' }], edges: [] });
    expect(nodes[0].x).toBe(100);
    expect(nodes[0].y).toBe(250);
  });

  it('falls back to 0 for truly non-numeric coordinates', () => {
    const { nodes } = repairGraph({ nodes: [{ id: 'a', name: 'A', x: 'nope', y: null }], edges: [] });
    expect(nodes[0].x).toBe(0);
    expect(nodes[0].y).toBe(0);
  });
});
