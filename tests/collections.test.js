import { describe, it, expect } from 'vitest';
import {
  makeCollection,
  validateCollectionName,
  renameCollection,
  collectionContains,
  addRepoToCollection,
  removeRepoFromCollection,
  toggleRepoInCollection,
  sortedCollections,
  repoCollections,
  nextColor,
  COLLECTION_COLORS,
} from '../collections.js';

describe('makeCollection', () => {
  it('trims the name and starts empty with injected id/timestamp', () => {
    const c = makeCollection('  My Stack  ', { id: 'c1', now: '2026-01-01T00:00:00Z' });
    expect(c).toMatchObject({
      id: 'c1',
      name: 'My Stack',
      repoIds: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    expect(COLLECTION_COLORS).toContain(c.color);
  });
});

describe('validateCollectionName', () => {
  it('rejects empty / whitespace names', () => {
    expect(validateCollectionName('   ').ok).toBe(false);
    expect(validateCollectionName('').ok).toBe(false);
  });
  it('rejects a case-insensitive duplicate', () => {
    const existing = [{ name: 'Vector DBs' }];
    expect(validateCollectionName('vector dbs', existing).ok).toBe(false);
    expect(validateCollectionName('Graph DBs', existing).ok).toBe(true);
  });
  it('accepts a clean unique name', () => {
    expect(validateCollectionName('Auth', []).ok).toBe(true);
  });
});

describe('membership (immutable)', () => {
  it('adds a repo without mutating the original', () => {
    const c = makeCollection('x', { id: 'c1', now: 't0' });
    const c2 = addRepoToCollection(c, 'owner/repo', { now: 't1' });
    expect(c.repoIds).toEqual([]); // original untouched
    expect(c2.repoIds).toEqual(['owner/repo']);
    expect(c2.updatedAt).toBe('t1');
  });
  it('adding a duplicate is a no-op (returns same ref)', () => {
    const c = addRepoToCollection(makeCollection('x', { id: 'c1' }), 'a');
    expect(addRepoToCollection(c, 'a')).toBe(c);
  });
  it('removes a repo immutably', () => {
    const c = addRepoToCollection(makeCollection('x', { id: 'c1' }), 'a');
    const c2 = removeRepoFromCollection(c, 'a');
    expect(c.repoIds).toEqual(['a']);
    expect(c2.repoIds).toEqual([]);
  });
  it('removing an absent repo is a no-op (returns same ref)', () => {
    const c = makeCollection('x', { id: 'c1' });
    expect(removeRepoFromCollection(c, 'nope')).toBe(c);
  });
  it('toggle adds then removes', () => {
    const c0 = makeCollection('x', { id: 'c1' });
    const c1 = toggleRepoInCollection(c0, 'a');
    const c2 = toggleRepoInCollection(c1, 'a');
    expect(collectionContains(c1, 'a')).toBe(true);
    expect(collectionContains(c2, 'a')).toBe(false);
  });
});

describe('queries', () => {
  it('renameCollection trims and bumps updatedAt', () => {
    const c = renameCollection(makeCollection('old', { id: 'c1', now: 't0' }), '  New  ', { now: 't9' });
    expect(c.name).toBe('New');
    expect(c.updatedAt).toBe('t9');
  });
  it('sortedCollections orders by name and drops falsy', () => {
    const out = sortedCollections([{ name: 'Beta' }, null, { name: 'alpha' }]);
    expect(out.map((c) => c.name)).toEqual(['alpha', 'Beta']);
  });
  it('repoCollections finds every collection holding a repo', () => {
    const a = addRepoToCollection(makeCollection('A', { id: 'a' }), 'r1');
    const b = makeCollection('B', { id: 'b' });
    const c = addRepoToCollection(makeCollection('C', { id: 'c' }), 'r1');
    expect(repoCollections([a, b, c], 'r1').map((x) => x.id)).toEqual(['a', 'c']);
  });
  it('nextColor cycles through the palette', () => {
    expect(nextColor(0)).toBe(COLLECTION_COLORS[0]);
    expect(nextColor(COLLECTION_COLORS.length)).toBe(COLLECTION_COLORS[0]);
  });
});
