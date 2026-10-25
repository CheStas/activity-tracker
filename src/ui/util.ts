// Small formatting and browser helpers shared by the views.

const pad = (n: number) => String(n).padStart(2, '0');

/** 3725000 -> "1:02:05", 125000 -> "2:05" */
export function fmtDur(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Coarse duration for summaries: "1h 05m", "12m". */
export function fmtHM(ms: number) {
  const m = Math.round(Math.max(0, ms) / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${m}m`;
}

export const fmtClock = (ts: number) => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** "09:00 – 09:30", or "09:00 – now" for an open segment. */
export const fmtRange = (start: number, end: number | null) => `${fmtClock(start)} – ${end === null ? 'now' : fmtClock(end)}`;

/** Minimum switch option label: 0 -> "Off", 30 -> "30 s", 120 -> "2 min". */
export const fmtSwitch = (s: number) => (s === 0 ? 'Off' : s < 60 ? `${s} s` : `${s / 60} min`);

/** "Thu, Oct 22" */
export const fmtDayShort = (ts: number) => new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export function download(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.download = filename;
  a.href = url;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const isoDay = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Target delta text for an activity: "12m left" / "5m over", or "" without a target. */
export function targetText(targetMin: number | null | undefined, totalMs: number) {
  if (!targetMin) return '';
  const diff = targetMin * 60000 - totalMs;
  return diff >= 0 ? `${fmtHM(diff)} left` : `${fmtHM(-diff)} over`;
}
