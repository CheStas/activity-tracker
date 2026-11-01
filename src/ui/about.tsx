// The "about" links (footer, welcome strip, Settings → About), the quick theme and main screen switches, the privacy
// note and the usage stats switch. "What is it?" and "Similar apps" open the site's pages (placeholders in the
// single-file build); "Send feedback" opens the feedback form.
import type { ComponentChildren } from 'preact';
import { state, pickTheme, systemDark, setSetting } from '../state.ts';
import { resolveTheme, type Theme } from '../theme.ts';
import type { Layout, Settings } from '../types.ts';
import { Icon, type IconName } from './icons.tsx';
import { messageDialog } from './hooks.tsx';
import { openFeedback } from './feedback.tsx';
import { browserOptsOut, setStatsOn, statsAvailable, statsChoice, statsOn } from '../analytics.ts';
import { useState } from 'preact/hooks';

export const VERSION = `v${__APP_VERSION__}`;

// The site pages sit next to the app (app/ → ../). The single-file build has no site around it.
const SITE = import.meta.env.MODE === 'single' ? null : '../';

const LINKS: { id: string; label: string; href?: string }[] = [
  { id: 'what', label: 'What is it?', href: SITE ?? undefined },
  { id: 'compare', label: 'Similar apps', href: SITE ? `${SITE}similar/` : undefined },
  { id: 'feedback', label: 'Send feedback' },
];

const openLink = (link: (typeof LINKS)[number]) => link.id === 'feedback'
  ? openFeedback(VERSION)
  : messageDialog(link.label, 'This page is on the website, which this offline file does not include.');

/** The three links (a page link, or a button for a placeholder); `variant` picks the look of the place they are in. */
export function AboutLinks({ variant }: { variant: 'strip' | 'footer' | 'settings' }) {
  return (
    <>
      {LINKS.map((l) => {
        const content = (
          <>
            {variant === 'footer' && l.id === 'feedback' && <Icon name="feedback" />}
            {l.label}
          </>
        );
        return l.href
          ? <a key={l.id} class={`lnk lnk-${variant}`} href={l.href}>{content}</a>
          : <button key={l.id} class={`lnk lnk-${variant}`} onClick={() => openLink(l)}>{content}</button>;
      })}
    </>
  );
}

/** The theme the open profile shows right now. */
export const currentTheme = () => resolveTheme(state.profile.settings, state.themes, systemDark());

/** One round swatch per installed theme (background + two activity colors); a tap applies it. */
export function ThemeSwatches({ compact }: { compact?: boolean }) {
  const current = currentTheme();
  return (
    <div class={`swatches${compact ? ' compact' : ''}`} role="group" aria-label="Theme">
      {state.themes.map((t: Theme) => (
        <button
          key={t.id} class={`sw${t.id === current.id ? ' on' : ''}`} aria-label={t.name} title={t.name}
          aria-pressed={t.id === current.id} onClick={() => pickTheme(t.id)}
        >
          <span><i style={{ background: t.colors.bg }} /><i style={{ background: t.slots[1] }} /><i style={{ background: t.slots[0] }} /></span>
        </button>
      ))}
    </div>
  );
}

const LAYOUTS: { id: Layout; label: string }[] = [{ id: 'tiles', label: 'Tiles' }, { id: 'rows', label: 'Rows' }, { id: 'circles', label: 'Circles' }];
export const layoutName = (id: Layout) => LAYOUTS.find((l) => l.id === id)?.label ?? id;

/** Tiles / Rows / Circles (Settings → Main screen and the footer). */
export function LayoutSwitch() {
  const layout = state.profile.settings.layout;
  return (
    <div class="segmented" role="group" aria-label="Button layout">
      {LAYOUTS.map((l) => (
        <button key={l.id} class="seg" aria-label={l.label} title={l.label} aria-pressed={layout === l.id} onClick={() => setSetting('layout', l.id)}>
          <span class={`layout-icon ${l.id}`} aria-hidden="true"><i /><i /></span><span class="seg-label">{l.label}</span>
        </button>
      ))}
    </div>
  );
}

/** The main screen toggles; the ones with an icon also sit in the footer as icon toggles. */
export const MAIN_TOGGLES: { key: keyof Settings; label: string; hint: string; icon?: IconName }[] = [
  { key: 'popularity', label: 'Size buttons by today’s usage', hint: 'Tiles grow wider, rows taller, circles larger as you use them', icon: 'sizeByUsage' },
  { key: 'unusedStrip', label: 'Move unused activities to a strip', hint: 'Activities with no time today become small chips under the buttons', icon: 'unusedStrip' },
  { key: 'showTimeline', label: 'Show today’s timeline', hint: 'The colored session bar at the bottom of the main screen' },
  { key: 'showGroups', label: 'Show group totals', hint: 'Time per group and idle time, on one line under the timeline' },
  { key: 'showFooter', label: 'Show the footer', hint: 'Links and the quick settings at the very bottom' },
];

/** Footer: the layout switch and the icon toggles. */
export function MainScreenSwitch() {
  const s = state.profile.settings;
  return (
    <div class="quick-row">
      <LayoutSwitch />
      {MAIN_TOGGLES.filter((t) => t.icon).map((t) => (
        <button
          key={t.key} class="icon round toggle" aria-label={t.label} title={t.label} aria-pressed={Boolean(s[t.key])}
          onClick={() => setSetting(t.key, !s[t.key] as never)}
        ><Icon name={t.icon!} /></button>
      ))}
    </div>
  );
}

/** Footer and Settings → Backup: the data lives only here, so back it up. */
export function PrivacyNote({ children }: { children?: ComponentChildren }) {
  return (
    <p class="note">
      <strong>
        Privacy first: everything you track stays in this browser. No account and no internet connection needed. You are
        responsible for your data, so export a backup regularly.
      </strong>
      {children}
    </p>
  );
}

/** Settings → About: anonymous usage stats, on unless the visitor (or their browser's Do Not Track) said no. */
export function UsageStats() {
  const [on, setOn] = useState(statsOn);
  if (!statsAvailable()) return <p class="muted small">This copy (the demo, the offline file or a local build) sends no usage stats.</p>;
  const change = (v: boolean) => {
    setStatsOn(v);
    setOn(v);
  };
  return (
    <>
      <div class="toggles">
        <label class="toggle">
          <input type="checkbox" checked={on} onChange={(e) => change(e.currentTarget.checked)} />
          <span class="toggle-text">
            <span>Share anonymous usage stats</span>
            <span class="muted small">Which screens and features get used, never what you track. No cookies, no account, nothing personal.</span>
          </span>
        </label>
      </div>
      <p class="muted small">
        {!statsChoice() && browserOptsOut() && 'Your browser asks sites not to track, so this is off until you turn it on. '}
        It is your choice, and you can turn it off. Please consider leaving it on: Activity Tracker is free, and these
        counts are the only way to know anyone uses it. If nobody does, it gets no more updates and will be retired.{' '}
        <a href="../privacy/">What is collected</a>
      </p>
    </>
  );
}
