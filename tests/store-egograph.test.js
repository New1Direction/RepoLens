import { describe, it, expect } from 'vitest';
import { buildEgoGraph } from '../store/egograph.js';

describe('buildEgoGraph', () => {
  const center = 100;
  const repoId = 'facebook/react';

  it('assembles center + both-direction edges + neighbors', () => {
    const edges = [
      { source: 100, target: 200, label: 'similar' }, // outgoing
      { source: 300, target: 100, label: 'inspired' }, // incoming
    ];
    const payloads = {
      200: { name: 'vue', repoId: 'vuejs/core', analyzed: true },
      300: { kind: 'idea', title: 'a fresh idea', pitch: 'do X' },
    };
    const g = buildEgoGraph(center, repoId, edges, payloads);

    expect(g.center).toEqual({ id: '100', repoId, name: 'react' });
    expect(g.edges).toHaveLength(2);
    expect(g.neighbors.map((n) => n.id).sort()).toEqual(['200', '300']);

    const vue = g.neighbors.find((n) => n.id === '200');
    expect(vue).toMatchObject({ name: 'vue', repoId: 'vuejs/core', analyzed: true, kind: 'repo' });

    const idea = g.neighbors.find((n) => n.id === '300');
    expect(idea).toMatchObject({ name: 'a fresh idea', kind: 'idea', pitch: 'do X', repoId: null });
  });

  it('never lists the center as its own neighbor', () => {
    const g = buildEgoGraph(100, repoId, [{ source: 100, target: 100, label: 'self' }], {});
    expect(g.neighbors).toEqual([]);
  });

  it('empty edges → no neighbors', () => {
    const g = buildEgoGraph(100, repoId, [], {});
    expect(g.edges).toEqual([]);
    expect(g.neighbors).toEqual([]);
  });

  it('falls back to the id when a neighbor payload is missing', () => {
    const g = buildEgoGraph(100, repoId, [{ source: 100, target: 999, label: 'x' }], {});
    expect(g.neighbors[0]).toMatchObject({ id: '999', name: '999', analyzed: false });
  });
});
