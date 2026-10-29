// Per-profile backup file: building an export and reading one back. Pure: no DOM, no storage.
import type { Activity, Day, Group, Profile, Segment, Settings } from './types.ts';
import { migrateSettings, normalizeActivity } from './seed.ts';
import { completeTheme, type Theme } from './theme.ts';

export const APP = 'activity-tracker';
const VERSION = 3;

export interface ProfileData {
  groups: Group[];
  activities: Activity[];
  days: Day[];
  segments: Segment[];
}

/** `themes`: the imported (not built-in) themes the profile's settings use, so the file imports cleanly elsewhere. */
export type ProfileExport = {
  app: string; kind: 'profile'; version: number; exportedAt: number; profile: Pick<Profile, 'name' | 'settings'>; themes?: Theme[];
} & ProfileData;

export const profileExport = (profile: Profile, data: ProfileData, themes: Theme[] = [], now = Date.now()): ProfileExport => {
  const { themeId, lightThemeId, darkThemeId } = profile.settings;
  const used = themes.filter((t) => !t.builtin && [themeId, lightThemeId, darkThemeId].includes(t.id));
  return {
    app: APP, kind: 'profile', version: VERSION, exportedAt: now, profile: { name: profile.name, settings: profile.settings },
    ...(used.length ? { themes: used } : {}), ...data,
  };
};

/** What an import file may hold: a profile export, or a whole-app export from before profiles (v1). */
interface ImportFile extends Partial<ProfileData> {
  app?: string;
  kind?: string;
  profile?: { settings?: Partial<Settings> };
  settings?: { key: string; value: unknown }[]; // v1
  themes?: Theme[];
}

/**
 * Turn an import file into records of `profileId`. Every id is renewed (references follow), so the file can go into
 * any profile without clashing with records of another one. Settings are only those the file has.
 */
export function readImport(raw: unknown, profileId: string, uid: () => string): ProfileData & { settings: Partial<Settings>; themes: Theme[] } {
  const file = raw as ImportFile | null;
  if (file?.app !== APP) throw new Error('Not an activity-tracker export');
  const ids = new Map<string, string>();
  const id = (old: string) => ids.get(old) ?? ids.set(old, uid()).get(old)!;
  const groupIds = new Set((file.groups ?? []).map((g) => g.id));
  // Older files: `theme` and `popularity` are mapped like stored settings; activity colors become slots.
  const settings = migrateSettings((file.kind === 'profile' ? file.profile?.settings : Object.fromEntries((file.settings ?? []).map((s) => [s.key, s.value]))) ?? {});
  // Embedded themes keep their ids (the settings refer to them); a broken one is completed like an import.
  const themes = (file.themes ?? []).filter((t) => t?.id).map((t) => ({ ...completeTheme(t.name, t.colors ?? {}, t.slots ?? [], t.kind), id: t.id }));

  return {
    settings,
    themes,
    groups: (file.groups ?? []).map((g) => ({ ...normalizeGroup(g), id: id(g.id), profileId })),
    activities: (file.activities ?? []).map((a) => ({
      ...normalizeActivity(a), id: id(a.id), profileId,
      groupId: a.groupId && groupIds.has(a.groupId) ? id(a.groupId) : null,
      hiddenForDayId: a.hiddenForDayId ? id(a.hiddenForDayId) : null,
    })),
    days: (file.days ?? []).map((d) => ({
      ...d, id: id(d.id), profileId,
      snapshot: d.snapshot && { ...d.snapshot, activities: Object.fromEntries(Object.entries(d.snapshot.activities).map(([k, v]) => [id(k), v])) },
    })),
    segments: (file.segments ?? []).map((s) => ({ ...s, id: id(s.id), dayId: s.dayId && id(s.dayId), activityId: id(s.activityId) })),
  };
}

/** Groups stored before `on` existed had `defaultOn` (and a per-day toggle, now dropped). */
export function normalizeGroup(g: Group): Group {
  const { defaultOn, toggledForDayId: _, ...rest } = g as Group & { defaultOn?: boolean; toggledForDayId?: unknown };
  return { ...rest, on: g.on ?? defaultOn ?? true };
}
