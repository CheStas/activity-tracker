// The "about" links (footer, welcome strip, Settings → About), the quick theme and main screen switches and the
// privacy note. The link targets are placeholders until those pages exist.
import type { ComponentChildren } from 'preact';
import { state, pickTheme, systemDark, setSetting } from '../state.ts';
import { resolveTheme, type Theme } from '../theme.ts';
import type { Layout, Settings } from '../types.ts';
import { Icon, type IconName } from './icons.tsx';
import { messageDialog } from './hooks.tsx';

export const VERSION = `v${__APP_VERSION__}`;

const LINKS = [
  { id: 'what', label: 'What is it?' },
  { id: 'compare', label: 'Similar apps' },
  { id: 'feedback', label: 'Send feedback' },
];

const openPlaceholder = (link: (typeof LINKS)[number]) => messageDialog(link.label, 'This page is coming in a later version.');

/** The three links as buttons; `variant` picks the look of the place they are in. */
export function AboutLinks({ variant }: { variant: 'strip' | 'footer' | 'settings' }) {
  return (
    <>
      {LINKS.map((l) => (
        <button key={l.id} class={`lnk lnk-${variant}`} onClick={() => openPlaceholder(l)}>
          {variant === 'footer' && l.id === 'feedback' && <Icon name="feedback" />}
          {l.label}
        </button>
      ))}
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
        Privacy first: all your data stays in this browser. No account and no internet connection needed. You are
        responsible for your data, so export a backup regularly.
      </strong>
      {children}
    </p>
  );
}
