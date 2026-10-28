// Thin IndexedDB wrapper. Stores: profiles, groups / activities / days (index profileId), segments (index dayId),
// settings (key/value).
import type { Activity, Day, Group, Profile, Segment } from './types.ts';
import type { ProfileData } from './backup.ts';

const DB_NAME = 'activity-tracker';
const VERSION = 2;

interface Records {
  profiles: Profile;
  groups: Group;
  activities: Activity;
  days: Day;
  segments: Segment;
  settings: { key: string; value: unknown };
}
type Store = keyof Records;
type ProfileStore = 'groups' | 'activities' | 'days';

let dbPromise: Promise<IDBDatabase> | null = null;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      const tx = req.transaction!;
      if (e.oldVersion < 1) {
        db.createObjectStore('activities', { keyPath: 'id' });
        db.createObjectStore('days', { keyPath: 'id' });
        db.createObjectStore('segments', { keyPath: 'id' }).createIndex('dayId', 'dayId');
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (e.oldVersion < 2) {
        // v1 records have no profileId; state.init() moves them into a "Default" profile.
        db.createObjectStore('profiles', { keyPath: 'id' });
        db.createObjectStore('groups', { keyPath: 'id' }).createIndex('profileId', 'profileId');
        tx.objectStore('activities').createIndex('profileId', 'profileId');
        tx.objectStore('days').createIndex('profileId', 'profileId');
      }
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

export async function getAllOf<S extends ProfileStore>(store: S, profileId: string): Promise<Records[S][]> {
  const db = await open();
  return result(db.transaction(store).objectStore(store).index('profileId').getAll(profileId));
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

/** A profile's groups, activities, days and the days' segments. */
export async function profileData(profileId: string): Promise<ProfileData> {
  const [groups, activities, days] = await Promise.all([getAllOf('groups', profileId), getAllOf('activities', profileId), getAllOf('days', profileId)]);
  const segments = (await Promise.all(days.map((d) => segmentsOfDay(d.id)))).flat();
  return { groups, activities, days, segments };
}

/**
 * Atomically delete a profile's groups, activities, days and segments, then either store `replacement` (the profile
 * record and its new data) or, without it, delete the profile record too.
 */
export async function replaceProfile(profileId: string, replacement?: { profile: Profile } & ProfileData) {
  const db = await open();
  const tx = db.transaction(['profiles', 'groups', 'activities', 'days', 'segments'], 'readwrite');
  for (const s of ['groups', 'activities'] as const) {
    for (const k of await result(tx.objectStore(s).index('profileId').getAllKeys(profileId))) tx.objectStore(s).delete(k);
  }
  const segments = tx.objectStore('segments');
  for (const dayId of await result(tx.objectStore('days').index('profileId').getAllKeys(profileId))) {
    tx.objectStore('days').delete(dayId);
    for (const k of await result(segments.index('dayId').getAllKeys(dayId))) segments.delete(k);
  }
  if (replacement) {
    tx.objectStore('profiles').put(replacement.profile);
    for (const s of ['groups', 'activities', 'days', 'segments'] as const) {
      for (const v of replacement[s]) tx.objectStore(s).put(v);
    }
  } else {
    tx.objectStore('profiles').delete(profileId);
  }
  return done(tx);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await open();
  const row: Records['settings'] | undefined = await result(db.transaction('settings').objectStore('settings').get(key));
  return row ? (row.value as T) : fallback;
}

export const setSetting = (key: string, value: unknown) => put('settings', { key, value });
