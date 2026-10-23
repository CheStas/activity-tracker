// App state: current day, its segments, activities and settings. All mutations go through here.
import * as db from './db.js';
import { assign, switchTo, closeAt, totals, dayTotal, openSegment, uuid } from './timeline.js';

export const PALETTE = ['#4f8cff', '#f2994a', '#27ae60', '#bb6bd9', '#eb5757', '#2d9cdb', '#f2c94c', '#6fcf97', '#ff7eb6', '#9b8cff'];
const SEED = ['break', 'meeting', 'task', 'pr review', 'communication', 'setup', 'prepare ticket'];
const DEFAULT_SETTINGS = {
  resetHour: 0, popularity: false, autoExport: false, startFullscreen: false, keepAwake: true,
  minSwitchSec: 60, // shorter runs are absorbed by a neighbour (0 = off)
  theme: 'system', // system | dark | light
  layout: 'rows', // rows (horizontal) | tiles (grid) | circles
};

export const state = {
  activities: [], // includes archived
  day: null, // {id, startedAt, endedAt, snapshot}
  segments: [], // current day
  settings: { ...DEFAULT_SETTINGS },
};

const listeners = new Set();
export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = (event, payload) => listeners.forEach((fn) => fn(event, payload));

// Serialize writes so rapid taps cannot interleave transactions.
let writeChain = Promise.resolve();
const queue = (fn) => (writeChain = writeChain.then(fn).catch((e) => console.error(e)));

const uid = uuid;
const opts = () => ({ dayId: state.day.id });

export async function init() {
  for (const key of Object.keys(DEFAULT_SETTINGS)) state.settings[key] = await db.getSetting(key, DEFAULT_SETTINGS[key]);
  state.activities = (await db.getAll('activities')).sort((a, b) => a.order - b.order);
  if (state.activities.length === 0) {
    state.activities = SEED.map((name, i) => newActivity(name, i));
    await db.put('activities', ...state.activities);
  }
  const days = await db.getAll('days');
  state.day = days.find((d) => d.endedAt === null) ?? (await startDay(Date.now()));
  state.segments = await db.segmentsOfDay(state.day.id);
  await checkRollover(Date.now());
  emit('change');
}

function newActivity(name, order) {
  return { id: uid(), name, color: PALETTE[order % PALETTE.length], order, archived: false, hiddenForDayId: null, targetMin: null };
}

async function startDay(at) {
  const day = { id: uid(), startedAt: at, endedAt: null, snapshot: null };
  await db.put('days', day);
  return day;
}

// ---------- derived ----------

export const visibleActivities = () =>
  state.activities.filter((a) => !a.archived && a.hiddenForDayId !== state.day.id);

export const activeSegment = () => openSegment(state.segments);
export const todayTotals = (now = Date.now()) => totals(state.segments, now);
export const todayTotal = (now = Date.now()) => dayTotal(state.segments, now);
export const activityById = (id) => state.activities.find((a) => a.id === id);
/** Start of today's first activity, or null before anything is tracked. */
export const firstStart = () => (state.segments.length ? Math.min(...state.segments.map((s) => s.start)) : null);

export function canHideToday(id) {
  return !state.segments.some((s) => s.activityId === id);
}

/** Next automatic reset boundary after the day started. */
export function nextBoundary(startedAt, resetHour = state.settings.resetHour) {
  const d = new Date(startedAt);
  d.setHours(resetHour, 0, 0, 0);
  if (d.getTime() <= startedAt) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function lastBoundaryBefore(now, resetHour = state.settings.resetHour) {
  const d = new Date(now);
  d.setHours(resetHour, 0, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

// ---------- timeline mutations ----------

function clampRange(from, to, now) {
  const f = Math.min(Math.max(from, state.day.startedAt), now);
  const t = to === null ? null : Math.min(Math.max(to, f), now);
  return [f, t];
}

function commit(segments) {
  state.segments = segments;
  const dayId = state.day.id;
  queue(() => db.replaceDaySegments(dayId, segments));
  emit('change');
}

/** Tap: switch to activity, or stop all if it is the active one. Runs under the minimum switch are absorbed. */
export function tap(activityId, now = Date.now()) {
  const open = activeSegment();
  const target = open?.activityId === activityId ? null : activityId;
  commit(switchTo(state.segments, target, now, state.settings.minSwitchSec * 1000, opts()));
}

/** assign(activityId|null, from, to|null) clamped to the current day and now. */
export function assignRange(activityId, from, to, now = Date.now()) {
  const [f, t] = clampRange(from, to, now);
  commit(assign(state.segments, activityId, f, t, opts()));
}

export function deleteSession(seg) {
  commit(state.segments.filter((s) => s.id !== seg.id));
}

/** Move a session to [start, end|null]; carves out whatever it now overlaps. */
export function editSession(seg, start, end, now = Date.now()) {
  const without = state.segments.filter((s) => s.id !== seg.id);
  const [f, t] = clampRange(start, end, now);
  commit(assign(without, seg.activityId, f, t, opts()));
}

export function clearDay() {
  commit([]);
}

// ---------- day lifecycle ----------

async function closeDay(at) {
  const segments = closeAt(state.segments, at, opts());
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
    emit('dayClosed', { day, segments });
  }
}

export async function resetDay(now = Date.now()) {
  await closeDay(now);
  state.day = await startDay(now);
  state.segments = [];
  emit('change');
}

/** Called every tick; closes the day at the reset boundary if it has passed. */
let rolling = false;
export async function checkRollover(now = Date.now()) {
  if (rolling) return;
  const boundary = nextBoundary(state.day.startedAt);
  if (now < boundary) return;
  rolling = true;
  try {
    await closeDay(boundary);
    state.day = await startDay(Math.max(boundary, lastBoundaryBefore(now)));
    state.segments = [];
    emit('change');
  } finally {
    rolling = false;
  }
}

// ---------- activities ----------

function saveActivities(...list) {
  queue(() => db.put('activities', ...list));
  emit('change');
}

export function addActivities(text) {
  const names = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  let order = Math.max(-1, ...state.activities.map((a) => a.order)) + 1;
  const added = names.map((name) => newActivity(name, order++));
  state.activities.push(...added);
  if (added.length) saveActivities(...added);
}

export function updateActivity(id, patch) {
  const a = activityById(id);
  Object.assign(a, patch);
  saveActivities(a);
}

export function moveActivity(id, dir) {
  const list = state.activities.filter((a) => !a.archived);
  const i = list.findIndex((a) => a.id === id);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i].order, list[j].order] = [list[j].order, list[i].order];
  state.activities.sort((a, b) => a.order - b.order);
  saveActivities(list[i], list[j]);
}

/** Soft delete: history keeps referencing the activity. Stops it if active. */
export function removeActivity(id) {
  if (activeSegment()?.activityId === id) tap(id);
  updateActivity(id, { archived: true });
}

export const restoreActivity = (id) => updateActivity(id, { archived: false });

export function setHiddenToday(id, hidden) {
  if (hidden && !canHideToday(id)) return;
  updateActivity(id, { hiddenForDayId: hidden ? state.day.id : null });
}

// ---------- settings / history / backup ----------

export function setSetting(key, value) {
  state.settings[key] = value;
  queue(() => db.setSetting(key, value));
  emit('change');
}

/** All days (newest first) with their segments. */
export async function history() {
  await writeChain;
  const days = (await db.getAll('days')).sort((a, b) => b.startedAt - a.startedAt);
  return Promise.all(days.map(async (d) => ({ day: d, segments: d.id === state.day.id ? state.segments : await db.segmentsOfDay(d.id) })));
}

export async function exportData() {
  await writeChain;
  return db.exportAll();
}

export async function importData(data) {
  await writeChain;
  await db.importAll(data);
  await init();
}
