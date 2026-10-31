// The "about" links (footer, welcome strip, Settings → About) and the quick theme switch. The link targets are
// placeholders until those pages exist.
import { state, pickTheme, systemDark } from '../state.ts';
import { resolveTheme, type Theme } from '../theme.ts';
import { Icon } from './icons.tsx';
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
