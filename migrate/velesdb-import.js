// One-time migration from a VelesDB server into the extension's own IndexedDB store.
// This is the ONLY file that still speaks to VelesDB — once you've migrated, it can be deleted.

import { saveRepo } from '../store.js';

function normalizeUrl(url) {
  return (url || '').trim().replace(/\/+$/, '') || 'http://localhost:9090';
}

/**
 * Read every saved repo from a running VelesDB and copy it into the new store.
 * `onProgress({ imported, failed, total })` fires as it goes. Returns the final tally.
 * Idempotent — re-running overwrites by id, never duplicates. The Connections graph is
 * not migrated (it rebuilds through use).
 */
export async function importFromVelesdb(url, onProgress = () => {}) {
  const base = normalizeUrl(url);
  const res = await fetch(`${base}/v1/collections/repos/points/scroll`, {
    method: 'POST',
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
