// One-time migration from a VelesDB server into the extension's own IndexedDB store.
// This is the ONLY file that still speaks to VelesDB — once you've migrated, it can be deleted.

import { saveRepo } from '../store.js';

export function normalizeVelesdbUrl(url) {
  const base = (url || '').trim().replace(/\/+$/, '') || 'http://localhost:9090';
  const u = new URL(base);
  const loopback = ['localhost', '127.0.0.1'].includes(u.hostname);
  if (
    (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  ) {
    throw new Error('Use HTTPS for VelesDB, or HTTP on localhost/127.0.0.1, without URL credentials.');
  }
  return base;
}

/**
 * Read every saved repo from a running VelesDB and copy it into the new store.
 * `onProgress({ imported, failed, total })` fires as it goes. Returns the final tally.
 * Idempotent — re-running overwrites by id, never duplicates. The Connections graph is
 * not migrated (it rebuilds through use).
 */
export async function importFromVelesdb(url, onProgress = () => {}) {
  const base = normalizeVelesdbUrl(url);
  const res = await fetch(`${base}/v1/collections/repos/points/scroll`, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 1000, with_payload: true }),
  });
  if (!res.ok) throw new Error(`VelesDB returned ${res.status}`);

  const { points = [] } = await res.json();
  const rows = points.filter((pt) => pt && pt.payload && pt.payload.repoId).map((pt) => pt.payload);

  let imported = 0;
  let failed = 0;
  for (const payload of rows) {
    try {
      await saveRepo(payload);
      imported++;
    } catch {
      failed++;
    }
    onProgress({ imported, failed, total: rows.length });
  }
  return { imported, failed, total: rows.length };
}
