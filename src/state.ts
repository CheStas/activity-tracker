// App state: the open profile, its groups, activities, current day and segments, and settings.
// All mutations go through here.
import * as db from './db.ts';
import { assign, switchTo, closeAt, totals, dayTotal, openSegment, uuid } from './timeline.ts';
import { seed, seedRecords, newActivity, nameKey, withDefaults } from './seed.ts';
import { profileExport, readImport, normalizeGroup } from './backup.ts';
import type { Activity, Day, Group, Profile, Segment, Settings } from './types.ts';

const DEFAULT_SETTINGS = seed.settings;
const ACTIVE_PROFILE = 'activeProfileId'; // settings-store key; the only app-wide setting

// Everything below `profiles` belongs to the open profile (settings are state.profile.settings);
// init()/switchProfile() set it before anything renders.
export const state = {
  profiles: [] as Profile[],
  profile: null as unknown as Profile,
  groups: [] as Group[],
  activities: [] as Activity[], // includes archived
  day: null as unknown as Day,
  segments: [] as Segment[], // current day
  /** A closed day open in the day editor, with its segments; null while the editor shows today. */
  pastDay: null as DayEdit | null,
};

/** A day and its segments, the target of a timeline edit. */
export interface DayEdit {
  day: Day;
  segments: Segment[];
}

export type StateEvent = 'change' | 'dayClosed';
export interface DayClosed {
  profile: string;
  day: Day;
  segments: Segment[];
}
type Listener = (event: StateEvent, payload?: DayClosed) => void;

const listeners = new Set<Listener>();
export const subscribe = (fn: Listener) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const emit = (event: StateEvent, payload?: DayClosed) => listeners.forEach((fn) => fn(event, payload));

// Serialize writes so rapid taps cannot interleave transactions.
let writeChain: Promise<unknown> = Promise.resolve();
const queue = (fn: () => Promise<unknown>) => (writeChain = writeChain.then(fn).catch((e) => console.error(e)));

const uid = uuid;

const byOrder = <T extends { order: number }>(list: T[]) => list.sort((a, b) => a.order - b.order);

export async function init() {
  let profiles = byOrder(await db.getAll('profiles'));
  if (profiles.length === 0) profiles = await firstRun();
  state.profiles = profiles;
  const activeId = await db.getSetting<string | null>(ACTIVE_PROFILE, null);
  await openProfile(profiles.find((p) => p.id === activeId) ?? profiles[0]);
}

/** Empty profile store: adopt records from before profiles existed (v1), or create the profiles from the seed. */
async function firstRun(): Promise<Profile[]> {
  const activities = (await db.getAll('activities')).filter((a) => !a.profileId);
  const days = (await db.getAll('days')).filter((d) => !d.profileId);
  if (activities.length || days.length) {
    const settings = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(settings) as (keyof Settings)[]) {
      (settings[key] as unknown) = await db.getSetting(key, settings[key]);
    }
    const profile: Profile = { id: uid(), name: 'Default', order: 0, settings };
    await db.put('profiles', profile);
    await db.put('activities', ...activities.map((a) => ({ ...a, profileId: profile.id, groupId: null })));
    await db.put('days', ...days.map((d) => ({ ...d, profileId: profile.id })));
    return [profile];
  }
  const records = seedRecords(seed, uid);
  await db.put('profiles', ...records.profiles);
  await db.put('groups', ...records.groups);
  await db.put('activities', ...records.activities);
  return records.profiles;
}

/** Load a profile and make it the open one. All profile state is assigned at once, after loading. */
async function openProfile(profile: Profile) {
  await writeChain;
  await rolling;
  const [groups, activities, days] = await Promise.all([
    db.getAllOf('groups', profile.id), db.getAllOf('activities', profile.id), db.getAllOf('days', profile.id),
  ]);
  const day = days.find((d) => d.endedAt === null) ?? (await startDay(profile.id, Date.now()));
  const segments = await db.segmentsOfDay(day.id);
  profile.settings = withDefaults(profile.settings); // settings added since the profile was stored
  Object.assign(state, { profile, groups: byOrder(groups.map(normalizeGroup)), activities: byOrder(activities), day, segments, pastDay: null });
  await checkRollover(Date.now());
  emit('change');
}

async function startDay(profileId: string, at: number) {
  const day: Day = { id: uid(), profileId, startedAt: at, endedAt: null, snapshot: null };
  await db.put('days', day);
  return day;
}

// ---------- derived ----------

export const groupById = (id: string | null) => state.groups.find((g) => g.id === id);
export const isGroupOn = (g: Group) => g.on;

/** Main-screen buttons: not removed, not hidden today, and in no group or a group that is on (the active one always). */
export function visibleActivities() {
  const activeId = activeSegment()?.activityId;
  return state.activities.filter((a) => {
    if (a.archived || a.hiddenForDayId === state.day.id) return false;
    const g = groupById(a.groupId);
    return !g || isGroupOn(g) || a.id === activeId;
  });
}

export const liveActivities = () => state.activities.filter((a) => !a.archived);

export const activeSegment = () => openSegment(state.segments);
export const todayTotals = (now = Date.now()) => totals(state.segments, now);
export const todayTotal = (now = Date.now()) => dayTotal(state.segments, now);
export const activityById = (id: string) => state.activities.find((a) => a.id === id);
/** Start of today's first activity, or null before anything is tracked. */
export const firstStart = () => (state.segments.length ? Math.min(...state.segments.map((s) => s.start)) : null);

export function canHideToday(id: string) {
  return !state.segments.some((s) => s.activityId === id);
}

/** Next automatic reset boundary after the day started. */
export function nextBoundary(startedAt: number, resetHour = state.profile.settings.resetHour) {
  const d = new Date(startedAt);
  d.setHours(resetHour, 0, 0, 0);
  if (d.getTime() <= startedAt) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function lastBoundaryBefore(now: number, resetHour = state.profile.settings.resetHour) {
  const d = new Date(now);
  d.setHours(resetHour, 0, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

// ---------- timeline mutations ----------

const today = (): DayEdit => ({ day: state.day, segments: state.segments });
const opts = (day: Day) => ({ dayId: day.id });

/** The day a segment belongs to: today, or the closed day open in the day editor (null for any other day). */
function dayOf(dayId: string | null): DayEdit | null {
  if (dayId === state.day.id) return today();
  return state.pastDay?.day.id === dayId ? state.pastDay : null;
}

/** Clamp to the day: [day start, now] for today, [start, end] for a closed day. */
function clampRange(day: Day, from: number, to: number | null, now: number): [number, number | null] {
  const last = day.endedAt ?? now;
  const f = Math.min(Math.max(from, day.startedAt), last);
  const t = to === null ? (day.endedAt === null ? null : last) : Math.min(Math.max(to, f), last);
  return [f, t];
}

/** Store a day's new segments; a closed day's snapshot total follows. */
function commit(day: Day, segments: Segment[]) {
  if (day.id === state.day.id) {
    state.segments = segments;
  } else {
    if (day.snapshot) day.snapshot = { ...day.snapshot, total: dayTotal(segments, day.endedAt!) };
    state.pastDay = { day, segments };
    queue(() => db.put('days', day));
  }
  queue(() => db.replaceDaySegments(day.id, segments));
  emit('change');
}

/** Tap: switch to activity, or stop all if it is the active one. Runs under the minimum switch are absorbed. */
export function tap(activityId: string, now = Date.now()) {
  const open = activeSegment();
  const target = open?.activityId === activityId ? null : activityId;
  commit(state.day, switchTo(state.segments, target, now, state.profile.settings.minSwitchSec * 1000, opts(state.day)));
}

/** assign(activityId|null, from, to|null) on a day (default today), clamped to that day and now. */
export function assignRange(activityId: string | null, from: number, to: number | null, dayId = state.day.id, now = Date.now()) {
  const target = dayOf(dayId);
  if (!target) return;
  const [f, t] = clampRange(target.day, from, to, now);
  commit(target.day, assign(target.segments, activityId, f, t, opts(target.day)));
}

export function deleteSession(seg: Segment) {
  const target = dayOf(seg.dayId);
  if (target) commit(target.day, target.segments.filter((s) => s.id !== seg.id));
}

/** Move a session to [start, end|null]; carves out whatever it now overlaps. */
export function editSession(seg: Segment, start: number, end: number | null, now = Date.now()) {
  const target = dayOf(seg.dayId);
  if (!target) return;
  const without = target.segments.filter((s) => s.id !== seg.id);
  const [f, t] = clampRange(target.day, start, end, now);
  commit(target.day, assign(without, seg.activityId, f, t, opts(target.day)));
}

export function clearDay(dayId = state.day.id) {
  const target = dayOf(dayId);
  if (target) commit(target.day, []);
}

/** The open profile's days, oldest first (today is the last one). */
export async function dayList() {
  await writeChain;
  return (await db.getAllOf('days', state.profile.id)).sort((a, b) => a.startedAt - b.startedAt);
}

/** Show a closed day in the day editor; null (or today) goes back to today. */
export async function openPastDay(day: Day | null) {
  await writeChain;
  state.pastDay = day && day.id !== state.day.id ? { day, segments: await db.segmentsOfDay(day.id) } : null;
  emit('change');
}

// ---------- day lifecycle ----------

async function closeDay(at: number) {
  const segments = closeAt(state.segments, at, opts(state.day));
  const day = { ...state.day, endedAt: at };
  await writeChain;
  if (segments.length === 0) {
    await db.replaceDaySegments(day.id, []);
    await db.del('days', day.id);
  } else {
    day.snapshot = {
      activities: Object.fromEntries(state.activities.map((a) => [a.id, { name: a.name, color: a.color, targetMin: a.targetMin }])),
      total: dayTotal(segments, at),
    };
    await db.replaceDaySegments(day.id, segments);
    await db.put('days', day);
    emit('dayClosed', { profile: state.profile.name, day, segments });
  }
}

export async function resetDay(now = Date.now()) {
  await closeDay(now);
  state.day = await startDay(state.profile.id, now);
  state.segments = [];
  emit('change');
}

/** Called every tick; closes the day at the reset boundary if it has passed. `rolling` is the running rollover. */
let rolling: Promise<void> | null = null;
export async function checkRollover(now = Date.now()) {
  if (rolling) return;
  const boundary = nextBoundary(state.day.startedAt);
  if (now < boundary) return;
  rolling = (async () => {
    await closeDay(boundary);
    state.day = await startDay(state.profile.id, Math.max(boundary, lastBoundaryBefore(now)));
    state.segments = [];
    emit('change');
  })().finally(() => (rolling = null));
  await rolling;
}

// ---------- activities ----------

function saveActivities(...list: Activity[]) {
  queue(() => db.put('activities', ...list));
  emit('change');
}

/** The activity (live or removed, not deleted) that already has this name, ignoring `exceptId`. */
export const activityNamed = (name: string, exceptId?: string) =>
  state.activities.find((a) => !a.deleted && a.id !== exceptId && nameKey(a.name) === nameKey(name));

/**
 * Add activities by name; returns the names refused because an activity (live or removed) already has them.
 * A name of a deleted activity brings that record back as a new button, so its history and the new time are one
 * activity.
 */
export function addActivities(text: string) {
  const names = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  let order = Math.max(-1, ...state.activities.map((a) => a.order)) + 1;
  const taken: string[] = [];
  const saved: Activity[] = [];
  for (const name of names) {
    if (activityNamed(name)) {
      taken.push(name);
      continue;
    }
    const old = state.activities.find((a) => a.deleted && nameKey(a.name) === nameKey(name));
    if (old) {
      Object.assign(old, { name, order: order++, archived: false, deleted: false, hiddenForDayId: null, groupId: null, targetMin: null });
      saved.push(old);
    } else {
      const a = newActivity(name, order++, state.profile.id, uid());
      state.activities.push(a);
      saved.push(a);
    }
  }
  byOrder(state.activities);
  if (saved.length) saveActivities(...saved);
  return taken;
}

/** Rename unless another activity already has the name; returns whether it was renamed. */
export function renameActivity(id: string, name: string) {
  if (activityNamed(name, id)) return false;
  updateActivity(id, { name });
  return true;
}

export function updateActivity(id: string, patch: Partial<Activity>) {
  const a = activityById(id);
  if (!a) return;
  Object.assign(a, patch);
  saveActivities(a);
}

export function moveActivity(id: string, dir: number) {
  const list = state.activities.filter((a) => !a.archived);
  const i = list.findIndex((a) => a.id === id);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i].order, list[j].order] = [list[j].order, list[i].order];
  state.activities.sort((a, b) => a.order - b.order);
  saveActivities(list[i], list[j]);
}

/** Soft delete: history keeps referencing the activity. Stops it if active. */
export function removeActivity(id: string) {
  if (activeSegment()?.activityId === id) tap(id);
  updateActivity(id, { archived: true });
}

export const restoreActivity = (id: string) => updateActivity(id, { archived: false });

/** Drop a removed activity from Settings for good. Its record and history stay; see addActivities. */
export function deleteActivity(id: string) {
  if (activityById(id)?.archived) updateActivity(id, { deleted: true });
}

export function setHiddenToday(id: string, hidden: boolean) {
  if (hidden && !canHideToday(id)) return;
  updateActivity(id, { hiddenForDayId: hidden ? state.day.id : null });
}

// ---------- groups ----------

function saveGroups(...list: Group[]) {
  queue(() => db.put('groups', ...list));
  emit('change');
}

export function addGroups(text: string) {
  const names = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  let order = Math.max(-1, ...state.groups.map((g) => g.order)) + 1;
  const added = names.map((name): Group => ({ id: uid(), profileId: state.profile.id, name, order: order++, on: true }));
  state.groups.push(...added);
  if (added.length) saveGroups(...added);
}

export function updateGroup(id: string, patch: Partial<Group>) {
  const g = groupById(id);
  if (!g) return;
  Object.assign(g, patch);
  saveGroups(g);
}

export function moveGroup(id: string, dir: number) {
  const i = state.groups.findIndex((g) => g.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= state.groups.length) return;
  const [a, b] = [state.groups[i], state.groups[j]];
  [a.order, b.order] = [b.order, a.order];
  byOrder(state.groups);
  saveGroups(a, b);
}

/** Delete a group; its activities (removed ones too) move to "no group". */
export function removeGroup(id: string) {
  const members = state.activities.filter((a) => a.groupId === id);
  for (const a of members) a.groupId = null;
  state.groups = state.groups.filter((g) => g.id !== id);
  queue(async () => {
    await db.put('activities', ...members);
    await db.del('groups', id);
  });
  emit('change');
}

// ---------- profiles ----------

export async function switchProfile(id: string) {
  const p = state.profiles.find((x) => x.id === id);
  if (!p || p.id === state.profile.id) return;
  queue(() => db.setSetting(ACTIVE_PROFILE, id));
  await openProfile(p);
}

/** New profile without data and with a copy of the open profile's settings. */
export function addProfile(name: string) {
  const profile: Profile = {
    id: uid(), name, order: Math.max(-1, ...state.profiles.map((p) => p.order)) + 1, settings: { ...state.profile.settings },
  };
  state.profiles.push(profile);
  queue(() => db.put('profiles', profile));
  emit('change');
  return profile;
}

export function renameProfile(id: string, name: string) {
  const p = state.profiles.find((x) => x.id === id);
  if (!p) return;
  p.name = name;
  queue(() => db.put('profiles', p));
  emit('change');
}

/** Permanently delete a profile that is not open, with all its data. */
export function removeProfile(id: string) {
  if (id === state.profile.id) return;
  state.profiles = state.profiles.filter((p) => p.id !== id);
  queue(() => db.replaceProfile(id));
  emit('change');
}

// ---------- settings / history / backup ----------

/** Settings belong to the open profile. */
export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  const p = state.profile;
  p.settings[key] = value;
  queue(() => db.put('profiles', p));
  emit('change');
}

/** All days of the open profile (newest first) with their segments. */
export async function history() {
  await writeChain;
  const days = (await db.getAllOf('days', state.profile.id)).sort((a, b) => b.startedAt - a.startedAt);
  return Promise.all(days.map(async (d) => ({ day: d, segments: d.id === state.day.id ? state.segments : await db.segmentsOfDay(d.id) })));
}

/** The open profile as a backup file. */
export async function exportData() {
  await writeChain;
  return profileExport(state.profile, await db.profileData(state.profile.id));
}

/** Replace the open profile's data and settings with a backup file's; other profiles are untouched. */
export async function importData(raw: unknown) {
  const { settings, ...data } = readImport(raw, state.profile.id, uid);
  await writeChain;
  await rolling;
  const profile = { ...state.profile, settings: { ...DEFAULT_SETTINGS, ...state.profile.settings, ...settings } };
  await db.replaceProfile(profile.id, { profile, ...data });
  state.profiles = state.profiles.map((p) => (p.id === profile.id ? profile : p));
  await openProfile(profile);
}
