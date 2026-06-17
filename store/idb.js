// Minimal promise-wrapped IndexedDB helper. One database, four object stores, each keyed by `id`.
// This is the only place that touches the raw IndexedDB API — everything else builds on idbPut/idbGet/etc.

const DB_NAME = 'repolens';
// v2 added 'collections'. v3 added 'decisions'. v4 added 'snapshots'. v5 added
// 'scenes'. v6 added 'mastery' (the Knowledge Game signal). Each upgrade is
// additive — onupgradeneeded creates any new store, so existing data survives.
const DB_VERSION = 6;
const STORES = ['repos', 'nodes', 'edges', 'collections', 'decisions', 'snapshots', 'scenes', 'mastery'];

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(store, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export const idbPut = (store, value) => run(store, 'readwrite', (os) => os.put(value));
export const idbGet = (store, id) => run(store, 'readonly', (os) => os.get(id));
export const idbGetAll = (store) => run(store, 'readonly', (os) => os.getAll());
export const idbDelete = (store, id) => run(store, 'readwrite', (os) => os.delete(id));
export const idbClear = (store) => run(store, 'readwrite', (os) => os.clear());
