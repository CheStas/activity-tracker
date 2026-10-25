// Thin IndexedDB wrapper. Stores: activities, days, segments (index dayId), settings (key/value).
import type { Activity, Day, Segment } from './types.ts';

const DB_NAME = 'activity-tracker';
const VERSION = 1;
export const STORES = ['activities', 'days', 'segments', 'settings'] as const;

interface Records {
  activities: Activity;
  days: Day;
  segments: Segment;
  settings: { key: string; value: unknown };
}
type Store = keyof Records;

export type Export = { app: string; version: number; exportedAt: number } & { [S in Store]: Records[S][] };

let dbPromise: Promise<IDBDatabase> | null = null;

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

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });

const result = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export async function getAll<S extends Store>(store: S): Promise<Records[S][]> {
  const db = await open();
  return result(db.transaction(store).objectStore(store).getAll());
}

export async function put<S extends Store>(store: S, ...values: Records[S][]) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  for (const v of values) tx.objectStore(store).put(v);
  return done(tx);
}

export async function del(store: Store, key: string) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return done(tx);
}

export async function segmentsOfDay(dayId: string): Promise<Segment[]> {
  const db = await open();
  return result(db.transaction('segments').objectStore('segments').index('dayId').getAll(dayId));
}

/** Replace all segments of a day atomically. */
export async function replaceDaySegments(dayId: string, segments: Segment[]) {
  const db = await open();
  const tx = db.transaction('segments', 'readwrite');
  const store = tx.objectStore('segments');
  const keys = await result(store.index('dayId').getAllKeys(dayId));
  for (const k of keys) store.delete(k);
  for (const s of segments) store.put({ ...s, dayId });
  return done(tx);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await open();
  const row: Records['settings'] | undefined = await result(db.transaction('settings').objectStore('settings').get(key));
  return row ? (row.value as T) : fallback;
}

export const setSetting = (key: string, value: unknown) => put('settings', { key, value });

export async function exportAll(): Promise<Export> {
  const out = { app: DB_NAME, version: VERSION, exportedAt: Date.now() } as Export;
  for (const s of STORES) (out[s] as unknown[]) = await getAll(s);
  return out;
}

export async function importAll(data: Partial<Export> | null) {
  if (data?.app !== DB_NAME) throw new Error('Not an activity-tracker export');
  const db = await open();
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) {
    tx.objectStore(s).clear();
    for (const v of data[s] ?? []) tx.objectStore(s).put(v);
  }
  return done(tx);
}
