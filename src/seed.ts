// Records from config/seed.json: first-run data and default settings. Pure: no DOM, no storage.
import config from '../config/seed.json';
import type { Activity, Group, Profile, Settings } from './types.ts';

export type SeedActivity = string | { name: string; color?: string; targetMin?: number | null };
export interface Seed {
  palette: string[];
  settings: Settings;
  profiles: {
    name: string;
    settings?: Partial<Settings>;
    groups?: { name: string; on?: boolean; activities?: SeedActivity[] }[];
    activities?: SeedActivity[];
  }[];
}

export const seed = config as Seed;

export function newActivity(name: string, order: number, profileId: string, id: string, palette = seed.palette): Activity {
  return {
    id, profileId, groupId: null, name, color: palette[order % palette.length], order,
    archived: false, hiddenForDayId: null, targetMin: null,
  };
}

/** Profiles, groups and activities to store on first run; activity order follows the file (groups first). */
export function seedRecords({ profiles, palette, settings }: Seed, uid: () => string) {
  const out = { profiles: [] as Profile[], groups: [] as Group[], activities: [] as Activity[] };
  profiles.forEach((p, i) => {
    const profile: Profile = { id: uid(), name: p.name, order: i, settings: { ...settings, ...p.settings } };
    out.profiles.push(profile);
    let order = 0;
    const add = (list: SeedActivity[] = [], groupId: string | null) => {
      for (const item of list) {
        const { name, color, targetMin = null } = typeof item === 'string' ? { name: item } : item;
        const a = newActivity(name, order++, profile.id, uid(), palette);
        out.activities.push({ ...a, groupId, targetMin, color: color ?? a.color });
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
