import { describe, it, expect } from 'vitest';
import { DEMO_REPO, demoScene, isDemo } from '../demo-repo.js';
import { validateScene } from '../scene.js';

describe('demo fixture', () => {
  it('is a valid analysis payload tagged __demo__', () => {
    expect(DEMO_REPO.repoId).toBe('honojs/hono');
    expect(DEMO_REPO.__demo__).toBe(true);
    expect(typeof DEMO_REPO.eli5).toBe('string');
    expect(DEMO_REPO.health && typeof DEMO_REPO.health.score).toBe('number');
    expect(Array.isArray(DEMO_REPO.deepDive.atoms)).toBe(true);
    expect(DEMO_REPO.deepDive.atoms.length).toBeGreaterThanOrEqual(4);
    expect(Array.isArray(DEMO_REPO.deepDive.lineage.links)).toBe(true);
  });
  it('builds a valid blueprint scene', () => {
    const s = demoScene();
    expect(validateScene(s).ok).toBe(true);
    expect(s.nodes.length).toBe(DEMO_REPO.deepDive.atoms.length);
  });
  it('isDemo detects the demo and nothing else', () => {
    expect(isDemo(DEMO_REPO)).toBe(true);
    expect(isDemo({ repoId: 'a/b' })).toBe(false);
  });
});
