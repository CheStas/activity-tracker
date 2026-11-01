// Entry point: view switching, Esc/back, theme, full screen, quit, day rollover, wake lock, auto-export.
import { render } from 'preact';
import { useEffect, useLayoutEffect, useState } from 'preact/hooks';
import { init, subscribe, checkRollover, resetDay, state, notify, activeSegment, activityById, todayTotal } from './state.ts';
import { cssVars, findTheme, resolveTheme } from './theme.ts';
import { Main } from './ui/main.tsx';
import { Settings } from './ui/settings.tsx';
import { Summary } from './ui/summary.tsx';
import { DayEditor } from './ui/dayEditor.tsx';
import { ModalHost, closeTopModal, confirmDialog, messageDialog } from './ui/hooks.tsx';
import { ScrollTop, type Nav } from './ui/header.tsx';
import { openProfilePicker } from './ui/profiles.tsx';
import { download, fmtDayShort, fmtHours, isoDay, slug } from './ui/util.ts';
import '@fontsource/geist-sans/latin-400.css';
import '@fontsource/geist-sans/latin-500.css';
import '@fontsource/geist-sans/latin-600.css';
import '@fontsource/geist-sans/latin-700.css';
import '@fontsource/geist-mono/latin-400.css';
import '@fontsource/geist-mono/latin-500.css';
import '@fontsource/geist-mono/latin-600.css';
import './styles.css';

type View = 'main' | 'settings' | 'summary' | 'day-editor';
// Esc / back goes up this hierarchy; main has no parent, so there are no loops. The day editor goes back to where it
// was opened from: Settings, or Main (the activity popup's "Edit sessions").
const parent: Partial<Record<View, View>> = { settings: 'main', summary: 'main' };

function App() {
  const [view, setView] = useState<View>('main');
  const [section, setSection] = useState<string>();
  const [editorFrom, setEditorFrom] = useState<View>('settings');
  // Main and Settings scroll the page; each view starts at its top.
  useLayoutEffect(() => window.scrollTo(0, 0), [view]);
  parent['day-editor'] = editorFrom;
  const toEditor = (from: View) => {
    setEditorFrom(from);
    setView('day-editor');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (!closeTopModal()) setView((v) => parent[v] ?? v);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const toMain = () => setView('main');
  const toSettings = (to?: string) => {
    setSection(to);
    setView('settings');
  };
  // The header is the same on every page, so are its buttons.
  const nav: Nav = {
    onProfiles: () => openProfilePicker(toSettings),
    onSettings: toSettings,
    onSummary: () => setView('summary'),
    onReset: confirmReset,
    onFullscreen: toggleFullscreen,
    onQuit: quit,
  };
  return (
    <>
      {view === 'main' && <Main nav={nav} onDayEditor={() => toEditor('main')} />}
      {view === 'settings' && <Settings nav={nav} section={section} onBack={toMain} onDayEditor={() => toEditor('settings')} />}
      {view === 'summary' && <Summary nav={nav} onBack={toMain} onDayEditor={() => toEditor('summary')} />}
      {view === 'day-editor' && <DayEditor nav={nav} onBack={() => setView(editorFrom)} />}
      <ScrollTop />
      <ModalHost />
    </>
  );
}

const darkQuery = matchMedia('(prefers-color-scheme: dark)');

/**
 * The open profile's theme as CSS custom properties on <html>. They are mirrored to localStorage (both themes under
 * Follow system) so the inline script in index.html applies them before the first paint.
 */
function applyTheme() {
  const s = state.profile.settings;
  const vars = cssVars(resolveTheme(s, state.themes, darkQuery.matches));
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
  const mirror = s.themeMode === 'fixed'
    ? { fixed: vars }
    : { light: cssVars(findTheme(state.themes, s.lightThemeId, false)), dark: cssVars(findTheme(state.themes, s.darkThemeId, true)) };
  try {
    localStorage.setItem('theme-vars', JSON.stringify(mirror));
  } catch {}
}

async function start() {
  navigator.storage?.persist?.();
  await init();
  applyTheme();
  // Follow system: switch with the OS setting (notify re-renders what shows the current theme).
  darkQuery.addEventListener('change', notify);
  subscribe((ev, payload) => {
    if (ev === 'change') {
      applyTheme();
      syncWakeLock();
    }
    if (ev === 'dayClosed' && payload && state.profile.settings.autoExport) {
      const profile = state.profiles.length > 1 ? `${slug(payload.profile)}-` : '';
      download(`activity-day-${profile}${isoDay(payload.day.startedAt)}.json`, payload);
    }
  });

  // Full screen needs a user gesture, so "start in full screen" kicks in on the first tap.
  if (state.profile.settings.startFullscreen) {
    document.addEventListener('pointerdown', () => !document.fullscreenElement && toggleFullscreen(), { once: true });
  }

  setInterval(() => checkRollover(), 1000);

  render(<App />, document.getElementById('app')!);
  document.addEventListener('visibilitychange', syncWakeLock);
  syncWakeLock();
}

/** Document full screen. Esc is captured (Keyboard Lock) so it stays "back"; holding Esc leaves full screen. */
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
      await (navigator as Navigator & { keyboard?: { lock?: (keys: string[]) => Promise<void> } }).keyboard?.lock?.(['Escape']);
    }
  } catch (e) {
    console.warn('Full screen unavailable:', (e as Error).message);
  }
}

/** The running activity's name, or null while idle. */
const runningName = () => {
  const open = activeSegment();
  return open ? activityById(open.activityId)?.name ?? 'The activity' : null;
};

async function confirmReset() {
  const name = runningName();
  const ok = await confirmDialog({
    title: 'Reset the day?',
    body: `${name ? `${name} stops now. ` : ''}${fmtDayShort(state.day.startedAt)} closes with ${fmtHours(todayTotal())} tracked and a new day starts. You can still edit the closed day from Summary.`,
    ok: 'Reset day', danger: true,
  });
  if (ok) resetDay();
}

async function quit() {
  const name = runningName();
  const ok = await confirmDialog({
    title: 'Close Activity Tracker?',
    body: name ? `${name} keeps counting while the app is closed. Open the app again to stop it or switch.` : 'Nothing is running.',
    ok: 'Close app',
  });
  if (!ok) return;
  window.close();
  // Browsers only let scripts close app windows / script-opened tabs; tell the user otherwise.
  setTimeout(() => messageDialog(
    'Close the window yourself',
    `The browser does not let this page close its own window. Press Alt+F4 or Ctrl+W.${name ? ` ${name} keeps counting.` : ''}`,
  ), 300);
}

/**
 * Hold a screen Wake Lock while Settings → Keep the screen on is set and the page is visible. The browser drops the
 * lock when the page is hidden, so this runs again on visibilitychange. `wakeLock` is the pending/held request.
 */
let wakeLock: Promise<WakeLockSentinel | undefined> | null = null;
async function syncWakeLock() {
  if (!('wakeLock' in navigator)) return;
  const want = state.profile.settings.keepAwake && document.visibilityState === 'visible';
  if (want && !wakeLock) {
    const req: Promise<WakeLockSentinel | undefined> = navigator.wakeLock.request('screen').then(
      (lock) => {
        lock.addEventListener('release', () => wakeLock === req && (wakeLock = null));
        return lock;
      },
      (e) => {
        console.warn('Wake lock unavailable:', e.message);
        if (wakeLock === req) wakeLock = null;
        return undefined;
      },
    );
    wakeLock = req;
  } else if (!want && wakeLock) {
    const req = wakeLock;
    wakeLock = null;
    (await req)?.release();
  }
}

start();
