import { describe, it, expect } from 'vitest';
import { nodeIdFor, edgeIdFor, egoLayout, egoGraphSvg } from '../graph.js';
import { hashRepoId } from '../store.js';

describe('nodeIdFor', () => {
  it('hashes a canonical owner/repo unchanged (collapses onto its analyzed node)', () => {
    expect(nodeIdFor('facebook/react')).toBe(hashRepoId('facebook/react'));
  });
  it('lowercases a bare name so case variants merge to one stub', () => {
    expect(nodeIdFor('Vue')).toBe(nodeIdFor('vue'));
    expect(nodeIdFor('  Svelte ')).toBe(nodeIdFor('svelte'));
  });
  it('keeps different names distinct', () => {
    expect(nodeIdFor('vue')).not.toBe(nodeIdFor('svelte'));
  });
});

describe('edgeIdFor', () => {
  it('is deterministic for the same triple', () => {
    expect(edgeIdFor(1, 'ALTERNATIVE_TO', 2)).toBe(edgeIdFor(1, 'ALTERNATIVE_TO', 2));
  });
  it('differs when label or endpoints differ', () => {
    expect(edgeIdFor(1, 'ALTERNATIVE_TO', 2)).not.toBe(edgeIdFor(1, 'SYNERGIZES_WITH', 2));
    expect(edgeIdFor(1, 'ALTERNATIVE_TO', 2)).not.toBe(edgeIdFor(2, 'ALTERNATIVE_TO', 1));
  });
  it('returns a positive integer', () => {
    expect(edgeIdFor(1, 'X', 2)).toBeGreaterThan(0);
    expect(Number.isInteger(edgeIdFor(1, 'X', 2))).toBe(true);
  });
});

describe('egoLayout', () => {
  it('places the center at ring 0 and N neighbors at ring 1', () => {
    const pos = egoLayout(7, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(pos).toHaveLength(4);
    expect(pos[0]).toMatchObject({ id: '7', ring: 0 });
    expect(pos.filter(p => p.ring === 1)).toHaveLength(3);
  });
  it('is deterministic (same input → same coordinates)', () => {
    expect(egoLayout(1, [{ id: 'a' }, { id: 'b' }])).toEqual(egoLayout(1, [{ id: 'a' }, { id: 'b' }]));
  });
  it('gives neighbors distinct positions', () => {
    const pos = egoLayout(1, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const keys = new Set(pos.slice(1).map(p => `${p.x},${p.y}`));
    expect(keys.size).toBe(3);
  });
  it('returns just the center for no neighbors', () => {
    expect(egoLayout(1, [])).toHaveLength(1);
  });
});

describe('egoGraphSvg', () => {
  const center = { id: '7', name: 'react' };
  const neighbors = [
    { id: '11', name: 'vue', analyzed: false },
    { id: '12', name: 'next', analyzed: true },
  ];
  const edges = [
    { source: '7', target: '11', label: 'ALTERNATIVE_TO' },
    { source: '7', target: '12', label: 'SYNERGIZES_WITH' },
  ];

  it('returns empty string when there are no neighbors', () => {
    expect(egoGraphSvg(center, [], [])).toBe('');
    expect(egoGraphSvg(null, neighbors, edges)).toBe('');
  });
  it('renders one circle per neighbor plus the center, and one line per edge', () => {
    const svg = egoGraphSvg(center, neighbors, edges);
    expect(svg.startsWith('<svg')).toBe(true);
    expect((svg.match(/<circle/g) || []).length).toBe(3);
    expect((svg.match(/class="cn-edge/g) || []).length).toBe(2);
  });
  it('maps each label to its color class', () => {
    const svg = egoGraphSvg(center, neighbors, edges);
    expect(svg).toContain('cn-alt');
    expect(svg).toContain('cn-syn');
  });
  it('marks stub vs analyzed neighbors', () => {
    const svg = egoGraphSvg(center, neighbors, edges);
    expect(svg).toContain('cn-stub');
    expect(svg).toContain('cn-analyzed');
  });
  it('drops edges whose endpoints are not in the graph', () => {
    const svg = egoGraphSvg(center, neighbors, [{ source: '7', target: '999', label: 'ALTERNATIVE_TO' }]);
    expect((svg.match(/class="cn-edge/g) || []).length).toBe(0);
  });
  it('escapes node names', () => {
    const svg = egoGraphSvg({ id: '1', name: '<script>' }, [{ id: '2', name: 'b', analyzed: false }], []);
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<script>');
  });
});

import { ideaIdFor } from '../graph.js';

describe('ideaIdFor', () => {
  it('is deterministic and order-independent over the source repoIds', () => {
    expect(ideaIdFor(['o/a', 'o/b'])).toBe(ideaIdFor(['o/b', 'o/a']));
    expect(ideaIdFor(['o/a', 'o/b'])).toBeGreaterThan(0);
  });
  it('differs for different source sets', () => {
    expect(ideaIdFor(['o/a', 'o/b'])).not.toBe(ideaIdFor(['o/a', 'o/c']));
  });
});

describe('egoGraphSvg — idea nodes and COMBINES edges', () => {
  const center = { id: '7', name: 'react' };
  const neighbors = [
    { id: '50', name: 'self-tuning search', analyzed: false, kind: 'idea' },
    { id: '11', name: 'vue', analyzed: false, kind: 'repo' },
  ];
  const edges = [
    { source: '7', target: '50', label: 'COMBINES' },
    { source: '7', target: '11', label: 'ALTERNATIVE_TO' },
  ];
  it('renders an idea neighbour with the cn-idea class and a COMBINES edge colour class', () => {
    const svg = egoGraphSvg(center, neighbors, edges);
    expect(svg).toContain('cn-idea');
    expect(svg).toContain('cn-combines');
  });
  it('tags each node with its kind for the renderer', () => {
    const svg = egoGraphSvg(center, neighbors, edges);
    expect(svg).toContain('data-kind="idea"');
  });
});
