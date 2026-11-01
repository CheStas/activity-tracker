import { describe, expect, it } from 'vitest';
import { parseHash, routeHash } from '../src/route.ts';

describe('parseHash', () => {
  it('reads every view', () => {
    expect(parseHash('#/summary')).toEqual({ view: 'summary' });
    expect(parseHash('#/settings')).toEqual({ view: 'settings' });
    expect(parseHash('#/day-editor')).toEqual({ view: 'day-editor' });
  });

  it('reads a settings section', () => {
    expect(parseHash('#/settings/backup')).toEqual({ view: 'settings', section: 'backup' });
  });

  it('falls back to main', () => {
    for (const h of ['', '#', '#/', '#/main', '#/nope']) expect(parseHash(h)).toEqual({ view: 'main' });
  });

  it('ignores a section outside settings', () => {
    expect(parseHash('#/summary/week')).toEqual({ view: 'summary' });
  });
});

describe('routeHash', () => {
  it('round-trips', () => {
    for (const h of ['#/', '#/summary', '#/settings', '#/settings/main-screen', '#/day-editor']) {
      expect(routeHash(parseHash(h))).toBe(h);
    }
  });

  it('drops a section outside settings', () => {
    expect(routeHash({ view: 'summary', section: 'x' })).toBe('#/summary');
  });
});
