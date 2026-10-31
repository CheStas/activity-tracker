// Main screen: welcome strip, header with live totals, the activity buttons, the unused strip, today's timeline and
// group totals, all in one viewport; the footer (links, quick theme switch) sits below it.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import {
  tap, visibleActivities, activeSegment, todayTotals, todayTotal, activityById, firstStart, isGroupOn, groupById, setSetting,
} from '../state.ts';
import { gaps } from '../timeline.ts';
import { slotColor } from '../theme.ts';
import type { Activity, Layout } from '../types.ts';
import { fmtDur, fmtHMS, fmtHM, fmtClock, fmtDayShort } from './util.ts';
import { Icon, type IconName } from './icons.tsx';
import { openActivityPopup } from './activityPopup.tsx';
import { AboutLinks, ThemeSwatches, VERSION, currentTheme } from './about.tsx';
import { openModal, useAppState, useNow } from './hooks.tsx';

const LONG_PRESS_MS = 600;
/** Timeline blocks this long or longer show their duration inside. */
const LABEL_MIN_MS = 35 * 60000;

interface Props {
  onProfiles: () => void;
  onSettings: (section?: string) => void;
  onSummary: () => void;
  onDayEditor: () => void;
  onReset: () => void;
  onFullscreen: () => void;
  onQuit: () => void;
}

export function Main({ onProfiles, onSettings, onSummary, onDayEditor, onReset, onFullscreen, onQuit }: Props) {
  const state = useAppState();
  const now = useNow();
  const { pressed, handlers } = usePresses(onDayEditor);
  const s = state.profile.settings;

  const totals = todayTotals(now);
  const dayMs = todayTotal(now);

  const fresh = state.segments.length === 0;
  let main = visibleActivities();
  let rest: Activity[] = [];
  // While nothing is tracked the strip is suspended, so every activity is a button.
  if (s.unusedStrip && !fresh) {
    rest = main.filter((a) => !totals.has(a.id));
    main = main.filter((a) => totals.has(a.id));
  }
  const intro = !s.introDismissed;
  const footer = s.showFooter && !intro;

  return (
    <div class="main-page">
      <section id="view-main" class={`main-screen${fresh ? ' fresh' : ''}`}>
        {intro && <WelcomeStrip />}
        <Header now={now} dayMs={dayMs} onProfiles={onProfiles} onSettings={() => onSettings()} onSummary={onSummary} onReset={onReset} onFullscreen={onFullscreen} onQuit={onQuit} />
        {fresh && main.length > 0 && (
          <p class="ready"><strong>Ready to start the day</strong> · Tap an activity to start tracking · hold one to set an earlier start</p>
        )}
        <Buttons main={main} rest={rest} layout={s.layout} sizing={s.popularity && !fresh} totals={totals} dayMs={dayMs} now={now} pressed={pressed} handlers={handlers} />
        <div class="unused">
          {rest.length > 0 && <>
            <span class="muted">Not used today</span>
            <div class="chips" {...handlers}>
              {rest.map((a) => (
                <button key={a.id} class={`chip${pressed === a.id ? ' pressing' : ''}`} data-id={a.id}>
                  <span class="dot" style={{ background: slotColor(a.colorSlot) }} />{a.name}
                </button>
              ))}
            </div>
          </>}
          <span class="muted tap-hint">Tap to switch · tap the running one to stop · hold for sessions</span>
        </div>
        {s.showTimeline && !fresh && <DayTimeline now={now} />}
        {s.showGroups && !fresh && <GroupTotals now={now} />}
        {footer && (
          <a class="more-hint" href="#footer" aria-label="More below: links and themes" onClick={(e) => {
            e.preventDefault();
            document.getElementById('footer')?.scrollIntoView({ behavior: 'smooth' });
          }}>
            <svg viewBox="0 0 24 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3l7 6 7-6" /></svg>
          </a>
        )}
      </section>
      {footer && <Footer onSettings={onSettings} />}
    </div>
  );
}

function WelcomeStrip() {
  return (
    <section class="welcome" aria-label="Welcome">
      <strong>New here?</strong>
      <span class="muted">Tap an activity to start the day · hold one to set an earlier start.</span>
      <nav aria-label="About" class="links"><AboutLinks variant="strip" /></nav>
      <ThemeSwatches compact />
      <button class="got-it" onClick={() => setSetting('introDismissed', true)}>Got it</button>
    </section>
  );
}

interface HeaderProps extends Omit<Props, 'onDayEditor' | 'onSettings'> {
  now: number;
  dayMs: number;
  onSettings: () => void;
}

function Header({ now, dayMs, onProfiles, onSettings, onSummary, onReset, onFullscreen, onQuit }: HeaderProps) {
  const state = useAppState();
  const fullscreen = useFullscreen();
  const open = activeSegment();
  const active = open && activityById(open.activityId);
  const first = firstStart();
  return (
    <header class="main-header">
      {state.profiles.length > 1 && (
        <button class="prof" aria-label={`Switch profile, ${state.profile.name} is open`} onClick={onProfiles}>
          <span class="initial">{state.profile.name.trim().charAt(0).toUpperCase()}</span>
          <span class="name hide-sm">{state.profile.name}</span>
          <Icon name="chevronDown" />
        </button>
      )}
      <div class="stat">
        <span class="k">Today · {fmtDayShort(now)}</span>
        <span class="v"><span class="num big">{fmtHMS(dayMs)}</span>{first !== null && <span class="muted since">since {fmtClock(first)}</span>}</span>
      </div>
      {/* While idle the header just says "Idle": no idle duration. */}
      <div class="stat now">
        <span class="k">Now</span>
        <span class="v">
          <span class="dot" style={{ background: active ? slotColor(active.colorSlot) : 'var(--line)' }} />
          <span class="now-name">{open ? active?.name ?? 'Active' : 'Idle'}</span>
          {open && <span class="num muted">{fmtDur(now - open.start)}</span>}
        </span>
      </div>
      <div class="header-end">
        <div class="stat clock">
          <span class="k">Clock</span>
          <span class="num big">{fmtClock(now)}</span>
        </div>
        <nav class="icons" aria-label="App">
          <button class="icon round" aria-label="Summary" title="Summary" onClick={onSummary}><Icon name="summary" /></button>
          <button class="icon round" aria-label="Settings" title="Settings" onClick={onSettings}><Icon name="settings" /></button>
          <button class="icon round hide-sm" aria-label="Reset day" title="Reset day" onClick={onReset}><Icon name="reset" /></button>
          <button class="icon round hide-sm" aria-label={fullscreen ? 'Leave full screen' : 'Full screen'} title="Full screen" onClick={onFullscreen}>
            <Icon name={fullscreen ? 'minimize' : 'maximize'} />
          </button>
          <button class="icon round hide-sm" aria-label="Close app" title="Close app" onClick={onQuit}><Icon name="power" /></button>
          <button class="icon round show-sm" aria-label="More: reset day, full screen, close app" title="More" onClick={() => openMoreMenu({ onReset, onFullscreen, onQuit, fullscreen })}>
            <Icon name="more" />
          </button>
        </nav>
      </div>
    </header>
  );
}

interface ButtonsProps {
  main: Activity[];
  rest: Activity[];
  layout: Layout;
  sizing: boolean;
  totals: Map<string, number>;
  dayMs: number;
  now: number;
  pressed: string | null;
  handlers: ReturnType<typeof usePresses>['handlers'];
}

function Buttons({ main, rest, layout, sizing, totals, dayMs, now, pressed, handlers }: ButtonsProps) {
  const state = useAppState();
  const open = activeSegment();
  // Size by usage is relative to the most-used activity today.
  const max = Math.max(1, ...main.map((a) => totals.get(a.id) ?? 0));

  if (main.length === 0 && rest.length === 0) {
    return (
      <main class="buttons empty">
        <p class="muted">{state.groups.some((g) => !isGroupOn(g)) ? 'Nothing to show: all groups are off (Settings → Groups).' : 'No activities. Add some in Settings.'}</p>
      </main>
    );
  }
  return (
    <main class={`buttons ${layout}`} {...handlers}>
      {main.map((a) => {
        const total = totals.get(a.id) ?? 0;
        const k = sizing ? total / max : 0;
        const active = open?.activityId === a.id;
        const pct = dayMs ? Math.round((total / dayMs) * 100) : 0;
        const target = a.targetMin ? a.targetMin * 60000 : 0;
        const over = total - target;
        // Progress: toward the target when there is one, otherwise the share of today.
        const progress = target ? Math.min(1, total / target) : pct / 100;
        const long = !target ? `${pct}% of today` : over <= 0 ? `${fmtHM(-over)} left of ${fmtHM(target)} target` : `${fmtHM(over)} over target`;
        const short = !target ? `${pct}% of today` : over <= 0 ? `${fmtHM(-over)} left` : `${fmtHM(over)} over`;
        const run = active && open ? fmtDur(now - open.start) : '';
        const cls = `act${active ? ' active' : ''}${pressed === a.id ? ' pressing' : ''}`;
        const style = { '--c': slotColor(a.colorSlot), '--k': k };
        const name = <span class="name" title={a.name}>{a.name}</span>;
        const meter = <span class="meter"><span style={{ width: `${progress * 100}%` }} /></span>;
        if (layout === 'rows') {
          return (
            <button key={a.id} data-id={a.id} class={cls} style={style} aria-pressed={active}>
              <span class="row-top">
                <span class="sq" />{name}<span class="sub num">{pct}%</span>
                <span class="grow" />
                {active && <span class="running"><span class="pulse" /><span class="num">{run}</span></span>}
                <span class="total num">{fmtHMS(total)}</span>
              </span>
              <span class="row-bottom">{meter}<span class="sub row-hint">{long}</span></span>
            </button>
          );
        }
        if (layout === 'circles') {
          return (
            <button key={a.id} data-id={a.id} class={cls} style={style} aria-pressed={active}>
              <svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="47" class="ring-track" />
                <circle cx="50" cy="50" r="47" class="ring-fill" pathLength={100} stroke-dasharray={`${progress * 100} 100`} />
              </svg>
              <span class="circle-name"><span class="sq" />{name}</span>
              <span class="total num">{fmtHMS(total)}</span>
              {active && <span class="running"><span class="pulse" /><span class="num">{run}</span></span>}
              <span class="sub">{short}</span>
            </button>
          );
        }
        return (
          <button key={a.id} data-id={a.id} class={cls} style={style} aria-pressed={active}>
            <span class="tile-top">
              <span class="sq" />{name}<span class="sub num">{pct}%</span>
            </span>
            <span class="tile-bottom">
              {active && <span class="running"><span class="pulse" />Running <span class="num">{run}</span></span>}
              <span class="total num">{fmtHMS(total)}</span>
              <span class="progress">{meter}<span class="sub">{long}</span></span>
            </span>
          </button>
        );
      })}
    </main>
  );
}

/** Phone: Reset day, Full screen and Close app live in a ⋯ menu (a bottom sheet). */
function openMoreMenu({ onReset, onFullscreen, onQuit, fullscreen }: Pick<Props, 'onReset' | 'onFullscreen' | 'onQuit'> & { fullscreen: boolean }) {
  const item = (close: () => void, icon: IconName, label: string, fn: () => void) => (
    <button class="menu-item" onClick={() => {
      close();
      fn();
    }}><Icon name={icon} />{label}</button>
  );
  openModal((close) => (
    <div class="dialog-body menu">
      <h2 class="menu-title">More</h2>
      {item(close, 'reset', 'Reset day', onReset)}
      {item(close, fullscreen ? 'minimize' : 'maximize', fullscreen ? 'Leave full screen' : 'Full screen', onFullscreen)}
      {item(close, 'power', 'Close app', onQuit)}
      <button class="secondary wide" onClick={close}>Cancel</button>
    </div>
  ), { size: 'menu', closeButton: false });
}

/** Today's sessions as a bar of blocks (idle gaps in the track color), with hour labels above. */
function DayTimeline({ now }: { now: number }) {
  const state = useAppState();
  const [ref, width] = useWidth<HTMLDivElement>();
  const segs = [...state.segments].sort((a, b) => a.start - b.start);
  const from = segs[0].start;
  const to = Math.max(...segs.map((s) => s.end ?? now));
  const span = Math.max(to - from, 60000);

  const blocks: { key: string; ms: number; color?: string; title: string }[] = [];
  let prevEnd = from;
  for (const s of segs) {
    if (s.start > prevEnd) blocks.push({ key: `gap-${prevEnd}`, ms: s.start - prevEnd, title: `Idle · ${fmtHM(s.start - prevEnd)}` });
    const end = s.end ?? now;
    const a = activityById(s.activityId);
    // The running block is at least a minute wide so it shows from the first second.
    blocks.push({ key: s.id, ms: Math.max(end - s.start, s.end === null ? 60000 : 0), color: a && slotColor(a.colorSlot), title: `${a?.name ?? '?'} · ${fmtHM(end - s.start)}${s.end === null ? ' (running)' : ''}` });
    prevEnd = Math.max(prevEnd, end);
  }

  // Full hours after the start, thinned out so labels stay about 56 px apart.
  const ticks: { t: number; left: number }[] = [];
  const hourPx = width ? (width * 3600000) / span : 0;
  const step = hourPx ? Math.max(1, Math.ceil(56 / hourPx)) : 1;
  const d = new Date(from);
  d.setMinutes(0, 0, 0);
  for (let h = 1; ; h++) {
    const t = new Date(d).setHours(d.getHours() + h);
    if (t >= to) break;
    const left = (t - from) / span;
    if (h % step === 0 && left * width > 48 && left < 0.97) ticks.push({ t, left });
  }

  // On a phone only every second hour is labelled.
  return (
    <section class="day-timeline" aria-label="Today's timeline">
      <div class="ticks num" ref={ref}>
        <span style={{ left: 0, transform: 'none' }}>{fmtClock(from)}</span>
        {ticks.map(({ t, left }) => <span key={t} class={new Date(t).getHours() % 2 ? 'hide-sm' : ''} style={{ left: `${left * 100}%` }}>{fmtClock(t)}</span>)}
      </div>
      <div class="blocks">
        {blocks.map((b) => (
          <div key={b.key} class={b.color ? 'block' : 'block idle'} title={b.title} style={{ flexGrow: b.ms, background: b.color }}>
            {b.color && b.ms >= LABEL_MIN_MS ? <span>{fmtHM(b.ms)}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

/** "productive 6h 51m · non-productive 1h 52m · idle 0m": groups with time today, then no group, then idle. */
function GroupTotals({ now }: { now: number }) {
  const state = useAppState();
  const byGroup = new Map<string | null, number>();
  for (const [id, ms] of todayTotals(now)) {
    const g = groupById(activityById(id)?.groupId ?? null);
    byGroup.set(g?.id ?? null, (byGroup.get(g?.id ?? null) ?? 0) + ms);
  }
  const idle = gaps(state.segments, now).reduce((sum, g) => sum + g.end - g.start, 0);
  const entries: [string, number][] = state.groups.length
    ? [
      ...state.groups.filter((g) => byGroup.has(g.id)).map((g): [string, number] => [g.name, byGroup.get(g.id)!]),
      ...(byGroup.has(null) ? [['no group', byGroup.get(null)!] as [string, number]] : []),
    ]
    : [['tracked', todayTotal(now)]];
  return (
    <div class="group-line">
      {[...entries, ['idle', idle] as [string, number]].map(([name, ms]) => <span key={name}>{name} <strong class="num">{fmtHM(ms)}</strong></span>)}
    </div>
  );
}

function Footer({ onSettings }: { onSettings: (section?: string) => void }) {
  return (
    <footer id="footer" class="main-footer">
      <div class="about">
        <strong>Activity Tracker</strong>
        <span class="muted">A chess clock for your work day. Your data stays in this browser.</span>
        <span class="muted num small">{VERSION}</span>
      </div>
      <nav aria-label="About" class="links"><AboutLinks variant="footer" /></nav>
      <div class="theme-switch" role="group" aria-label="Theme">
        <span class="muted theme-head">
          <span>Theme · <strong>{currentTheme().name}</strong></span>
          <button class="lnk lnk-muted" onClick={() => onSettings('appearance')}>More in Settings</button>
        </span>
        <ThemeSwatches />
      </div>
    </footer>
  );
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

/** An element's width, kept up to date. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Tap = switch, long-press = popup, on any [data-id] inside the container. Pointer events cover touch and mouse; a
 * click without a pointer (Enter or Space on a focused button) is a tap too.
 */
function usePresses(onDayEditor: () => void) {
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
        openActivityPopup(id, onDayEditor);
      }, LONG_PRESS_MS);
    },
    onPointerUp: (e: PointerEvent) => {
      const id = idOf(e);
      if (id && id === current.current && !longFired.current) tap(id);
      cancel();
    },
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onClick: (e: MouseEvent) => {
      const id = idOf(e);
      if (id && e.detail === 0) tap(id);
    },
    onContextMenu: (e: Event) => e.preventDefault(),
  };
  return { pressed, handlers };
}
