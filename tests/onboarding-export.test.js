import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { saveRepo, saveScene, exportStores, hashRepoId } from '../store.js';
import { idbClear } from '../store/idb.js';
import { DEMO_REPO, demoScene } from '../demo-repo.js';

const realAnalysis = { repoId: 'a/real', language: 'Rust', category: 'CLI', health: { score: 80 } };

describe('exportStores — excludes the seeded __demo__', () => {
  beforeEach(async () => {
    await idbClear('repos');
    await idbClear('snapshots');
    await idbClear('scenes');
  });

  it('drops the demo repo, its snapshot, and its scene while keeping real data', async () => {
    // Arrange: one real repo + the seeded demo (repo row, snapshot, scene).
    await saveRepo(realAnalysis);
    await saveRepo(DEMO_REPO);
    await saveScene(demoScene());

    // Act
    const dump = await exportStores();

    // Assert — demo repo absent, real repo present.
    expect(dump.repos.some((r) => r.payload?.__demo__ === true)).toBe(false);
    expect(dump.repos.some((r) => r.payload?.repoId === DEMO_REPO.repoId)).toBe(false);
    expect(dump.repos.some((r) => r.payload?.repoId === 'a/real')).toBe(true);

    // Demo snapshot (keyed by the demo repo's hashed id) absent; real one present.
    const demoId = hashRepoId(DEMO_REPO.repoId);
    expect(dump.snapshots.some((s) => s.id === demoId)).toBe(false);
    expect(dump.snapshots.some((s) => s.id === hashRepoId('a/real'))).toBe(true);

    // Demo scene absent.
    expect(dump.scenes.some((s) => s.__demo__ === true)).toBe(false);
    expect(dump.scenes.some((s) => s.id === demoScene().id)).toBe(false);
  });
});
