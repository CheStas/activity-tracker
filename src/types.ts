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
  name: string;
  color: string;
  order: number;
  archived: boolean;
  hiddenForDayId: string | null;
  targetMin: number | null;
}

/** Name, color and target copied into a closed day so later edits do not change history. */
export type ActivitySnapshot = Pick<Activity, 'name' | 'color' | 'targetMin'>;

export interface Day {
  id: string;
  startedAt: number;
  endedAt: number | null;
  snapshot: { activities: Record<string, ActivitySnapshot>; total: number } | null;
}

export type Theme = 'system' | 'dark' | 'light';
export type Layout = 'rows' | 'tiles' | 'circles';

export interface Settings {
  resetHour: number;
  popularity: boolean;
  autoExport: boolean;
  startFullscreen: boolean;
  keepAwake: boolean;
  minSwitchSec: number;
  theme: Theme;
  layout: Layout;
}
