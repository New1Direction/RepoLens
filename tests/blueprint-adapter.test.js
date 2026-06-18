import { describe, it, expect } from 'vitest';
import { buildBlueprintScene } from '../blueprint-adapter.js';

const deepDive = {
  atoms: [
    { id: 'cli', name: 'CLI', kind: 'entrypoint', purpose: 'parses argv', files: ['cli.js'] },
    { id: 'core', name: 'Core', kind: 'subsystem', purpose: 'the engine', files: ['core.js'] },
  ],
  lineage: { links: [{ from: 'cli', to: 'core', relation: 'depends-on' }], roots: ['cli'], leaves: ['core'] },
};

describe('buildBlueprintScene', () => {
  it('produces a blueprint scene with placed nodes and an edge', () => {
    const s = buildBlueprintScene({
      deepDive,
      repoId: 'evanw/esbuild',
      title: 'esbuild',
      scanAt: '2026-06-15T00:00:00Z',
    });
    expect(s.scope).toBe('blueprint');
    expect(s.nodes).toHaveLength(2);
    expect(s.edges).toHaveLength(1);
    expect(s.nodes.find((n) => n.id === 'cli').x).toBeLessThan(s.nodes.find((n) => n.id === 'core').x);
    expect(s.source.scanAt).toBe('2026-06-15T00:00:00Z');
  });

  it('uses layerOf when provided', () => {
    const s = buildBlueprintScene({ deepDive, repoId: 'r', title: 't', layerOf: (a) => 'L:' + a.kind });
    expect(s.nodes[0].layer).toBe('L:entrypoint');
  });

  it('returns repair issues alongside the scene', () => {
    const dd = { atoms: [{ id: 'a', name: 'A' }], lineage: { links: [{ from: 'a', to: 'ghost' }] } };
    const { scene, issues } = buildBlueprintScene({
      deepDive: dd,
      repoId: 'r',
      title: 't',
      withIssues: true,
    });
    expect(scene.edges).toHaveLength(0);
    expect(issues.length).toBeGreaterThan(0);
  });
});
