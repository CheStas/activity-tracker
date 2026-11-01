// Hash routes for the app's views: #/ (main), #/summary, #/settings, #/settings/<section>, #/day-editor.
// Pure: no DOM, so it is unit-tested; app.tsx owns the history handling.

export type View = 'main' | 'settings' | 'summary' | 'day-editor';
export interface Route {
  view: View;
  /** Settings only: the section to scroll to (a section id such as "backup"). */
  section?: string;
}

const VIEWS: View[] = ['main', 'settings', 'summary', 'day-editor'];

/** The route of a location hash; anything unknown is main. */
export function parseHash(hash: string): Route {
  const [view, section] = hash.replace(/^#\/?/, '').split('/');
  if (!VIEWS.includes(view as View) || view === 'main') return { view: 'main' };
  return view === 'settings' && section ? { view, section: decodeURIComponent(section) } : { view: view as View };
}

/** The location hash of a route; main is "#/". */
export function routeHash({ view, section }: Route): string {
  if (view === 'main') return '#/';
  return `#/${view}${view === 'settings' && section ? `/${encodeURIComponent(section)}` : ''}`;
}
