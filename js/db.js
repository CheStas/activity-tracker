// Thin IndexedDB wrapper. Stores: activities, days, segments (index dayId), settings (key/value).

const DB_NAME = 'activity-tracker';
const VERSION = 1;
export const STORES = ['activities', 'days', 'segments', 'settings'];

let dbPromise = null;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('activities', { keyPath: 'id' });
      db.createObjectStore('days', { keyPath: 'id' });
      db.createObjectStore('segments', { keyPath: 'id' }).createIndex('dayId', 'dayId');
      db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });

const result = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export async function getAll(store) {
  const db = await open();
  return result(db.transaction(store).objectStore(store).getAll());
}

export async function put(store, ...values) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  for (const v of values) tx.objectStore(store).put(v);
  return done(tx);
}

export async function del(store, key) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return done(tx);
}

export async function segmentsOfDay(dayId) {
  const db = await open();
  return result(db.transaction('segments').objectStore('segments').index('dayId').getAll(dayId));
}

/** Replace all segments of a day atomically. */
export async function replaceDaySegments(dayId, segments) {
  const db = await open();
  const tx = db.transaction('segments', 'readwrite');
  const store = tx.objectStore('segments');
  const keys = await result(store.index('dayId').getAllKeys(dayId));
  for (const k of keys) store.delete(k);
  for (const s of segments) store.put({ ...s, dayId });
  return done(tx);
}

export async function getSetting(key, fallback) {
  const db = await open();
  const row = await result(db.transaction('settings').objectStore('settings').get(key));
  return row ? row.value : fallback;
}

export const setSetting = (key, value) => put('settings', { key, value });

export async function exportAll() {
  const out = { app: DB_NAME, version: VERSION, exportedAt: Date.now() };
  for (const s of STORES) out[s] = await getAll(s);
  return out;
}

export async function importAll(data) {
  if (data?.app !== DB_NAME) throw new Error('Not an activity-tracker export');
  const db = await open();
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) {
    tx.objectStore(s).clear();
    for (const v of data[s] ?? []) tx.objectStore(s).put(v);
  }
  return done(tx);
}
