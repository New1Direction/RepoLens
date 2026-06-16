import { describe, it, expect } from 'vitest';
import { buildBackup, validateBackup } from '../backup.js';

const scene = { id: 'repo:1', scope: 'blueprint', repoId: 'a/b', nodes: [], edges: [], annotations: [] };

describe('backup with scenes', () => {
  it('includes scenes in the envelope and count', () => {
    const env = buildBackup({ repos: [], scenes: [scene] });
    expect(env.scenes).toHaveLength(1);
    expect(env.counts.scenes).toBe(1);
  });
  it('keeps valid scenes and drops malformed rows on validate', () => {
    const env = buildBackup({ scenes: [scene, { nope: true }] });
    const r = validateBackup(env);
    expect(r.ok).toBe(true);
    expect(r.value.scenes).toHaveLength(1);
  });
  // B-6: dropping an invalid scene row must be surfaced in `warnings`, not silent.
  it('reports dropped invalid scene rows in warnings', () => {
    const env = buildBackup({ scenes: [scene, { nope: true }] });
    const r = validateBackup(env);
    expect(r.value.scenes).toHaveLength(1);
    expect(r.warnings.join(' ')).toMatch(/1 .*scene/i);
  });
  it('does not warn when every scene row is valid', () => {
    const r = validateBackup(buildBackup({ scenes: [scene] }));
    expect(r.warnings.join(' ')).not.toMatch(/scene/i);
  });
});
