// Line icons (24×24, stroked with currentColor) so the header buttons share one look.
import type { ComponentChildren } from 'preact';

const PATHS = {
  summary: '<path d="M4 20h16"/><path d="M7 16v-5"/><path d="M12 16V6"/><path d="M17 16v-8"/>',
  settings: '<path d="M4 7h9"/><path d="M19 7h1"/><path d="M4 17h3"/><path d="M13 17h7"/><circle cx="16" cy="7" r="2.5"/><circle cx="10" cy="17" r="2.5"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
  maximize: '<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>',
  minimize: '<path d="M9 4v5H4"/><path d="M15 4v5h5"/><path d="M9 20v-5H4"/><path d="M15 20v-5h5"/>',
  power: '<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>',
  back: '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>',
  prev: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  feedback: '<path d="M4 5h16v11H9l-5 4z"/>',
  upload: '<path d="M12 15V4"/><path d="M7 9l5-5 5 5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
};

export type IconName = keyof typeof PATHS;

export const Icon = ({ name }: { name: IconName }) => (
  <svg
    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" dangerouslySetInnerHTML={{ __html: PATHS[name] }}
  />
);

/** Header bar of a sub-screen: back button, title, and optional controls on the right. */
export const BackBar = ({ title, sub, onBack, children }: { title: string; sub?: string; onBack: () => void; children?: ComponentChildren }) => (
  <header class="bar">
    <button class="icon round" aria-label="Back" onClick={onBack}><Icon name="back" /></button>
    <h1>{title}{sub && <span class="muted"> · {sub}</span>}</h1>
    {children}
  </header>
);
