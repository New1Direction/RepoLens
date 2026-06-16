import { describe, it, expect } from 'vitest';
import { hashId, createScene, withNodePos, validateScene } from '../scene.js';

describe('hashId', () => {
  it('is deterministic and positive', () => {
    expect(hashId('core')).toBe(hashId('core'));
    expect(hashId('core')).toBeGreaterThan(0);
  });
  it('differs for different input', () => {
    expect(hashId('a')).not.toBe(hashId('b'));
  });
});

describe('createScene', () => {
  it('builds a blueprint scene with defaults', () => {
    const s = createScene({ scope: 'blueprint', repoId: 'evanw/esbuild', title: 'esbuild' });
    expect(s.id).toBe('repo:' + hashId('evanw/esbuild'));
    expect(s.scope).toBe('blueprint');
    expect(s.nodes).toEqual([]);
    expect(s.edges).toEqual([]);
    expect(s.annotations).toEqual([]);
    expect(s.camera).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(s.tour).toBeNull();
    expect(typeof s.createdAt).toBe('string');
  });
});

describe('withNodePos', () => {
  it('returns a new scene with one node moved, input untouched', () => {
    const s = createScene({ scope: 'blueprint', repoId: 'r', title: 't' });
    s.nodes = [{ id: 'a', label: 'A', kind: 'module', layer: null, x: 0, y: 0, pinned: false, ref: null }];
    const next = withNodePos(s, 'a', 10, 20);
    expect(next.nodes[0]).toMatchObject({ x: 10, y: 20 });
    expect(s.nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(next).not.toBe(s);
  });
});

describe('validateScene', () => {
  it('flags edges referencing unknown nodes', () => {
    const s = createScene({ scope: 'blueprint', repoId: 'r', title: 't' });
    s.nodes = [{ id: 'a', label: 'A', kind: 'module', layer: null, x: 0, y: 0, pinned: false, ref: null }];
    s.edges = [{ id: 'e', from: 'a', to: 'ghost', rel: 'depends-on', note: null, userDrawn: false }];
    const r = validateScene(s);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/unknown node/);
  });
});
