// Stored records (IndexedDB) and settings. Timestamps are epoch milliseconds.

/** A run of one activity; end === null means open (active). */
export interface Segment {
  id: string;
  dayId: string | null;
  activityId: string;
  start: number;
  end: number | null;
}

export interface Activity {
  id: string;
  profileId: string;
  groupId: string | null;
  name: string;
  /** Theme color slot 0–7 (the theme gives the color). */
  colorSlot: number;
  order: number;
  archived: boolean;
  /** Removed for good from Settings (implies archived); the record stays so history can still name it. */
  deleted?: boolean;
  hiddenForDayId: string | null;
  targetMin: number | null;
}

/**
 * Name, color slot and target copied into a closed day so later edits do not change history. Days closed before
 * slots existed have a hex `color` instead, kept as it is.
 */
export type ActivitySnapshot = Pick<Activity, 'name' | 'targetMin'> & { colorSlot?: number; color?: string };

/** A soft filter inside a profile: activities of a group that is off are not on the main screen. */
export interface Group {
  id: string;
  profileId: string;
  name: string;
  order: number;
  on: boolean;
}

/** A separate tracker: activities, groups and days carry its id. */
export interface Profile {
  id: string;
  name: string;
  order: number;
  settings: Settings;
}

export interface Day {
  id: string;
  profileId: string;
  startedAt: number;
  endedAt: number | null;
  snapshot: { activities: Record<string, ActivitySnapshot>; total: number } | null;
}

/** Fixed: one theme (themeId). System: lightThemeId / darkThemeId by prefers-color-scheme. */
export type ThemeMode = 'fixed' | 'system';
export type Layout = 'rows' | 'tiles' | 'circles';

/** Settings of one profile. */
export interface Settings {
  startFullscreen: boolean;
  keepAwake: boolean;
  themeMode: ThemeMode;
  themeId: string;
  lightThemeId: string;
  darkThemeId: string;
  layout: Layout;
  resetHour: number;
  popularity: boolean;
  unusedStrip: boolean;
  showTimeline: boolean;
  showGroups: boolean;
  showFooter: boolean;
  /** The welcome strip was dismissed (false only for the profile opened on first run). */
  introDismissed: boolean;
  autoExport: boolean;
  minSwitchSec: number;
}
