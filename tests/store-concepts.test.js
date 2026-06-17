// tests/store-concepts.test.js
import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { setConcepts, getConcepts, getAllConcepts } from '../store.js';

describe('concepts persistence', () => {
  it('round-trips a record by repoId', async () => {
    const rec = { repoId: 'honojs/hono', atoms: [{ id: 'r', name: 'Router' }], vectors: null, embedModel: null, computedAt: '2026-06-16T00:00:00.000Z' };
    await setConcepts('honojs/hono', rec);
    expect(await getConcepts('honojs/hono')).toEqual(rec);
  });
  it('returns null for an unknown repo', async () => {
    expect(await getConcepts('nope/none')).toBeNull();
  });
  it('getAllConcepts returns a repoId→record map', async () => {
    await setConcepts('a/b', { repoId: 'a/b', atoms: [] });
    const map = await getAllConcepts();
    expect(map['a/b'].repoId).toBe('a/b');
  });
});
