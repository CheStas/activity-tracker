import { test } from 'vitest';
import assert from 'node:assert/strict';
import { seed, seedRecords, type Seed } from '../src/seed.ts';

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

test('config/seed.json has a palette, defaults and at least one profile', () => {
  assert.ok(seed.palette.length > 0);
  assert.equal(typeof seed.settings.keepAwake, 'boolean');
  assert.equal(typeof seed.settings.minSwitchSec, 'number');
  assert.ok(seed.profiles.length > 0);
  const { activities } = seedRecords(seed, ids());
  assert.ok(activities.length > 0);
});

test('seedRecords builds profiles, groups and ordered activities', () => {
  const s: Seed = {
    palette: ['#111', '#222'],
    settings: { ...seed.settings, resetHour: 4 },
    profiles: [
      { name: 'Work', settings: { theme: 'dark' }, groups: [{ name: 'Dev', activities: ['code', { name: 'review', color: '#abc', targetMin: 30 }] }], activities: ['break'] },
      { name: 'Home', groups: [{ name: 'Chores', on: false }] },
    ],
  };
  const r = seedRecords(s, ids());
  assert.deepEqual(
    r.profiles.map((p) => [p.name, p.order, p.settings.resetHour, p.settings.theme]),
    [['Work', 0, 4, 'dark'], ['Home', 1, 4, s.settings.theme]],
  );
  assert.notEqual(r.profiles[1].settings, s.settings); // a copy per profile
  assert.deepEqual(r.groups.map((g) => [g.name, g.profileId, g.on]), [['Dev', r.profiles[0].id, true], ['Chores', r.profiles[1].id, false]]);
  const dev = r.groups[0].id;
  assert.deepEqual(
    r.activities.map((a) => [a.name, a.groupId, a.order, a.color, a.targetMin]),
    [['code', dev, 0, '#111', null], ['review', dev, 1, '#abc', 30], ['break', null, 2, '#111', null]],
  );
});
