// demo-repo.js
// A pre-baked, clearly-marked DEMO scan (honojs/hono) so the first-run tour can
// show real surfaces. Tagged __demo__ so it's excluded from stats/export and torn down.
import { buildBlueprintScene } from './blueprint-adapter.js';

export const DEMO_REPO = {
  repoId: 'honojs/hono',
  __demo__: true,
  platform: 'github', language: 'TypeScript', license: 'MIT', stars: 21000,
  category: 'Web framework', tags: ['edge', 'router'],
  description: 'Small, fast web framework for the edges.',
  saved_at: '2026-01-01T00:00:00.000Z',
  eli5: 'A sample read: a tiny web framework that runs on edge runtimes using web-standard requests.',
  fit: 'strong',
  health: { score: 92 },
  pros: ['Tiny and fast', 'Runs on most runtimes', 'Typed routing'],
  cons: ['Smaller ecosystem than Express'],
  red_flags: [],
  capabilities: ['routing', 'middleware', 'edge'],
  deepDive: {
    atoms: [
      { id: 'app', name: 'Hono app', kind: 'entrypoint', purpose: 'Creates the app and registers routes.' },
      { id: 'router', name: 'router', kind: 'subsystem', purpose: 'Matches a request to a handler.' },
      { id: 'context', name: 'Context', kind: 'subsystem', purpose: 'Wraps request and response per call.' },
      { id: 'middleware', name: 'middleware', kind: 'module', purpose: 'Runs before/after handlers.' },
      { id: 'handler', name: 'handler', kind: 'module', purpose: 'Your route logic.' },
      { id: 'adapter', name: 'runtime adapter', kind: 'module', purpose: 'Binds to a runtime (Workers, Deno, Node).' },
    ],
    lineage: {
      links: [
        { from: 'app', to: 'router', relation: 'depends-on' },
        { from: 'router', to: 'context', relation: 'triggers' },
        { from: 'context', to: 'middleware', relation: 'triggers' },
        { from: 'middleware', to: 'handler', relation: 'triggers' },
        { from: 'app', to: 'adapter', relation: 'depends-on' },
      ],
      roots: ['app'], leaves: ['handler'],
    },
  },
};

/** The blueprint scene for the demo (so the Canvas tab renders real content). */
export function demoScene() {
  return buildBlueprintScene({ deepDive: DEMO_REPO.deepDive, repoId: DEMO_REPO.repoId, title: DEMO_REPO.repoId });
}

/** True only for the seeded demo row. */
export function isDemo(repo) {
  return !!(repo && (repo.__demo__ === true || (repo.repoId === DEMO_REPO.repoId && repo.__demo__)));
}

/**
 * Tear down the seeded demo (repo row + blueprint scene). Best-effort.
 * Uses a dynamic import so this fixture module never pulls the IndexedDB/store
 * layer into its static import graph (it's also imported by pure unit tests).
 */
export async function clearDemoEverywhere() {
  try {
    const { deleteRepo, deleteScene } = await import('./store.js');
    await deleteRepo(DEMO_REPO.repoId);
    await deleteScene(demoScene().id);
  } catch { /* best-effort teardown */ }
}
