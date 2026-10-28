import { test } from 'vitest';
import assert from 'node:assert/strict';
import { assign, totals, dayTotal, gaps, sessionsFor, closeAt, switchTo } from '../src/timeline.ts';
import type { Segment } from '../src/types.ts';

const T = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h * 60 + m) * 60_000;
};
const MIN = 60_000;
let n = 0;
const opts = { dayId: 'd1', genId: () => `id${++n}` };
const tap = (segs: Segment[], act: string, at: string) => assign(segs, act, T(at), null, opts);
const view = (segs: Segment[]) => segs.map((s) => [s.activityId, s.start / MIN, s.end === null ? null : s.end / MIN]);

test('spec example: backdate A2 since 14:30 trims A1', () => {
  let s = tap([], 'A1', '14:10');
  s = tap(s, 'A2', '14:30'); // done at 14:53
  const t = totals(s, T('14:53'));
  assert.equal(t.get('A1'), 20 * MIN);
  assert.equal(t.get('A2'), 23 * MIN);
  assert.equal(s.filter((x) => x.end === null).length, 1);
});

test('tap switches, stop-all closes the open segment', () => {
  let s = tap([], 'A', '09:00');
  s = tap(s, 'B', '09:30');
  s = assign(s, null, T('10:00'), null, opts);
  assert.deepEqual(view(s), [['A', 540, 570], ['B', 570, 600]]);
  assert.equal(dayTotal(s, T('11:00')), 60 * MIN);
});

test('backdate across several segments drops the covered ones', () => {
  let s = tap([], 'A', '09:00');
  s = tap(s, 'B', '09:10');
  s = tap(s, 'C', '09:20');
  s = tap(s, 'D', '09:30');
  s = tap(s, 'E', '09:05');
  assert.deepEqual(view(s), [['A', 540, 545], ['E', 545, null]]);
});

test('backdate covering everything leaves only the new segment', () => {
  let s = tap([], 'A', '09:00');
  s = tap(s, 'B', '09:10');
  s = tap(s, 'C', '08:00');
  assert.deepEqual(view(s), [['C', 480, null]]);
});

test('closed range in the middle of a segment splits it', () => {
  let s = tap([], 'A', '09:00');
  s = assign(s, 'B', T('09:20'), T('09:40'), opts);
  assert.deepEqual(view(s), [['A', 540, 560], ['B', 560, 580], ['A', 580, null]]);
  assert.equal(new Set(s.map((x) => x.id)).size, 3);
});

test('closed range in the middle of a closed segment splits it', () => {
  let s = assign([], 'A', T('09:00'), T('10:00'), opts);
  s = assign(s, null, T('09:20'), T('09:40'), opts);
  assert.deepEqual(view(s), [['A', 540, 560], ['A', 580, 600]]);
  assert.deepEqual(gaps(s, T('11:00')), [{ start: T('09:20'), end: T('09:40') }]);
});

test('backdating the same activity merges into one session', () => {
  let s = tap([], 'A', '09:00');
  s = tap(s, 'B', '09:30');
  s = tap(s, 'A', '09:30'); // "A is actually still running"
  assert.deepEqual(view(s), [['A', 540, null]]);
  assert.equal(sessionsFor(s, 'A').length, 1);
});

test('stop all since earlier time drops later segments', () => {
  let s = tap([], 'A', '09:00');
  s = tap(s, 'B', '09:30');
  s = closeAt(s, T('09:15'), opts);
  assert.deepEqual(view(s), [['A', 540, 555]]);
});

test('empty or inverted range is a no-op', () => {
  const s = tap([], 'A', '09:00');
  assert.deepEqual(view(assign(s, 'B', T('10:00'), T('10:00'), opts)), view(s));
  assert.deepEqual(view(assign(s, 'B', T('10:00'), T('09:00'), opts)), view(s));
});

test('input is not mutated', () => {
  const s = tap([], 'A', '09:00');
  const copy = structuredClone(s);
  tap(s, 'B', '09:10');
  assert.deepEqual(s, copy);
});

const SEC = 1000;
const sw = (segs: Segment[], act: string | null, at: string, extraSec = 0) => switchTo(segs, act, T(at) + extraSec * SEC, MIN, opts);

test('short switch goes to the next activity', () => {
  let s = sw([], 'A', '09:00');
  s = sw(s, 'B', '10:00');
  s = sw(s, 'C', '10:00', 20);
  assert.deepEqual(view(s), [['A', 540, 600], ['C', 600, null]]);
});

test('short switch back to the previous activity leaves one session', () => {
  let s = sw([], 'A', '09:00');
  s = sw(s, 'B', '10:00');
  s = sw(s, 'A', '10:00', 20);
  assert.deepEqual(view(s), [['A', 540, null]]);
});

test('short run then stop all goes to the touching previous activity', () => {
  let s = sw([], 'A', '09:00');
  s = sw(s, 'B', '10:00');
  s = sw(s, null, '10:00', 30);
  assert.deepEqual(s.map((x) => [x.activityId, x.start, x.end]), [['A', T('09:00'), T('10:00') + 30 * SEC]]);
});

test('start and stop within the threshold leaves nothing', () => {
  let s = sw([], 'A', '09:00');
  s = sw(s, null, '09:00', 30);
  assert.deepEqual(view(s), []);
});

test('short idle gap goes to the next activity', () => {
  let s = sw([], 'A', '09:00');
  s = sw(s, null, '10:00');
  s = sw(s, 'B', '10:00', 40);
  assert.deepEqual(view(s), [['A', 540, 600], ['B', 600, null]]);
});

test('runs at or above the threshold are kept', () => {
  let s = sw([], 'A', '09:00');
  s = sw(s, 'B', '10:00');
  s = sw(s, 'C', '10:01');
  s = sw(s, null, '10:05');
  s = sw(s, 'D', '10:06');
  assert.deepEqual(view(s), [['A', 540, 600], ['B', 600, 601], ['C', 601, 605], ['D', 606, null]]);
});

test('minMs 0 disables merging', () => {
  let s = switchTo([], 'A', T('09:00'), 0, opts);
  s = switchTo(s, 'B', T('09:00') + 5 * SEC, 0, opts);
  assert.equal(s.length, 2);
});
