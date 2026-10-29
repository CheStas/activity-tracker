// The "about" links (footer, welcome strip, Settings → About) and the quick theme switch. The link targets are
// placeholders until those pages exist.
import { state, pickTheme, systemDark } from '../state.ts';
import { resolveTheme, type Theme } from '../theme.ts';
import { Icon } from './icons.tsx';
import { openModal } from './hooks.tsx';

export const VERSION = `v${__APP_VERSION__}`;

const LINKS = [
  {
    id: 'what', label: 'What is it?',
    text: 'A chess clock for your work day: one big button per activity. Tap one to start it, tap another to switch, tap the running one to stop. Your data stays in this browser.',
  },
  { id: 'compare', label: 'Similar apps', text: 'A comparison with similar time trackers is coming here soon.' },
  { id: 'feedback', label: 'Send feedback', text: 'A feedback form is coming here soon.' },
];

function openPlaceholder(link: (typeof LINKS)[number]) {
  openModal(() => (
    <div class="popup">
      <h2>{link.label}</h2>
      <p>{link.text}</p>
    </div>
  ));
}

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
