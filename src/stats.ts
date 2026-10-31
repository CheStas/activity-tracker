// Summary statistics: calendar days that run from reset hour to reset hour, periods (day, week, month, custom),
// totals per day, activity and category option, and the per-day rows. Pure: no DOM, no storage.
import type { PeriodKind, Segment, WeekStart } from './types.ts';

const DAY = 86400000;
const HOUR = 3600000;

// ---------- calendar days ----------

/** A calendar date as a day number (days since 1970-01-01). Arithmetic runs in UTC, so DST never shifts it. */
export type DayNum = number;

export const dayNum = (y: number, m: number, d: number): DayNum => Math.round(Date.UTC(y, m, d) / DAY);
export function ymd(n: DayNum): [number, number, number] {
  const d = new Date(n * DAY);
  return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
}
/** 0 = Sunday … 6 = Saturday. */
export const weekday = (n: DayNum) => new Date(n * DAY).getUTCDay();
/** Local noon of the day, for formatting its date. */
export const dayDate = (n: DayNum) => {
  const [y, m, d] = ymd(n);
  return new Date(y, m, d, 12);
};

/** The local timestamp where day n starts: its date at the reset hour. */
export function dayStart(n: DayNum, resetHour: number) {
  const [y, m, d] = ymd(n);
  return new Date(y, m, d, resetHour).getTime();
}

/** The day a timestamp belongs to; a day is labelled with the date it starts on. */
export function dayOf(ts: number, resetHour: number): DayNum {
  const d = new Date(ts);
  const n = dayNum(d.getFullYear(), d.getMonth(), d.getDate());
  return d.getHours() < resetHour ? n - 1 : n;
}

/** A piece of a session inside one day. `live`: the running session's piece that ends at now. */
export interface Piece {
  segId: string;
  /** The stored day record the session belongs to (for its snapshot). */
  dayId: string | null;
  activityId: string;
  start: number;
  end: number;
  live: boolean;
}

/** Sessions cut at the day boundaries, by day, each list sorted by start. The open session runs to `now`. */
export function splitDays(segments: Segment[], resetHour: number, now: number) {
  const out = new Map<DayNum, Piece[]>();
  for (const seg of segments) {
    const end = seg.end ?? now;
    let at = seg.start;
    let n = dayOf(at, resetHour);
    while (at < end) {
      const stop = Math.min(end, dayStart(n + 1, resetHour));
      if (stop > at) {
        const list = out.get(n) ?? out.set(n, []).get(n)!;
        list.push({ segId: seg.id, dayId: seg.dayId, activityId: seg.activityId, start: at, end: stop, live: seg.end === null && stop === end });
      }
      at = stop;
      n++;
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.start - b.start);
  return out;
}

// ---------- periods ----------

/** Both ends included. */
export interface Period {
  kind: PeriodKind;
  from: DayNum;
  to: DayNum;
}

/** The weekday a week starts on (0 = Sunday); "system" asks the locale and falls back to Monday. */
export function resolveWeekStart(ws: WeekStart, locale?: string): number {
  if (typeof ws === 'number') return ws;
  try {
    const loc = new Intl.Locale(locale ?? (typeof navigator === 'undefined' ? 'en-GB' : navigator.language)) as Intl.Locale & {
      weekInfo?: { firstDay: number }; getWeekInfo?: () => { firstDay: number };
    };
    const first = (loc.getWeekInfo?.() ?? loc.weekInfo)?.firstDay;
    if (first) return first % 7;
  } catch {}
  return 1;
}

export const weekOf = (n: DayNum, weekStart: number) => n - ((weekday(n) - weekStart + 7) % 7);

function monthOf(n: DayNum, shift = 0): [DayNum, DayNum] {
  const [y, m] = ymd(n);
  return [dayNum(y, m + shift, 1), dayNum(y, m + shift + 1, 1) - 1];
}

/** The period of a kind around a day; custom = the 7 days ending on it. */
export function periodOf(kind: PeriodKind, n: DayNum, weekStart: number): Period {
  if (kind === 'day') return { kind, from: n, to: n };
  if (kind === 'week') {
    const from = weekOf(n, weekStart);
    return { kind, from, to: from + 6 };
  }
  if (kind === 'month') {
    const [from, to] = monthOf(n);
    return { kind, from, to };
  }
  return { kind, from: n - 6, to: n };
}

export const periodLength = (p: Period) => p.to - p.from + 1;

/** One period earlier (dir -1) or later (+1): a day, week or month; a custom range by its own length. */
export function stepPeriod(p: Period, dir: number): Period {
  if (p.kind === 'month') {
    const [from, to] = monthOf(p.from, dir);
    return { ...p, from, to };
  }
  const len = p.kind === 'day' ? 1 : p.kind === 'week' ? 7 : periodLength(p);
  return { ...p, from: p.from + dir * len, to: p.to + dir * len };
}

/** The period the jump chip goes back to: today, this week, this month, or the last 7 days. */
export const currentPeriod = (kind: PeriodKind, today: DayNum, weekStart: number) => periodOf(kind, today, weekStart);
export const samePeriod = (a: Period, b: Period) => a.kind === b.kind && a.from === b.from && a.to === b.to;

export const QUICK_RANGES = ['Today', 'Yesterday', 'This week', 'Last week', 'Last 7 days', 'This month', 'Last month', 'Last 30 days'] as const;
export type QuickRange = (typeof QUICK_RANGES)[number];

export function quickRange(name: QuickRange, today: DayNum, weekStart: number): Period {
  switch (name) {
    case 'Today': return periodOf('day', today, weekStart);
    case 'Yesterday': return periodOf('day', today - 1, weekStart);
    case 'This week': return periodOf('week', today, weekStart);
    case 'Last week': return periodOf('week', today - 7, weekStart);
    case 'Last 7 days': return { kind: 'custom', from: today - 6, to: today };
    case 'This month': return periodOf('month', today, weekStart);
    case 'Last month': return stepPeriod(periodOf('month', today, weekStart), -1);
    case 'Last 30 days': return { kind: 'custom', from: today - 29, to: today };
  }
}

/** A picked range as a period: one day is a Day, a whole calendar week or month is that, anything else Custom. */
export function rangePeriod(from: DayNum, to: DayNum, weekStart: number): Period {
  const [a, b] = from <= to ? [from, to] : [to, from];
  if (a === b) return { kind: 'day', from: a, to: a };
  for (const kind of ['week', 'month'] as const) {
    const p = periodOf(kind, a, weekStart);
    if (p.from === a && p.to === b) return p;
  }
  return { kind: 'custom', from: a, to: b };
}

// ---------- statistics ----------

export interface DayStats {
  day: DayNum;
  pieces: Piece[];
  total: number;
  /** First start and last end, or null on a day with nothing tracked. */
  first: number | null;
  last: number | null;
  /** Gaps between the first start and the last end. */
  idle: number;
  byActivity: Map<string, number>;
}

export function dayStats(day: DayNum, pieces: Piece[] = []): DayStats {
  const byActivity = new Map<string, number>();
  let total = 0;
  for (const p of pieces) {
    byActivity.set(p.activityId, (byActivity.get(p.activityId) ?? 0) + p.end - p.start);
    total += p.end - p.start;
  }
  const first = pieces.length ? Math.min(...pieces.map((p) => p.start)) : null;
  const last = pieces.length ? Math.max(...pieces.map((p) => p.end)) : null;
  return { day, pieces, total, first, last, idle: first === null ? 0 : Math.max(0, last! - first - total), byActivity };
}

export interface PeriodStats {
  days: DayStats[];
  total: number;
  /** Days with any tracked time; averages divide by these. */
  tracked: number;
  byActivity: Map<string, number>;
  /** Average first start and last end as offsets from the day's start, over tracked days (null without any). */
  avgStart: number | null;
  avgEnd: number | null;
  longest: number;
}

export function periodStats(p: Period, byDay: Map<DayNum, Piece[]>, resetHour: number): PeriodStats {
  const days: DayStats[] = [];
  for (let n = p.from; n <= p.to; n++) days.push(dayStats(n, byDay.get(n)));
  const byActivity = new Map<string, number>();
  const starts: number[] = [];
  const ends: number[] = [];
  for (const d of days) {
    for (const [id, ms] of d.byActivity) byActivity.set(id, (byActivity.get(id) ?? 0) + ms);
    if (d.total > 0) {
      const base = dayStart(d.day, resetHour);
      starts.push(d.first! - base);
      ends.push(d.last! - base);
    }
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    days, byActivity, tracked: starts.length, avgStart: avg(starts), avgEnd: avg(ends),
    total: days.reduce((sum, d) => sum + d.total, 0), longest: Math.max(0, ...days.map((d) => d.total)),
  };
}

export const NOT_SET = '_none';

/** Totals by a key of the activity (its option of a dimension, NOT_SET without one), largest first. */
export function totalsBy(byActivity: Map<string, number>, keyOf: (activityId: string) => string) {
  const out = new Map<string, { total: number; activities: string[] }>();
  for (const [id, ms] of byActivity) {
    const k = keyOf(id);
    const g = out.get(k) ?? out.set(k, { total: 0, activities: [] }).get(k)!;
    g.total += ms;
    g.activities.push(id);
  }
  return [...out].sort((a, b) => b[1].total - a[1].total);
}

/** On how many tracked days the activity reached its target. */
export const targetMetDays = (days: DayStats[], activityId: string, targetMs: number) =>
  days.filter((d) => d.total > 0 && (d.byActivity.get(activityId) ?? 0) >= targetMs).length;

/** Per-day rows: two or more empty days in a row collapse into one gap row; a single empty day stays a row. */
export type DayRow = { kind: 'day'; stats: DayStats } | { kind: 'gap'; from: DayNum; to: DayNum };

export function dayRows(days: DayStats[]): DayRow[] {
  const rows: DayRow[] = [];
  for (let i = 0; i < days.length; i++) {
    let j = i;
    while (days[i].total === 0 && j + 1 < days.length && days[j + 1].total === 0) j++;
    if (j > i) {
      rows.push({ kind: 'gap', from: days[i].day, to: days[j].day });
      i = j;
    } else rows.push({ kind: 'day', stats: days[i] });
  }
  return rows;
}

/** Ranges longer than this show one row per week. */
export const WEEK_ROWS_AFTER = 45;

export interface WeekRow {
  from: DayNum;
  to: DayNum;
  total: number;
  byActivity: Map<string, number>;
}

/** One row per week (by the week start), clipped to the period. */
export function weekRows(days: DayStats[], weekStart: number): WeekRow[] {
  const rows: WeekRow[] = [];
  for (const d of days) {
    const from = weekOf(d.day, weekStart);
    let row = rows[rows.length - 1];
    if (!row || row.from !== Math.max(from, days[0].day)) {
      row = { from: Math.max(from, days[0].day), to: d.day, total: 0, byActivity: new Map() };
      rows.push(row);
    }
    row.to = d.day;
    row.total += d.total;
    for (const [id, ms] of d.byActivity) row.byActivity.set(id, (row.byActivity.get(id) ?? 0) + ms);
  }
  return rows;
}

/**
 * The shared time axis of the per-day rows, as offsets from the day's start: 08:00–20:00, widened to the earliest
 * start and latest end in view and rounded out to full hours.
 */
export function axisRange(days: DayStats[], resetHour: number): [number, number] {
  const lo0 = (((8 - resetHour) % 24) + 24) % 24 * HOUR;
  let lo = lo0;
  let hi = Math.min(lo0 + 12 * HOUR, DAY);
  for (const d of days) {
    if (d.first === null) continue;
    const base = dayStart(d.day, resetHour);
    lo = Math.min(lo, d.first - base);
    hi = Math.max(hi, d.last! - base);
  }
  return [Math.floor(lo / HOUR) * HOUR, Math.min(Math.ceil(hi / HOUR) * HOUR, 25 * HOUR)];
}

/** Four labels evenly over the axis, on full hours. */
export function axisTicks([lo, hi]: [number, number]) {
  return [0, 1, 2, 3].map((i) => Math.round((lo + ((hi - lo) * i) / 3) / HOUR) * HOUR);
}

/** Heat shading of a day: accent opacity 18–100% by its total relative to max(longest day in view, 8h). */
export function heat(total: number, longest: number) {
  if (!total) return 0;
  return 0.18 + 0.82 * Math.min(1, total / Math.max(longest, 8 * HOUR));
}
