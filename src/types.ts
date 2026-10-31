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
  /** Theme color slot 0–15 (the theme gives the color). */
  colorSlot: number;
  order: number;
  archived: boolean;
  /** Removed for good from Settings (implies archived); the record stays so history can still name it. */
  deleted?: boolean;
  hiddenForDayId: string | null;
  targetMin: number | null;
  /** The option picked per dimension (dimension id -> option id); a missing key is "Not set". */
  categories?: Record<string, string>;
}

/**
 * Name and target copied into a closed day so later renames do not change history. Older days also stored a color
 * slot or a hex `color`; colors now always follow the activity's current slot.
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

/** One option of a dimension, with its own color slot (0–15). */
export interface CategoryOption {
  id: string;
  name: string;
  colorSlot: number;
  order: number;
}

/**
 * A dimension of categories (Focus, Company, Billing): one way to split time in the Summary. Each activity has at most
 * one of its options; the rest is "Not set", so a dimension always adds up to 100%.
 */
export interface Dimension {
  id: string;
  profileId: string;
  name: string;
  order: number;
  options: CategoryOption[];
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
export type PeriodKind = 'day' | 'week' | 'month' | 'custom';
/** "system" (from the locale) or a weekday, 0 = Sunday. */
export type WeekStart = 'system' | number;

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
  weekStart: WeekStart;
  /** Summary "Group by": "activity" or a dimension id (back to activity when that dimension is deleted). */
  summaryGroupBy: string;
  /** Summary session log grouped by the Group by dimension. */
  summaryGroupLog: boolean;
  /** The Summary period used last. */
  summaryPeriod: PeriodKind;
}
