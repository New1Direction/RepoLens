import { describe, it, expect } from 'vitest';
import { buildLibraryScene } from '../library-scene.js';

const graph = {
  nodes: [
    { repoId: 'evanw/esbuild', name: 'esbuild', analyzed: true, kind: 'repo' },
    { repoId: 'rollup/rollup', name: 'rollup', analyzed: true, kind: 'repo' },
    { title: 'esbuild + rollup glue', kind: 'idea', sources: ['evanw/esbuild', 'rollup/rollup'] },
  ],
  edges: [{ id: 'e1', source: 'evanw/esbuild', target: 'rollup/rollup', label: 'ALTERNATIVE_TO', properties: {} }],
};
const repos = [
  { repoId: 'evanw/esbuild', fit: 'strong', health: { score: 92 } },
  { repoId: 'rollup/rollup', fit: 'solid', health: { score: 80 } },
];

describe('buildLibraryScene', () => {
  it('builds a corkboard scene with repo cards + an idea node + a rel edge', () => {
    const s = buildLibraryScene({ graph, repos });
    expect(s.scope).toBe('corkboard');
    expect(s.id).toBe('library');
    expect(s.nodes.length).toBe(3);
    const esb = s.nodes.find((n) => n.id === 'evanw/esbuild');
    expect(esb.ref.fit).toBe('strong');
    expect(esb.ref.health).toBe(92);
    expect(s.edges[0]).toMatchObject({ from: 'evanw/esbuild', to: 'rollup/rollup', rel: 'ALTERNATIVE_TO' });
    expect(s.nodes.some((n) => n.kind === 'idea')).toBe(true);
  });
  it('filters to a collection when `only` repoIds are given (+ drops dangling edges)', () => {
    const s = buildLibraryScene({ graph, repos, only: ['evanw/esbuild'] });
    expect(s.nodes.map((n) => n.id)).toEqual(['evanw/esbuild']);
    expect(s.edges).toHaveLength(0);
  });
});
