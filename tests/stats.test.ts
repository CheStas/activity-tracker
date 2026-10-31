import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  dayNum, dayOf, dayStart, weekday, splitDays, periodOf, stepPeriod, quickRange, rangePeriod, resolveWeekStart,
  periodStats, totalsBy, dayRows, weekRows, axisRange, targetMetDays, heat, NOT_SET,
} from '../src/stats.ts';
import type { Segment } from '../src/types.ts';

const H = 3600000;
const M = 60000;
// Local times, so the tests pass in any time zone.
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
let n = 0;
const seg = (activityId: string, start: number, end: number | null): Segment => ({ id: `s${++n}`, dayId: 'd', activityId, start, end });
const OCT = (d: number) => dayNum(2026, 9, d);

test('a day runs from reset hour to reset hour and is labelled with the date it starts on', () => {
  assert.equal(dayOf(at(28, 3), 0), OCT(28));
  assert.equal(dayOf(at(28, 3), 4), OCT(27)); // before the 04:00 reset: still the 27th
  assert.equal(dayOf(at(28, 4), 4), OCT(28));
  assert.equal(dayStart(OCT(28), 4), at(28, 4));
});

test('a session over the reset hour splits between the two days; the open one runs to now', () => {
  const byDay = splitDays([seg('a', at(27, 22), at(28, 2)), seg('b', at(28, 9), null)], 0, at(28, 10));
  assert.deepEqual(byDay.get(OCT(27))!.map((p) => [p.start, p.end]), [[at(27, 22), at(28, 0)]]);
  assert.deepEqual(byDay.get(OCT(28))!.map((p) => [p.activityId, p.start, p.end, p.live]), [['a', at(28, 0), at(28, 2), false], ['b', at(28, 9), at(28, 10), true]]);
  // With the reset at 04:00 the same session is all on the 27th: changing the reset hour recomputes the days.
  const later = splitDays([seg('a', at(27, 22), at(28, 2))], 4, at(28, 10));
  assert.deepEqual([...later.keys()], [OCT(27)]);
});

test('weeks start on the configured day; system asks the locale', () => {
  assert.equal(weekday(OCT(28)), 3); // Wednesday
  assert.deepEqual(periodOf('week', OCT(28), 1), { kind: 'week', from: OCT(26), to: dayNum(2026, 10, 1) });
  assert.deepEqual(periodOf('week', OCT(28), 0), { kind: 'week', from: OCT(25), to: OCT(31) });
  assert.deepEqual(periodOf('week', OCT(28), 6), { kind: 'week', from: OCT(24), to: OCT(30) });
  assert.equal(resolveWeekStart(0), 0);
  assert.equal(resolveWeekStart('system', 'en-US'), 0);
  assert.equal(resolveWeekStart('system', 'de-DE'), 1);
});

test('periods step by a day, a week, a month, or a custom range by its own length', () => {
  assert.deepEqual(stepPeriod(periodOf('day', OCT(28), 1), -1), { kind: 'day', from: OCT(27), to: OCT(27) });
  assert.deepEqual(stepPeriod(periodOf('month', OCT(28), 1), -1), { kind: 'month', from: dayNum(2026, 8, 1), to: dayNum(2026, 8, 30) });
  assert.deepEqual(stepPeriod({ kind: 'custom', from: OCT(1), to: OCT(10) }, 1), { kind: 'custom', from: OCT(11), to: OCT(20) });
  assert.deepEqual(quickRange('Last 7 days', OCT(28), 1), { kind: 'custom', from: OCT(22), to: OCT(28) });
  assert.deepEqual(quickRange('Last month', OCT(28), 1).from, dayNum(2026, 8, 1));
  // A picked range becomes the period it is: one day, a calendar week or month, else custom (both ends included).
  assert.equal(rangePeriod(OCT(5), OCT(5), 1).kind, 'day');
  assert.equal(rangePeriod(OCT(26), dayNum(2026, 10, 1), 1).kind, 'week');
  assert.equal(rangePeriod(OCT(1), OCT(31), 1).kind, 'month');
  assert.deepEqual(rangePeriod(OCT(12), OCT(3), 1), { kind: 'custom', from: OCT(3), to: OCT(12) });
});

test('totals, averages over tracked days, average start/end and the comparison with the previous period', () => {
  const segs = [
    seg('a', at(22, 9), at(22, 12)), seg('b', at(22, 13), at(22, 14)), // 4h, idle 1h
    seg('a', at(24, 11), at(24, 13)), // 2h
    seg('a', at(15, 9), at(15, 10)), // previous week: 1h
  ];
  const byDay = splitDays(segs, 0, at(29, 0));
  const week = { kind: 'custom' as const, from: OCT(22), to: OCT(28) };
  const st = periodStats(week, byDay, 0);
  assert.equal(st.total, 6 * H);
  assert.equal(st.tracked, 2);
  assert.equal(st.total / st.tracked, 3 * H);
  assert.equal(st.byActivity.get('a'), 5 * H);
  assert.equal(st.days[0].idle, H);
  assert.equal(st.avgStart, 10 * H); // (09:00 + 11:00) / 2
  assert.equal(st.avgEnd, 13.5 * H); // (14:00 + 13:00) / 2
  assert.equal(periodStats(stepPeriod(week, -1), byDay, 0).total, H);
  assert.equal(targetMetDays(st.days, 'a', 2.5 * H), 1);
});

test('two or more empty days collapse into one gap row; a single empty day stays a row', () => {
  const byDay = splitDays([seg('a', at(22, 9), at(22, 10)), seg('a', at(24, 9), at(24, 10)), seg('a', at(28, 9), at(28, 10))], 0, at(29, 0));
  const rows = dayRows(periodStats({ kind: 'custom', from: OCT(22), to: OCT(28) }, byDay, 0).days);
  assert.deepEqual(rows.map((r) => (r.kind === 'gap' ? `gap ${r.to - r.from + 1}` : r.stats.total ? 'day' : 'empty')), ['day', 'empty', 'day', 'gap 3', 'day']);
});

test('long ranges group into week rows clipped to the period', () => {
  const byDay = splitDays([seg('a', at(1, 9), at(1, 10)), seg('a', at(6, 9), at(6, 11))], 0, at(29, 0));
  const rows = weekRows(periodStats({ kind: 'custom', from: OCT(1), to: OCT(12) }, byDay, 0).days, 1);
  assert.deepEqual(rows.map((r) => [r.from, r.to, r.total]), [[OCT(1), OCT(4), H], [OCT(5), OCT(11), 2 * H], [OCT(12), OCT(12), 0]]);
});

test('Not set collects activities without an option, so a dimension adds up to the total', () => {
  const by = new Map([['a', 3 * H], ['b', 2 * H], ['c', H]]);
  const pick: Record<string, string> = { a: 'pro', c: 'pro' };
  const groups = totalsBy(by, (id) => pick[id] ?? NOT_SET);
  assert.deepEqual(groups.map(([k, v]) => [k, v.total, v.activities]), [['pro', 4 * H, ['a', 'c']], [NOT_SET, 2 * H, ['b']]]);
  assert.equal(groups.reduce((s, [, v]) => s + v.total, 0), 6 * H);
});

test('the per-day axis is 08:00–20:00, widened to full hours; heat is relative to max(longest, 8h)', () => {
  const st = periodStats({ kind: 'custom', from: OCT(22), to: OCT(23) }, splitDays([seg('a', at(22, 7, 30), at(22, 21, 10))], 0, at(29, 0)), 0);
  assert.deepEqual(axisRange(st.days, 0), [7 * H, 22 * H]);
  assert.deepEqual(axisRange([], 0), [8 * H, 20 * H]);
  assert.equal(heat(0, 10 * H), 0);
  assert.equal(heat(4 * H, 2 * H), 0.18 + 0.82 * 0.5);
  assert.equal(heat(10 * H, 10 * H), 1);
  assert.ok(Math.abs(heat(30 * M, 0) - (0.18 + 0.82 / 16)) < 1e-9);
});
