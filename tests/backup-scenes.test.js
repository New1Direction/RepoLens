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
});
