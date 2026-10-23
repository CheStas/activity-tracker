// Main screen: header with live totals and the activity button grid.
import { state, subscribe, tap, visibleActivities, activeSegment, todayTotals, todayTotal, activityById, firstStart } from '../state.js';
import { lastSwitch } from '../timeline.js';
import { $, esc, fmtDur, fmtClock, fmtDayShort, targetText } from './util.js';
import { icon } from './icons.js';
import { openActivityPopup } from './activityPopup.js';

const LONG_PRESS_MS = 600;

export function mountMain(root, { onSettings, onSummary, onReset, onFullscreen, onQuit }) {
  root.innerHTML = `
    <header class="bar">
      <div class="stat"><span class="k">Today · <span id="today-date"></span></span><span class="v"><span id="day-total">0:00</span> <small id="day-start"></small></span></div>
      <div class="stat grow"><span class="k" id="current-label">Now</span><span class="v" id="current-run">Idle</span></div>
      <div class="stat" id="since-switch-stat"><span class="k">Since switch</span><span class="v" id="since-switch">–</span></div>
      <div class="stat"><span class="k">Clock</span><span class="v" id="clock"></span></div>
      <nav class="icons">
        <button class="icon" id="btn-summary" aria-label="Summary" title="Summary">${icon('summary')}</button>
        <button class="icon" id="btn-settings" aria-label="Settings" title="Settings">${icon('settings')}</button>
        <button class="icon" id="btn-reset" aria-label="Reset day" title="Reset day">${icon('reset')}</button>
        <button class="icon" id="btn-fullscreen" aria-label="Toggle full screen" title="Full screen">${icon('maximize')}</button>
        <button class="icon" id="btn-quit" aria-label="Close app" title="Close app">${icon('power')}</button>
      </nav>
    </header>
    <main class="grid" id="grid"></main>
    <div class="strip" id="strip"></div>`;

  $('#btn-settings', root).onclick = onSettings;
  $('#btn-summary', root).onclick = onSummary;
  $('#btn-reset', root).onclick = onReset;
  $('#btn-fullscreen', root).onclick = onFullscreen;
  $('#btn-quit', root).onclick = onQuit;
  document.addEventListener('fullscreenchange', () => {
    $('#btn-fullscreen', root).innerHTML = icon(document.fullscreenElement ? 'minimize' : 'maximize');
  });

  bindPresses($('#grid', root));
  bindPresses($('#strip', root));

  subscribe((ev) => ev === 'change' && render(root));
  render(root);
}

/** Tap = switch, long-press = popup. Pointer events cover touch and mouse. */
function bindPresses(container) {
  let timer = null;
  let pressed = null;
  let longFired = false;

  container.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    pressed = btn;
    longFired = false;
    btn.classList.add('pressing');
    timer = setTimeout(() => {
      longFired = true;
      btn.classList.remove('pressing');
      openActivityPopup(btn.dataset.id);
    }, LONG_PRESS_MS);
  });
  const cancel = () => {
    clearTimeout(timer);
    pressed?.classList.remove('pressing');
    pressed = null;
  };
  container.addEventListener('pointerup', (e) => {
    const btn = e.target.closest('[data-id]');
    if (pressed && btn === pressed && !longFired) tap(btn.dataset.id);
    cancel();
  });
  container.addEventListener('pointercancel', cancel);
  container.addEventListener('pointerleave', cancel);
  container.addEventListener('contextmenu', (e) => e.preventDefault());
}

function sizeFor(share) {
  if (share >= 0.35) return 3;
  if (share >= 0.15) return 2;
  return 1;
}

function render(root) {
  const now = Date.now();
  const totals = todayTotals(now);
  const dayMs = todayTotal(now);
  const open = activeSegment();
  const grid = $('#grid', root);
  const strip = $('#strip', root);

  let main = visibleActivities();
  let rest = [];
  if (state.settings.popularity) {
    rest = main.filter((a) => !totals.has(a.id));
    main = main.filter((a) => totals.has(a.id));
  }

  grid.innerHTML = main
    .map((a) => {
      const size = state.settings.popularity ? sizeFor((totals.get(a.id) ?? 0) / (dayMs || 1)) : 1;
      const active = open?.activityId === a.id;
      return `
        <button class="act ${active ? 'active' : ''}" data-id="${a.id}" style="--c:${a.color};--span:${size}">
          <span class="name">${esc(a.name)}</span>
          <span class="target" data-target="${a.id}"></span>
          <span class="total" data-total="${a.id}"></span>
          <span class="run"></span>
        </button>`;
    })
    .join('');
  strip.hidden = rest.length === 0;
  strip.innerHTML = rest
    .map((a) => `<button class="chip" data-id="${a.id}" style="--c:${a.color}">${esc(a.name)}</button>`)
    .join('');
  // Nothing tracked yet today: a welcome hint, and the buttons centered on the screen (see CSS .fresh).
  const fresh = state.segments.length === 0;
  root.classList.toggle('fresh', fresh);
  if (main.length === 0 && rest.length === 0) {
    grid.innerHTML = `<p class="empty">No activities. Add some in Settings.</p>`;
  } else if (fresh) {
    grid.insertAdjacentHTML('afterbegin', `<div class="hint"><strong>Ready to start the day</strong>
      <span>Tap an activity to start tracking · hold one to set an earlier start</span></div>`);
  }
  tick(root);
}

/** Per-second text update; does not rebuild buttons so long-presses are not interrupted. */
export function tick(root) {
  const now = Date.now();
  const totals = todayTotals(now);
  const open = activeSegment();

  const first = firstStart();
  $('#today-date', root).textContent = fmtDayShort(now);
  $('#day-total', root).textContent = fmtDur(todayTotal(now));
  $('#day-start', root).textContent = first === null ? '' : `since ${fmtClock(first)}`;
  $('#clock', root).textContent = fmtClock(now);
  // While idle the header just says "Idle": no idle duration, no time since the switch.
  $('#since-switch-stat', root).hidden = !open;
  $('#current-run', root).classList.toggle('muted', !open);
  if (open) {
    const a = activityById(open.activityId);
    $('#current-label', root).textContent = a?.name ?? 'Active';
    $('#current-run', root).textContent = fmtDur(now - open.start);
    $('#since-switch', root).textContent = fmtDur(now - lastSwitch(state.segments, now));
  } else {
    $('#current-label', root).textContent = 'Now';
    $('#current-run', root).textContent = 'Idle';
  }

  for (const node of root.querySelectorAll('[data-total]')) {
    node.textContent = fmtDur(totals.get(node.dataset.total) ?? 0);
  }
  for (const node of root.querySelectorAll('[data-target]')) {
    const a = activityById(node.dataset.target);
    node.textContent = targetText(a?.targetMin, totals.get(a?.id) ?? 0);
    node.classList.toggle('over', node.textContent.endsWith('over'));
  }
  const run = root.querySelector('.act.active .run');
  if (run && open) run.textContent = `▶ ${fmtDur(now - open.start)}`;
}
