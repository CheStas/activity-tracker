// Entry point: view switching, Esc/back, full screen, quit, the 1s ticker, day rollover, wake lock, auto-export.
import { init, subscribe, checkRollover, resetDay, state } from './state.js';
import { mountMain, tick } from './ui/main.js';
import { mountSettings } from './ui/settings.js';
import { mountSummary } from './ui/summary.js';
import { mountDayEditor } from './ui/dayEditor.js';
import { $, download, isoDay } from './ui/util.js';

const views = ['main', 'settings', 'summary', 'day-editor'];
// Esc / back goes up this hierarchy; main has no parent, so there are no loops.
const parent = { settings: 'main', summary: 'main', 'day-editor': 'settings' };
let current = 'main';
let summary;

function show(name) {
  current = name;
  for (const v of views) $(`#view-${v}`).hidden = v !== name;
  if (name === 'summary') summary.show();
}

function back() {
  const modals = document.querySelectorAll('.modal-backdrop');
  if (modals.length) return modals[modals.length - 1].querySelector('.modal-close').click();
  if (parent[current]) show(parent[current]);
}

/** Theme and layout live as data attributes on <html>; CSS does the rest. */
function applyAppearance({ theme, layout }) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.layout = layout;
  try {
    localStorage.setItem('appearance', JSON.stringify({ theme, layout }));
  } catch {}
}

async function start() {
  // Last-used appearance first, so the page does not flash while IndexedDB loads.
  try {
    const cached = JSON.parse(localStorage.getItem('appearance'));
    if (cached) applyAppearance(cached);
  } catch {}
  navigator.storage?.persist?.();
  await init();
  applyAppearance(state.settings);
  subscribe((ev) => {
    if (ev !== 'change') return;
    applyAppearance(state.settings);
    syncWakeLock();
  });

  mountMain($('#view-main'), {
    onSettings: () => show('settings'),
    onSummary: () => show('summary'),
    onReset: () => {
      if (confirm('Close today and start a new day? Today is archived in the summary.')) resetDay();
    },
    onFullscreen: toggleFullscreen,
    onQuit: quit,
  });
  mountSettings($('#view-settings'), { onBack: () => show('main'), onDayEditor: () => show('day-editor') });
  summary = mountSummary($('#view-summary'), { onBack: () => show('main') });
  mountDayEditor($('#view-day-editor'), { onBack: () => show('settings') });

  subscribe((ev, payload) => {
    if (ev === 'dayClosed' && state.settings.autoExport) {
      download(`activity-day-${isoDay(payload.day.startedAt)}.json`, payload);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      back();
    }
  });

  // Full screen needs a user gesture, so "start in full screen" kicks in on the first tap.
  if (state.settings.startFullscreen) {
    document.addEventListener('pointerdown', () => !document.fullscreenElement && toggleFullscreen(), { once: true });
  }

  setInterval(() => {
    tick($('#view-main'));
    checkRollover();
  }, 1000);

  show('main');
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
      await navigator.keyboard?.lock?.(['Escape']);
    }
  } catch (e) {
    console.warn('Full screen unavailable:', e.message);
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
let wakeLock = null;
async function syncWakeLock() {
  if (!('wakeLock' in navigator)) return;
  const want = state.settings.keepAwake && document.visibilityState === 'visible';
  if (want && !wakeLock) {
    const req = navigator.wakeLock.request('screen').then(
      (lock) => {
        lock.addEventListener('release', () => wakeLock === req && (wakeLock = null));
        return lock;
      },
      (e) => {
        console.warn('Wake lock unavailable:', e.message);
        if (wakeLock === req) wakeLock = null;
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
