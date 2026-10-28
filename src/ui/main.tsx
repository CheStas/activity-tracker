// Main screen: header with live totals and the activity buttons.
import { useEffect, useRef, useState } from 'preact/hooks';
import { tap, visibleActivities, activeSegment, todayTotals, todayTotal, activityById, firstStart, isGroupOn } from '../state.ts';
import { lastSwitch } from '../timeline.ts';
import type { Activity } from '../types.ts';
import { fmtDur, fmtClock, fmtDayShort, targetText } from './util.ts';
import { Icon } from './icons.tsx';
import { openActivityPopup } from './activityPopup.tsx';
import { useAppState, useNow } from './hooks.tsx';

const LONG_PRESS_MS = 600;

interface Props {
  onProfiles: () => void;
  onSettings: () => void;
  onSummary: () => void;
  onReset: () => void;
  onFullscreen: () => void;
  onQuit: () => void;
}

export function Main({ onProfiles, onSettings, onSummary, onReset, onFullscreen, onQuit }: Props) {
  const state = useAppState();
  const now = useNow();
  const fullscreen = useFullscreen();
  const { pressed, handlers } = usePresses();

  const totals = todayTotals(now);
  const dayMs = todayTotal(now);
  const open = activeSegment();
  const first = firstStart();

  let main = visibleActivities();
  let rest: Activity[] = [];
  const popularity = state.profile.settings.popularity;
  if (popularity) {
    rest = main.filter((a) => !totals.has(a.id));
    main = main.filter((a) => totals.has(a.id));
  }
  // Nothing tracked yet today: a welcome hint, and the buttons centered on the screen (see CSS .fresh).
  const fresh = state.segments.length === 0;

  return (
    <section id="view-main" class={`view${fresh ? ' fresh' : ''}`}>
      <header class="bar">
        <div class="stat">
          <span class="k">{state.profiles.length > 1 ? state.profile.name : 'Today'} · {fmtDayShort(now)}</span>
          <span class="v">{fmtDur(dayMs)} <small id="day-start">{first === null ? '' : `since ${fmtClock(first)}`}</small></span>
        </div>
        {/* While idle the header just says "Idle": no idle duration, no time since the switch. */}
        <div class="stat grow">
          <span class="k">{open ? activityById(open.activityId)?.name ?? 'Active' : 'Now'}</span>
          <span class={`v${open ? '' : ' muted'}`} id="current-run">{open ? fmtDur(now - open.start) : 'Idle'}</span>
        </div>
        <div class="stat" hidden={!open}>
          <span class="k">Since switch</span>
          <span class="v">{open ? fmtDur(now - (lastSwitch(state.segments, now) ?? now)) : '–'}</span>
        </div>
        <div class="stat"><span class="k">Clock</span><span class="v">{fmtClock(now)}</span></div>
        <nav class="icons">
          {state.profiles.length > 1 && (
            <button class="icon" aria-label="Profiles" title="Profiles" onClick={onProfiles}><Icon name="users" /></button>
          )}
          <button class="icon" aria-label="Summary" title="Summary" onClick={onSummary}><Icon name="summary" /></button>
          <button class="icon" aria-label="Settings" title="Settings" onClick={onSettings}><Icon name="settings" /></button>
          <button class="icon" aria-label="Reset day" title="Reset day" onClick={onReset}><Icon name="reset" /></button>
          <button class="icon" aria-label="Toggle full screen" title="Full screen" onClick={onFullscreen}>
            <Icon name={fullscreen ? 'minimize' : 'maximize'} />
          </button>
          <button class="icon" id="btn-quit" aria-label="Close app" title="Close app" onClick={onQuit}><Icon name="power" /></button>
        </nav>
      </header>
      <main class="grid" {...handlers}>
        {main.length === 0 && rest.length === 0 ? <p class="empty">{state.groups.some((g) => !isGroupOn(g)) ? 'Nothing to show: all groups are off (Settings → Groups).' : 'No activities. Add some in Settings.'}</p> : <>
          {fresh && (
            <div class="hint">
              <strong>Ready to start the day</strong>
              <span>Tap an activity to start tracking · hold one to set an earlier start</span>
            </div>
          )}
          {main.map((a) => {
            const total = totals.get(a.id) ?? 0;
            const size = popularity ? sizeFor(total / (dayMs || 1)) : 1;
            const active = open?.activityId === a.id;
            const target = targetText(a.targetMin, total);
            return (
              <button
                key={a.id} data-id={a.id} style={{ '--c': a.color, '--span': size }}
                class={`act${active ? ' active' : ''}${pressed === a.id ? ' pressing' : ''}`}
              >
                <span class="name">{a.name}</span>
                <span class={`target${target.endsWith('over') ? ' over' : ''}`}>{target}</span>
                <span class="total">{fmtDur(total)}</span>
                <span class="run">{active && open ? `▶ ${fmtDur(now - open.start)}` : ''}</span>
              </button>
            );
          })}
        </>}
      </main>
      <div class="strip" hidden={rest.length === 0} {...handlers}>
        {rest.map((a) => <button key={a.id} class="chip" data-id={a.id} style={{ '--c': a.color }}>{a.name}</button>)}
      </div>
    </section>
  );
}

function sizeFor(share: number) {
  if (share >= 0.35) return 3;
  if (share >= 0.15) return 2;
  return 1;
}

function useFullscreen() {
  const [on, setOn] = useState(Boolean(document.fullscreenElement));
  useEffect(() => {
    const fn = () => setOn(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', fn);
    return () => document.removeEventListener('fullscreenchange', fn);
  }, []);
  return on;
}

/** Tap = switch, long-press = popup, on any [data-id] inside the container. Pointer events cover touch and mouse. */
function usePresses() {
  const [pressed, setPressed] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const current = useRef<string | null>(null);
  const longFired = useRef(false);

  const idOf = (e: Event) => (e.target as Element).closest<HTMLElement>('[data-id]')?.dataset.id ?? null;
  const cancel = () => {
    clearTimeout(timer.current);
    current.current = null;
    setPressed(null);
  };

  const handlers = {
    onPointerDown: (e: PointerEvent) => {
      const id = idOf(e);
      if (!id) return;
      current.current = id;
      longFired.current = false;
      setPressed(id);
      timer.current = setTimeout(() => {
        longFired.current = true;
        setPressed(null);
        openActivityPopup(id);
      }, LONG_PRESS_MS);
    },
    onPointerUp: (e: PointerEvent) => {
      const id = idOf(e);
      if (id && id === current.current && !longFired.current) tap(id);
      cancel();
    },
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (e: Event) => e.preventDefault(),
  };
  return { pressed, handlers };
}
