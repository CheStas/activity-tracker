// Records from config/seed.json: first-run data and default settings, plus upgrading records stored by older
// versions. Pure: no DOM, no storage.
import config from '../config/seed.json';
import { nearestSlot, SLOT_COUNT, DEFAULT_LIGHT, DEFAULT_DARK } from './theme.ts';
import type { Activity, Group, Profile, Settings } from './types.ts';

/** `slot` is 1–16; `color` (hex, from before slots) maps to the nearest Paper slot. */
export type SeedActivity = string | { name: string; slot?: number; color?: string; targetMin?: number | null };
/** Settings in the seed file: all but introDismissed, which only the first-run profile has off. */
export type SeedSettings = Omit<Settings, 'introDismissed'>;
export interface Seed {
  /** The order new activities get color slots in: slot numbers 1–16, or hex colors (nearest Paper slot). */
  palette: (number | string)[];
  settings: SeedSettings;
  profiles: {
    name: string;
    settings?: Partial<Settings>;
    groups?: { name: string; on?: boolean; activities?: SeedActivity[] }[];
    activities?: SeedActivity[];
  }[];
}

export const seed = config as Seed;
export const DEFAULT_SETTINGS: Settings = { ...seed.settings, introDismissed: true };

/** A palette entry as a 0-based slot. */
const toSlot = (p: number | string) => (typeof p === 'number' ? (Math.round(p) - 1 + SLOT_COUNT) % SLOT_COUNT : nearestSlot(p));
export const paletteSlots = (palette = seed.palette) => (palette.length ? palette.map(toSlot) : [0]);

export function newActivity(name: string, order: number, profileId: string, id: string, slots = paletteSlots()): Activity {
  return {
    id, profileId, groupId: null, name, colorSlot: slots[order % slots.length], order,
    archived: false, hiddenForDayId: null, targetMin: null,
  };
}

/** Activities stored with a hex `color` (before slots) get the nearest Paper slot. */
export function normalizeActivity(a: Activity): Activity {
  if (typeof a.colorSlot === 'number') return a;
  const { color, ...rest } = a as Activity & { color?: string };
  return { ...rest, colorSlot: nearestSlot(color ?? '') };
}

/** Activity names are unique per profile, compared trimmed and case-insensitive (buttons show them capitalized). */
export const nameKey = (name: string) => name.trim().toLowerCase();

/**
 * Settings from before themes had `theme`: System -> Follow system with Paper + Graphite, Light -> Fixed Paper,
 * Dark -> Fixed Graphite. `unusedStrip` used to be part of `popularity`, so settings saved before it existed keep the
 * strip exactly when popularity sizing was on. Returns only what was stored (and its mapping).
 */
export function migrateSettings(stored: Partial<Settings> & { theme?: string }): Partial<Settings> {
  const { theme, ...rest } = stored;
  const out: Partial<Settings> = { ...rest };
  if (theme !== undefined && out.themeMode === undefined) {
    if (theme === 'light' || theme === 'dark') Object.assign(out, { themeMode: 'fixed', themeId: theme === 'dark' ? DEFAULT_DARK : DEFAULT_LIGHT });
    else Object.assign(out, { themeMode: 'system', lightThemeId: DEFAULT_LIGHT, darkThemeId: DEFAULT_DARK });
  }
  if (out.unusedStrip === undefined && out.popularity !== undefined) out.unusedStrip = out.popularity;
  return out;
}

/** Stored or imported settings, upgraded and completed with the defaults. */
export function withDefaults(stored: Partial<Settings> = {}, defaults = DEFAULT_SETTINGS): Settings {
  return { ...defaults, ...migrateSettings(stored) };
}

/** Profiles, groups and activities to store on first run; activity order follows the file (groups first). */
export function seedRecords({ profiles, palette, settings }: Seed, uid: () => string) {
  const out = { profiles: [] as Profile[], groups: [] as Group[], activities: [] as Activity[] };
  const slots = paletteSlots(palette);
  profiles.forEach((p, i) => {
    // Only the profile opened on first run shows the welcome strip.
    const profile: Profile = { id: uid(), name: p.name, order: i, settings: { ...settings, introDismissed: i !== 0, ...p.settings } };
    out.profiles.push(profile);
    let order = 0;
    const add = (list: SeedActivity[] = [], groupId: string | null) => {
      for (const item of list) {
        const { name, slot, color, targetMin = null } = typeof item === 'string' ? { name: item } : item;
        const a = newActivity(name, order++, profile.id, uid(), slots);
        const colorSlot = slot !== undefined ? toSlot(slot) : color !== undefined ? nearestSlot(color) : a.colorSlot;
        out.activities.push({ ...a, groupId, targetMin, colorSlot });
      }
    };
    (p.groups ?? []).forEach((g, j) => {
      const group: Group = { id: uid(), profileId: profile.id, name: g.name, order: j, on: g.on ?? true };
      out.groups.push(group);
      add(g.activities, group.id);
    });
    add(p.activities, null);
  });
  return out;
}
