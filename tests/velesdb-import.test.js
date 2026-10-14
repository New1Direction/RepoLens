import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { importFromVelesdb } from '../src/migrate/velesdb-import.js';
import { clearLibrary, scrollPoints } from '../src/store.js';

afterEach(async () => {
  vi.unstubAllGlobals();
  await clearLibrary();
});

it('imports repository records over HTTPS and explicit loopback HTTP', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ points: [{ payload: { repoId: 'review/example', language: 'Rust' } }] }),
    })
  );
  for (const url of ['https://db.example.com', 'http://localhost:9090', 'http://127.0.0.1:9090']) {
    expect(await importFromVelesdb(url)).toEqual({ imported: 1, failed: 0, total: 1 });
  }
  expect((await scrollPoints()).map((row) => row.payload.repoId)).toEqual(['review/example']);
});

it('rejects remote HTTP and embedded credentials before sending an import request', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  for (const url of [
    'http://db.example.com',
    'http://192.168.1.2',
    'https://user:pass@db.example.com',
    'file:///tmp/data',
  ]) {
    await expect(importFromVelesdb(url)).rejects.toThrow(/Use HTTPS/);
  }
  expect(fetch).not.toHaveBeenCalled();
});
