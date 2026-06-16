import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { saveScene, getScene, listScenes, deleteScene } from '../store.js';

const mk = (id, repoId) => ({ id, scope: 'blueprint', repoId, title: id, nodes: [], edges: [], annotations: [], camera: { x: 0, y: 0, zoom: 1 }, tour: null, source: {}, createdAt: 'x', updatedAt: 'x' });

describe('scene persistence', () => {
  it('saves and reads a scene by id', async () => {
    await saveScene(mk('repo:1', 'a/b'));
    const got = await getScene('repo:1');
    expect(got.title).toBe('repo:1');
  });
  it('lists scenes filtered by repoId', async () => {
    await saveScene(mk('repo:2', 'x/y'));
    await saveScene(mk('repo:3', 'x/y'));
    const list = await listScenes('x/y');
    expect(list.map((s) => s.id).sort()).toEqual(['repo:2', 'repo:3']);
  });
  it('deletes a scene', async () => {
    await saveScene(mk('repo:4', 'q/r'));
    await deleteScene('repo:4');
    expect(await getScene('repo:4')).toBeNull();
  });
});
