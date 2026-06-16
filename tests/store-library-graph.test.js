import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { upsertNode, addEdge, getLibraryGraph } from '../store.js';

describe('getLibraryGraph', () => {
  it('returns all node payloads and all edges', async () => {
    await upsertNode(1, { repoId: 'a/b', name: 'b', analyzed: true, kind: 'repo' });
    await upsertNode(2, { repoId: 'c/d', name: 'd', analyzed: true, kind: 'repo' });
    await addEdge({ id: 'e1', source: '1', target: '2', label: 'ALTERNATIVE_TO', properties: {} });
    const g = await getLibraryGraph();
    expect(g.nodes.some((n) => n.repoId === 'a/b')).toBe(true);
    expect(g.nodes.find((n) => n.repoId === 'a/b').nodeId).toBe('1'); // carries the node-store id so edges can be joined
    expect(g.edges.some((e) => e.label === 'ALTERNATIVE_TO')).toBe(true);
  });
  it('is best-effort: returns arrays even with no data', async () => {
    const g = await getLibraryGraph();
    expect(Array.isArray(g.nodes)).toBe(true);
    expect(Array.isArray(g.edges)).toBe(true);
  });
});
