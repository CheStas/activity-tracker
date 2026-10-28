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
  color: string;
  order: number;
  archived: boolean;
  hiddenForDayId: string | null;
  targetMin: number | null;
}

/** Name, color and target copied into a closed day so later edits do not change history. */
export type ActivitySnapshot = Pick<Activity, 'name' | 'color' | 'targetMin'>;

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

export type Theme = 'system' | 'dark' | 'light';
export type Layout = 'rows' | 'tiles' | 'circles';

/** Settings of one profile. */
export interface Settings {
  startFullscreen: boolean;
  keepAwake: boolean;
  theme: Theme;
  layout: Layout;
  resetHour: number;
  popularity: boolean;
  autoExport: boolean;
  minSwitchSec: number;
}
