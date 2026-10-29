import { test } from 'vitest';
import assert from 'node:assert/strict';
import { profileExport, readImport, normalizeGroup } from '../src/backup.ts';
import { DEFAULT_SETTINGS } from '../src/seed.ts';
import { BUILTIN, PAPER, type Theme } from '../src/theme.ts';
import type { Activity, Group, Profile } from '../src/types.ts';

const ids = () => {
  let n = 0;
  return () => `new${++n}`;
};

const profile: Profile = { id: 'pA', name: 'Work', order: 0, settings: { ...DEFAULT_SETTINGS, themeMode: 'fixed', themeId: 'custom-1', showTimeline: false } };
const group: Group = { id: 'g1', profileId: 'pA', name: 'Dev', order: 0, on: false };
const act = (id: string, groupId: string | null): Activity => ({
  id, profileId: 'pA', groupId, name: id, colorSlot: 3, order: 0, archived: false, hiddenForDayId: 'd2', targetMin: null,
});
const data = {
  groups: [group],
  activities: [act('a1', 'g1'), act('a2', 'gone')],
  days: [
    { id: 'd1', profileId: 'pA', startedAt: 0, endedAt: 10, snapshot: { activities: { a1: { name: 'a1', color: '#111111', targetMin: null } }, total: 10 } },
    { id: 'd2', profileId: 'pA', startedAt: 10, endedAt: null, snapshot: null },
  ],
  segments: [
    { id: 's1', dayId: 'd1', activityId: 'a1', start: 0, end: 10 },
    { id: 's2', dayId: 'd2', activityId: 'a2', start: 10, end: null },
  ],
};

test('a profile export round-trips into another profile with new ids and intact references', () => {
  const custom: Theme = { ...PAPER, builtin: undefined, id: 'custom-1', name: 'Mine' };
  const other: Theme = { ...custom, id: 'custom-2' };
  const file = JSON.parse(JSON.stringify(profileExport(profile, data, [...BUILTIN, custom, other], 123)));
  assert.equal(file.kind, 'profile');
  assert.equal(file.profile.name, 'Work');
  assert.deepEqual(file.themes.map((t: Theme) => t.id), ['custom-1']); // only the imported theme the profile uses
  const r = readImport(file, 'pB', ids());
  assert.deepEqual([r.settings.themeMode, r.settings.themeId, r.settings.showTimeline], ['fixed', 'custom-1', false]);
  assert.deepEqual(r.themes.map((t) => [t.id, t.name, t.colors.bg]), [['custom-1', 'Mine', PAPER.colors.bg]]);
  assert.equal(r.activities[0].colorSlot, 3);
  assert.equal(r.days[0].snapshot!.activities[r.activities[0].id].color, '#111111'); // closed days keep their hex
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
    activities: [{ ...act('a1', null), colorSlot: undefined, color: '#eb5757', profileId: undefined, groupId: undefined }],
    days: [], segments: [], settings: [{ key: 'theme', value: 'light' }, { key: 'minSwitchSec', value: 30 }],
  };
  const r = readImport(v1, 'pB', ids());
  assert.deepEqual(r.settings, { themeMode: 'fixed', themeId: 'paper', minSwitchSec: 30 });
  assert.deepEqual([r.activities[0].profileId, r.activities[0].groupId], ['pB', null]);
  assert.equal(r.activities[0].colorSlot, 4); // old red -> Paper red slot
  assert.ok(!('color' in r.activities[0]));
});

test('other files are rejected', () => {
  assert.throws(() => readImport({ app: 'something-else' }, 'pB', ids()), /Not an activity-tracker export/);
  assert.throws(() => readImport(null, 'pB', ids()));
});

test('groups stored with a default and a per-day toggle become a plain on flag', () => {
  const old = { id: 'g', profileId: 'p', name: 'X', order: 0, defaultOn: false, toggledForDayId: 'd1' } as unknown as Group;
  assert.deepEqual(normalizeGroup(old), { id: 'g', profileId: 'p', name: 'X', order: 0, on: false });
});

test('files from before unusedStrip keep the strip exactly when popularity sizing was on', () => {
  const file = (settings: object) => ({ app: 'activity-tracker', kind: 'profile', profile: { settings } });
  assert.equal(readImport(file({ popularity: true }), 'pB', ids()).settings.unusedStrip, true);
  assert.equal(readImport(file({ popularity: false }), 'pB', ids()).settings.unusedStrip, false);
  assert.equal(readImport(file({ popularity: true, unusedStrip: false }), 'pB', ids()).settings.unusedStrip, false);
  assert.equal(readImport(file({}), 'pB', ids()).settings.unusedStrip, undefined);
});
