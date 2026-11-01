// Anonymous usage stats (Umami Cloud): page views and a few named events, never what you track (no activity, group,
// category or profile names, no times). The build turns it on with VITE_UMAMI_ID; it stays off in the demo, the
// single-file build and on localhost. The visitor's choice is in localStorage, shared by the app and the site pages;
// without a choice, Do Not Track or Global Privacy Control make it off. Without the script everything works the same.

const ID: string | undefined = import.meta.env.VITE_UMAMI_ID;
const SRC: string = import.meta.env.VITE_UMAMI_SRC || 'https://cloud.umami.is/script.js';
const CHOICE = 'usage-stats'; // 'on' | 'off'
const LAST_DAY = 'usage-stats-day'; // the day the daily usage event was sent
const UMAMI_OFF = 'umami.disabled'; // Umami's own opt-out, also honored by a script that is already loaded

/** Event data: counts, booleans and fixed names only. */
export type EventData = Record<string, string | number | boolean>;
type Umami = { track: (name?: string | ((p: EventData) => EventData), data?: EventData) => void };
const umami = () => (globalThis as { umami?: Umami }).umami;

const storage = {
  get: (key: string) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key: string, value: string | null) => {
    try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* private mode */ }
  },
};

/** Whether this copy can send stats at all. */
export function statsAvailable() {
  if (!ID || import.meta.env.MODE === 'single' || typeof location === 'undefined') return false;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return false;
  return !new URLSearchParams(location.search).has('demo');
}

/** The browser asks sites not to track (Do Not Track or Global Privacy Control). */
export function browserOptsOut() {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

/** The visitor's explicit choice, or null when they never made one. */
export const statsChoice = () => (storage.get(CHOICE) as 'on' | 'off' | null);

export const statsOn = () => statsAvailable() && (statsChoice() ?? (browserOptsOut() ? 'off' : 'on')) === 'on';

export function setStatsOn(on: boolean) {
  storage.set(CHOICE, on ? 'on' : 'off');
  storage.set(UMAMI_OFF, on ? null : '1');
  if (on) startStats();
}

let loading: Promise<void> | null = null;
let pending: (() => void)[] = [];

/** Load the script (once) when stats are on, then send this page's view. */
export function startStats() {
  if (!statsOn() || loading) return;
  storage.set(UMAMI_OFF, null);
  loading = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.defer = true;
    s.dataset.websiteId = ID;
    s.dataset.autoTrack = 'false'; // page views come from pageview(), with the app's hash route in the URL
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.append(s);
  });
  loading.then(() => {
    const queued = pending;
    pending = [];
    queued.forEach((fn) => fn());
  });
  pageview();
}

/** Run once the script is there; dropped when stats are off. */
function send(fn: (u: Umami) => void) {
  if (!statsOn()) return;
  const run = () => { const u = umami(); if (u) fn(u); };
  if (umami()) run();
  else if (loading) pending.push(run);
}

/** A page view: the path plus the app's hash route (#/summary), which holds only fixed names. */
export const pageview = () => send((u) => u.track((p) => ({ ...p, url: location.pathname + location.hash })));

export const track = (name: string, data?: EventData) => send((u) => u.track(name, data));

const sent = new Set<string>();
/** An event sent at most once per page load. */
export function trackOnce(name: string, data?: EventData) {
  if (sent.has(name) || !statsOn()) return;
  sent.add(name);
  track(name, data);
}

/** An event sent at most once per calendar day on this device (the daily "how is it used" snapshot). */
export function trackDaily(name: string, data: () => EventData) {
  const today = new Date().toDateString();
  if (!statsOn() || storage.get(LAST_DAY) === today) return;
  storage.set(LAST_DAY, today);
  track(name, data());
}

/** A count as a range, so the stats show the shape of use and not exact numbers. */
export function bucket(n: number) {
  if (n <= 0) return '0';
  if (n <= 3) return '1-3';
  if (n <= 6) return '4-6';
  if (n <= 10) return '7-10';
  if (n <= 20) return '11-20';
  return '21+';
}
