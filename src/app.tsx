// Entry point: view switching, Esc/back, full screen, quit, day rollover, wake lock, auto-export.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { init, subscribe, checkRollover, resetDay, state } from './state.ts';
import type { Settings as AppSettings } from './types.ts';
import { Main } from './ui/main.tsx';
import { Settings } from './ui/settings.tsx';
import { Summary } from './ui/summary.tsx';
import { DayEditor } from './ui/dayEditor.tsx';
import { ModalHost, closeTopModal } from './ui/hooks.tsx';
import { openProfilePicker } from './ui/profiles.tsx';
import { download, isoDay, slug } from './ui/util.ts';
import './styles.css';

type View = 'main' | 'settings' | 'summary' | 'day-editor';
// Esc / back goes up this hierarchy; main has no parent, so there are no loops. The day editor goes back to where it
// was opened from: Settings, or Main (the activity popup's "Edit sessions").
const parent: Partial<Record<View, View>> = { settings: 'main', summary: 'main' };

function App() {
  const [view, setView] = useState<View>('main');
  const [editorFrom, setEditorFrom] = useState<View>('settings');
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
  return (
    <>
      {view === 'main' && (
        <Main
          onProfiles={openProfilePicker}
          onSettings={() => setView('settings')}
          onSummary={() => setView('summary')}
          onDayEditor={() => toEditor('main')}
          onReset={() => {
            if (confirm('Close today and start a new day? Today is archived in the summary.')) resetDay();
          }}
          onFullscreen={toggleFullscreen}
          onQuit={quit}
        />
      )}
      {view === 'settings' && <Settings onBack={toMain} onDayEditor={() => toEditor('settings')} />}
      {view === 'summary' && <Summary onBack={toMain} onDayEditor={() => toEditor('summary')} />}
      {view === 'day-editor' && <DayEditor onBack={() => setView(editorFrom)} />}
      <ModalHost />
    </>
  );
}

/** Theme and layout live as data attributes on <html>; CSS does the rest. */
function applyAppearance({ theme, layout }: Pick<AppSettings, 'theme' | 'layout'>) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.layout = layout;
  try {
    localStorage.setItem('appearance', JSON.stringify({ theme, layout }));
  } catch {}
}

async function start() {
  // Last-used appearance first, so the page does not flash while IndexedDB loads.
  try {
    const cached = JSON.parse(localStorage.getItem('appearance') ?? 'null');
    if (cached) applyAppearance(cached);
  } catch {}
  navigator.storage?.persist?.();
  await init();
  applyAppearance(state.profile.settings);
  subscribe((ev, payload) => {
    if (ev === 'change') {
      applyAppearance(state.profile.settings);
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

function quit() {
  if (!confirm('Close the app? A running activity keeps counting until you stop it.')) return;
  window.close();
  // Browsers only let scripts close app windows / script-opened tabs; tell the user otherwise.
  setTimeout(() => alert('This window cannot be closed from the page. Close it with Alt+F4 or Ctrl+W.'), 300);
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
