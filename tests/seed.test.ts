import { test } from 'vitest';
import assert from 'node:assert/strict';
import { seed, seedRecords, nameKey, withDefaults, normalizeActivity, paletteSlots, DEFAULT_SETTINGS, type Seed } from '../src/seed.ts';
import { nearestSlot } from '../src/theme.ts';
import type { Activity, Settings } from '../src/types.ts';

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
    palette: [3, '#17804F'],
    settings: { ...seed.settings, resetHour: 4 },
    profiles: [
      {
        name: 'Work', settings: { themeId: 'nord' },
        groups: [{ name: 'Dev', activities: ['code', { name: 'review', color: '#c03636', targetMin: 30 }, { name: 'docs', slot: 8 }] }], activities: ['break'],
      },
      { name: 'Home', groups: [{ name: 'Chores', on: false }] },
    ],
  };
  const r = seedRecords(s, ids());
  assert.deepEqual(
    r.profiles.map((p) => [p.name, p.order, p.settings.resetHour, p.settings.themeId, p.settings.introDismissed]),
    [['Work', 0, 4, 'nord', false], ['Home', 1, 4, s.settings.themeId, true]], // only the first-run profile is new
  );
  assert.notEqual(r.profiles[1].settings, s.settings); // a copy per profile
  assert.deepEqual(r.groups.map((g) => [g.name, g.profileId, g.on]), [['Dev', r.profiles[0].id, true], ['Chores', r.profiles[1].id, false]]);
  const dev = r.groups[0].id;
  assert.deepEqual(
    r.activities.map((a) => [a.name, a.groupId, a.order, a.colorSlot, a.targetMin]),
    // palette 3 -> slot index 2, '#17804F' -> Paper green (1); explicit color and slot win
    [['code', dev, 0, 2, null], ['review', dev, 1, 4, 30], ['docs', dev, 2, 7, null], ['break', null, 3, 1, null]],
  );
});

test('activity names compare trimmed and case-insensitive', () => {
  assert.equal(nameKey('  PR Review '), nameKey('pr review'));
  assert.notEqual(nameKey('pr review'), nameKey('pr-review'));
});

test('withDefaults fills missing settings; unusedStrip follows popularity in settings saved before it existed', () => {
  const defaults = { ...DEFAULT_SETTINGS, unusedStrip: false };
  assert.deepEqual(withDefaults({}, defaults), defaults);
  assert.equal(withDefaults({ popularity: true }, defaults).unusedStrip, true);
  assert.equal(withDefaults({ popularity: true, unusedStrip: false }, defaults).unusedStrip, false);
  assert.equal(withDefaults({}, defaults).introDismissed, true); // upgrades never show the welcome strip
});

test('the old theme setting maps to the new theme mode', () => {
  const old = (theme: string) => withDefaults({ theme } as Partial<Settings>);
  const pick = (s: Settings) => [s.themeMode, s.themeId, s.lightThemeId, s.darkThemeId];
  assert.deepEqual(pick(old('system')), ['system', DEFAULT_SETTINGS.themeId, 'paper', 'graphite']);
  assert.deepEqual(pick(old('light')).slice(0, 2), ['fixed', 'paper']);
  assert.deepEqual(pick(old('dark')).slice(0, 2), ['fixed', 'graphite']);
  assert.ok(!('theme' in old('dark')));
  // A stored new-style mode wins over a leftover old key.
  assert.equal(withDefaults({ theme: 'dark', themeMode: 'system' } as Partial<Settings>).themeMode, 'system');
});

test('activity colors from before slots map to the nearest Paper slot', () => {
  const old = (color: string) => normalizeActivity({ id: 'a', color } as unknown as Activity).colorSlot;
  // The old seed palette: blue, orange, green, purple, red, cyan, yellow, light green, pink, lavender. Plain RGB
  // distance sends the bright cyan to blue and the yellow to orange (Paper's cyan and yellow are much darker).
  assert.deepEqual(
    ['#4f8cff', '#f2994a', '#27ae60', '#bb6bd9', '#eb5757', '#2d9cdb', '#f2c94c', '#6fcf97', '#ff7eb6', '#9b8cff'].map(old),
    [0, 2, 1, 3, 4, 0, 2, 5, 3, 3],
  );
  assert.equal(old('#C03636'), 4); // exact match
  assert.equal(nearestSlot('#808080', ['#7F7F7F', '#818181']), 0); // a tie goes to the lower slot
  assert.equal(normalizeActivity({ id: 'a', colorSlot: 6 } as Activity).colorSlot, 6); // already a slot: unchanged
});

test('palette entries become 0-based slots', () => {
  assert.deepEqual(paletteSlots([1, 8, 16, 17, '#8A47C4']), [0, 7, 15, 0, 3]);
  assert.deepEqual(paletteSlots(seed.palette), Array.from({ length: 16 }, (_, i) => i));
});
