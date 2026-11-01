// The header every page shares (profile button or back + page name, Today, Now, clock, app buttons) and the floating
// "Back to top" button.
import { useEffect, useState } from 'preact/hooks';
import { activeSegment, activityById, firstStart, todayTotal } from '../state.ts';
import { DEMO } from '../db.ts';
import { slotColor } from '../theme.ts';
import { fmtDur, fmtHMS, fmtClock, fmtDayShort } from './util.ts';
import { Icon, type IconName } from './icons.tsx';
import { openModal, useAppState, useNow } from './hooks.tsx';

/** What the header buttons do; App passes the same object to every page. */
export interface Nav {
  onProfiles: () => void;
  onSettings: (section?: string) => void;
  onSummary: () => void;
  onReset: () => void;
  onFullscreen: () => void;
  onQuit: () => void;
}

export type Page = 'main' | 'summary' | 'settings' | 'day-editor';

interface Props {
  nav: Nav;
  page: Page;
  /** Every page but Main: the page name next to the back button. */
  title?: string;
  onBack?: () => void;
}

export function AppHeader({ nav, page, title, onBack }: Props) {
  const state = useAppState();
  const now = useNow();
  const fullscreen = useFullscreen();
  const open = activeSegment();
  const active = open && activityById(open.activityId);
  const first = firstStart();
  // The open page's own button is marked and does nothing.
  const navButton = (to: Page, label: string, icon: IconName, fn: () => void) => (
    <button
      class={`icon round${page === to ? ' current' : ''}`} aria-label={label} title={label}
      aria-current={page === to ? 'page' : undefined} onClick={() => page !== to && fn()}
    ><Icon name={icon} /></button>
  );
  return (
    <>
      {DEMO && (
        <section class="welcome demo" aria-label="Demo">
          <strong>Demo</strong>
          <span class="muted">Sample data in a throwaway profile: play freely, a reload starts it over. Your own data is not touched.</span>
          <a class="got-it" href="./">Start your own</a>
        </section>
      )}
      <header class="app-header">
        {onBack ? (
          <span class="page-title">
            <button class="icon round" aria-label="Back" title="Back" onClick={onBack}><Icon name="back" /></button>
            <h1>{title}<span class="muted hide-sm"> · {state.profile.name}</span></h1>
          </span>
        ) : state.profiles.length > 1 && (
          <button class="prof" aria-label={`Switch profile, ${state.profile.name} is open`} onClick={nav.onProfiles}>
            <span class="initial">{state.profile.name.trim().charAt(0).toUpperCase()}</span>
            <span class="name hide-sm">{state.profile.name}</span>
            <Icon name="chevronDown" />
          </button>
        )}
        <div class="stat">
          <span class="k">Today · {fmtDayShort(now)}</span>
          <span class="v"><span class="num big">{fmtHMS(todayTotal(now))}</span>{first !== null && <span class="muted since">since {fmtClock(first)}</span>}</span>
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
            {navButton('summary', 'Summary', 'summary', nav.onSummary)}
            {navButton('settings', 'Settings', 'settings', () => nav.onSettings())}
            <button class="icon round hide-sm" aria-label="Reset day" title="Reset day" onClick={nav.onReset}><Icon name="reset" /></button>
            <button class="icon round hide-sm" aria-label={fullscreen ? 'Leave full screen' : 'Full screen'} title="Full screen" onClick={nav.onFullscreen}>
              <Icon name={fullscreen ? 'minimize' : 'maximize'} />
            </button>
            <button class="icon round hide-sm" aria-label="Close app" title="Close app" onClick={nav.onQuit}><Icon name="power" /></button>
            <button class="icon round show-sm" aria-label="More: reset day, full screen, close app" title="More" onClick={() => openMoreMenu(nav, fullscreen)}>
              <Icon name="more" />
            </button>
          </nav>
        </div>
      </header>
    </>
  );
}

/** Phone: Reset day, Full screen and Close app live in a ⋯ menu (a bottom sheet). */
function openMoreMenu({ onReset, onFullscreen, onQuit }: Nav, fullscreen: boolean) {
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

function useFullscreen() {
  const [on, setOn] = useState(Boolean(document.fullscreenElement));
  useEffect(() => {
    const fn = () => setOn(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', fn);
    return () => document.removeEventListener('fullscreenchange', fn);
  }, []);
  return on;
}

/**
 * Shown once the page has scrolled down by half a screen, or half the way down on a shorter page (on Main: the footer
 * is in view). On a touch screen the
 * buttons area can catch every swipe, so this is the way back up.
 */
export function ScrollTop() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    // Main scrolls only by the footer's height, so a short page needs half its scroll range instead.
    const fn = () => {
      const range = document.documentElement.scrollHeight - window.innerHeight;
      setShown(range > 0 && window.scrollY > Math.min(window.innerHeight, range) / 2);
    };
    fn();
    window.addEventListener('scroll', fn, { passive: true });
    window.addEventListener('resize', fn);
    return () => {
      window.removeEventListener('scroll', fn);
      window.removeEventListener('resize', fn);
    };
  }, []);
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <button
      class={`scroll-top${shown ? ' shown' : ''}`} aria-label="Back to top" title="Back to top" tabIndex={shown ? 0 : -1}
      aria-hidden={!shown} onClick={() => window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })}
    ><Icon name="arrowUp" /></button>
  );
}
