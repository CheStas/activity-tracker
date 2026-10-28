// Per-profile backup file: building an export and reading one back. Pure: no DOM, no storage.
import type { Activity, Day, Group, Profile, Segment, Settings } from './types.ts';

export const APP = 'activity-tracker';
const VERSION = 2;

export interface ProfileData {
  groups: Group[];
  activities: Activity[];
  days: Day[];
  segments: Segment[];
}

export type ProfileExport = { app: string; kind: 'profile'; version: number; exportedAt: number; profile: Pick<Profile, 'name' | 'settings'> } & ProfileData;

export const profileExport = (profile: Profile, data: ProfileData, now = Date.now()): ProfileExport => ({
  app: APP, kind: 'profile', version: VERSION, exportedAt: now, profile: { name: profile.name, settings: profile.settings }, ...data,
});

/** What an import file may hold: a profile export, or a whole-app export from before profiles (v1). */
interface ImportFile extends Partial<ProfileData> {
  app?: string;
  kind?: string;
  profile?: { settings?: Partial<Settings> };
  settings?: { key: string; value: unknown }[]; // v1
}

/**
 * Turn an import file into records of `profileId`. Every id is renewed (references follow), so the file can go into
 * any profile without clashing with records of another one. Settings are only those the file has.
 */
export function readImport(raw: unknown, profileId: string, uid: () => string): ProfileData & { settings: Partial<Settings> } {
  const file = raw as ImportFile | null;
  if (file?.app !== APP) throw new Error('Not an activity-tracker export');
  const ids = new Map<string, string>();
  const id = (old: string) => ids.get(old) ?? ids.set(old, uid()).get(old)!;
  const groupIds = new Set((file.groups ?? []).map((g) => g.id));
  const settings = (file.kind === 'profile' ? file.profile?.settings : Object.fromEntries((file.settings ?? []).map((s) => [s.key, s.value]))) ?? {};

  return {
    settings,
    groups: (file.groups ?? []).map((g) => ({ ...normalizeGroup(g), id: id(g.id), profileId })),
    activities: (file.activities ?? []).map((a) => ({
      ...a, id: id(a.id), profileId,
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
