// Stockage des prises dans IndexedDB (sur l'appareil uniquement).
const DB_NAME = 'voix';
const STORE = 'prises';
let dbPromise = null;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function db() {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

function run(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export const put = (prise) => run('readwrite', (s) => s.put(prise));
export const all = () => run('readonly', (s) => s.getAll());
export const get = (id) => run('readonly', (s) => s.get(id));
export const remove = (id) => run('readwrite', (s) => s.delete(id));
