import { test } from 'vitest';
import assert from 'node:assert/strict';
import { profileExport, readImport, normalizeGroup } from '../src/backup.ts';
import { seed } from '../src/seed.ts';
import type { Activity, Group, Profile } from '../src/types.ts';

const ids = () => {
  let n = 0;
  return () => `new${++n}`;
};

const profile: Profile = { id: 'pA', name: 'Work', order: 0, settings: { ...seed.settings, theme: 'dark' } };
const group: Group = { id: 'g1', profileId: 'pA', name: 'Dev', order: 0, on: false };
const act = (id: string, groupId: string | null): Activity => ({
  id, profileId: 'pA', groupId, name: id, color: '#111', order: 0, archived: false, hiddenForDayId: 'd2', targetMin: null,
});
const data = {
  groups: [group],
  activities: [act('a1', 'g1'), act('a2', 'gone')],
  days: [
    { id: 'd1', profileId: 'pA', startedAt: 0, endedAt: 10, snapshot: { activities: { a1: { name: 'a1', color: '#111', targetMin: null } }, total: 10 } },
    { id: 'd2', profileId: 'pA', startedAt: 10, endedAt: null, snapshot: null },
  ],
  segments: [
    { id: 's1', dayId: 'd1', activityId: 'a1', start: 0, end: 10 },
    { id: 's2', dayId: 'd2', activityId: 'a2', start: 10, end: null },
  ],
};

test('a profile export round-trips into another profile with new ids and intact references', () => {
  const file = JSON.parse(JSON.stringify(profileExport(profile, data, 123)));
  assert.equal(file.kind, 'profile');
  assert.equal(file.profile.name, 'Work');
  const r = readImport(file, 'pB', ids());
  assert.equal(r.settings.theme, 'dark');
  const all = [...r.groups, ...r.activities, ...r.days, ...r.segments];
  assert.ok(all.every((x) => x.id.startsWith('new')));
  assert.ok([...r.groups, ...r.activities, ...r.days].every((x) => x.profileId === 'pB'));
  const [g] = r.groups;
  const [a1, a2] = r.activities;
  const [d1, d2] = r.days;
  assert.equal(a1.groupId, g.id);
  assert.equal(a2.groupId, null); // pointed at a group that is not in the file
  assert.equal(a1.hiddenForDayId, d2.id);
  assert.deepEqual(Object.keys(d1.snapshot!.activities), [a1.id]);
  assert.deepEqual(r.segments.map((s) => [s.dayId, s.activityId]), [[d1.id, a1.id], [d2.id, a2.id]]);
});

test('an export from before profiles (v1) imports with its settings', () => {
  const v1 = {
    app: 'activity-tracker', version: 1,
    activities: [{ ...act('a1', null), profileId: undefined, groupId: undefined }],
    days: [], segments: [], settings: [{ key: 'theme', value: 'light' }, { key: 'minSwitchSec', value: 30 }],
  };
  const r = readImport(v1, 'pB', ids());
  assert.deepEqual(r.settings, { theme: 'light', minSwitchSec: 30 });
  assert.deepEqual([r.activities[0].profileId, r.activities[0].groupId], ['pB', null]);
});

test('other files are rejected', () => {
  assert.throws(() => readImport({ app: 'something-else' }, 'pB', ids()), /Not an activity-tracker export/);
  assert.throws(() => readImport(null, 'pB', ids()));
});

test('groups stored with a default and a per-day toggle become a plain on flag', () => {
  const old = { id: 'g', profileId: 'p', name: 'X', order: 0, defaultOn: false, toggledForDayId: 'd1' } as unknown as Group;
  assert.deepEqual(normalizeGroup(old), { id: 'g', profileId: 'p', name: 'X', order: 0, on: false });
});
