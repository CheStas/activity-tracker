import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  BUILTIN, PAPER, parseThemeFile, completeTheme, onAccentFor, lowContrastSlots, contrast, mix, resolveTheme,
  pickThemePatch, cssVars, themeFile, parseColor, TOKENS, deriveExtraSlots, upgradeTheme, deltaE,
} from '../src/theme.ts';
import { DEFAULT_SETTINGS } from '../src/seed.ts';

test('the 7 built-in themes are complete, in order, Paper first', () => {
  assert.deepEqual(BUILTIN.map((t) => t.id), ['paper', 'graphite', 'dune', 'tokyo-night', 'gruvbox-dark', 'nord', 'solarized-light']);
  for (const t of BUILTIN) {
    assert.ok(t.builtin);
    for (const k of TOKENS) assert.ok(parseColor(t.colors[k]), `${t.id}.${k}`);
    assert.equal(t.slots.length, 16, t.id);
  }
  assert.deepEqual(PAPER.slots, [
    '#2F5FCC', '#17804F', '#B5561A', '#8A47C4', '#C03636', '#1F7799', '#8C6A0A', '#4D4D49',
    '#B8336A', '#0F7A6E', '#4F7A12', '#7A4E2D', '#4338CA', '#6B6A1F', '#7D1F3A', '#5B6472',
  ]);
});

test('built-in slots 9–16 reach 4.5:1 against their theme\'s onAccent', () => {
  for (const t of BUILTIN) {
    t.slots.slice(8).forEach((s, i) => assert.ok(contrast(s, t.colors.onAccent) >= 4.5, `${t.id} slot ${i + 9} ${contrast(s, t.colors.onAccent).toFixed(2)}`));
  }
});

test('8-slot themes get slots 9–16 derived, readable on onAccent', () => {
  const eight = PAPER.slots.slice(0, 8);
  const t = completeTheme('X', PAPER.colors, eight);
  assert.equal(t.slots.length, 16);
  assert.deepEqual(t.slots.slice(0, 8), eight);
  const derived = deriveExtraSlots(eight);
  assert.equal(derived[1], mix(eight[1], eight[5], 0.5)); // teal = green + cyan
  assert.equal(derived[3], mix(eight[2], '#000000', 0.25)); // brown = orange darkened
  for (const s of t.slots.slice(8)) assert.ok(contrast(s, t.colors.onAccent) >= 4.5, s);
  // A stored 8-slot theme is upgraded the same way; a 16-slot one is left alone.
  assert.deepEqual(upgradeTheme({ ...PAPER, slots: eight }).slots, t.slots);
  assert.equal(upgradeTheme(PAPER), PAPER);
});

test('bright ANSI colors fill slots 9–16 only when they differ enough from the other slots', () => {
  assert.ok(deltaE('#FF0000', '#FF0000') === 0);
  assert.ok(deltaE('#FF0000', '#0000FF') > 15);
  const ansi = (bright: Record<string, string>) => `[colors.primary]\nbackground = "#000000"\nforeground = "#ffffff"\n
[colors.normal]\nblack = "#000000"\nred = "#cc3333"\ngreen = "#33aa33"\nyellow = "#ccaa33"\nblue = "#3366cc"\nmagenta = "#aa33aa"\ncyan = "#33aaaa"\nwhite = "#cccccc"\n
[colors.bright]\n${Object.entries(bright).map(([k, v]) => `${k} = "${v}"`).join('\n')}\n`;
  const distinct = parseThemeFile(ansi({ black: '#666666', red: '#ee7744', magenta: '#ff66cc' }), 'x.toml');
  assert.equal(distinct.slots[8], '#FF66CC'); // BrightMagenta -> pink
  const same = parseThemeFile(ansi({ black: '#666666', red: '#ee7744', magenta: '#ab34ab' }), 'x.toml');
  assert.notEqual(same.slots[8], '#AB34AB'); // too close to purple (slot 4): derived instead
});

test('built-in themes keep text readable', () => {
  for (const { id, colors: c } of BUILTIN) {
    for (const bg of [c.bg, c.surface]) {
      assert.ok(contrast(c.text, bg) >= 4.5, `${id} text`);
      assert.ok(contrast(c.muted, bg) >= 4.5, `${id} muted ${contrast(c.muted, bg).toFixed(2)}`);
    }
  }
});

test('missing tokens are derived from bg and text', () => {
  const t = completeTheme('X', { bg: '#000000', text: '#FFFFFF' }, []);
  assert.equal(t.kind, 'dark');
  assert.equal(t.colors.surface, mix('#000000', '#FFFFFF', 0.03));
  assert.equal(t.colors.chip, mix('#000000', '#FFFFFF', 0.07));
  assert.equal(t.colors.line, mix('#000000', '#FFFFFF', 0.12));
  assert.equal(t.colors.track, mix('#000000', '#FFFFFF', 0.08));
  assert.equal(t.colors.muted, mix('#000000', '#FFFFFF', 0.6)); // already 4.5:1
  assert.equal(t.slots.length, 16); // missing slots 1–8 come from Graphite, 9–16 are derived
  assert.equal(t.slots[0], BUILTIN.find((b) => b.id === 'graphite')!.slots[0]);
});

test('a low-contrast muted is raised to 4.5:1', () => {
  const t = completeTheme('X', { bg: '#FFFFFF', text: '#000000', muted: '#DDDDDD' }, []);
  assert.ok(contrast(t.colors.muted, '#FFFFFF') >= 4.5);
  assert.ok(contrast(t.colors.muted, t.colors.surface) >= 4.5);
});

test('onAccent is white or bg, whichever has the better worst-case contrast with the slots', () => {
  assert.equal(onAccentFor('#111214', ['#2F5FCC', '#17804F']), '#FFFFFF'); // dark slots
  assert.equal(onAccentFor('#111214', ['#82A8FF', '#F0C850']), '#111214'); // light slots
  const graphite = BUILTIN.find((b) => b.id === 'graphite')!;
  assert.equal(completeTheme('X', { bg: '#111214', text: '#EDEDEB' }, graphite.slots).colors.onAccent, '#111214');
  assert.equal(completeTheme('X', { bg: '#F5F5F2', text: '#1B1B1A' }, PAPER.slots).colors.onAccent, '#FFFFFF');
});

test('slots under 3:1 against bg are reported', () => {
  const t = completeTheme('X', { bg: '#FFFFFF', text: '#000000' }, ['#FFFF66', '#000080']);
  assert.deepEqual(lowContrastSlots(t).includes(0), true);
  assert.deepEqual(lowContrastSlots(t).includes(1), false);
  assert.deepEqual(lowContrastSlots(PAPER), []);
});

test('our own format round-trips through export and import', () => {
  const file = JSON.stringify(themeFile({ ...PAPER, name: 'Paper copy' }));
  const t = parseThemeFile(file, 'whatever.json');
  assert.deepEqual(t, { ...themeFile(PAPER), name: 'Paper copy' });
});

test('VS Code color theme (JSONC) maps editor and terminal colors', () => {
  const file = `{
    // a comment
    "name": "My Dark",
    "type": "dark",
    "colors": {
      "editor.background": "#1e1e1e",
      "editor.foreground": "#d4d4d4",
      "sideBar.background": "#252526",
      "panel.border": "#80808059", /* alpha: blended over bg */
      "descriptionForeground": "#ccccccb3",
      "terminal.ansiBlue": "#2472c8", "terminal.ansiGreen": "#0dbc79", "terminal.ansiBrightRed": "#f14c4c",
      "terminal.ansiMagenta": "#bc3fbc", "terminal.ansiRed": "#cd3131", "terminal.ansiCyan": "#11a8cd",
      "terminal.ansiYellow": "#e5e510", "terminal.ansiBrightBlack": "#666666",
    },
    "tokenColors": [],
  }`;
  const t = parseThemeFile(file, 'my-dark-color-theme.json');
  assert.equal(t.name, 'My Dark');
  assert.equal(t.kind, 'dark');
  assert.deepEqual([t.colors.bg, t.colors.text, t.colors.surface], ['#1E1E1E', '#D4D4D4', '#252526']);
  assert.equal(t.colors.line, mix('#1E1E1E', '#808080', 0x59 / 255));
  assert.deepEqual(t.slots.slice(0, 8), ['#2472C8', '#0DBC79', '#F14C4C', '#BC3FBC', '#CD3131', '#11A8CD', '#E5E510', '#666666']);
  assert.ok(contrast(t.colors.muted, t.colors.bg) >= 4.5);
});

test('base16 YAML and JSON map base00–base0F', () => {
  const yaml = `scheme: "Ocean"
author: "someone"
base00: "2b303b" # background
base01: "343d46"
base02: "4f5b66"
base03: "65737e"
base04: "a7adba"
base05: "c0c5ce"
base06: "dfe1e8"
base07: "eff1f5"
base08: "bf616a"
base09: "d08770"
base0A: "ebcb8b"
base0B: "a3be8c"
base0C: "96b5b4"
base0D: "8fa1b3"
base0E: "b48ead"
base0F: "ab7967"
`;
  const t = parseThemeFile(yaml, 'base16-ocean.yaml');
  assert.equal(t.name, 'Ocean');
  assert.deepEqual([t.colors.bg, t.colors.surface, t.colors.line, t.colors.text], ['#2B303B', '#343D46', '#4F5B66', '#C0C5CE']);
  assert.deepEqual(t.slots.slice(0, 8), ['#8FA1B3', '#A3BE8C', '#D08770', '#B48EAD', '#BF616A', '#96B5B4', '#EBCB8B', '#65737E']);

  // The newer format: a palette block with "#" values.
  const nested = `system: "base16"\nname: "Ocean 2"\npalette:\n  base00: "#2b303b"\n  base05: "#c0c5ce"\n  base0D: "#8fa1b3"\n`;
  const n = parseThemeFile(nested, 'x.yaml');
  assert.deepEqual([n.name, n.colors.bg, n.slots[0]], ['Ocean 2', '#2B303B', '#8FA1B3']);

  const json = JSON.stringify({ scheme: 'Ocean J', base00: '2b303b', base05: 'c0c5ce', base0B: 'a3be8c' });
  const j = parseThemeFile(json, 'x.json');
  assert.deepEqual([j.name, j.colors.bg, j.slots[1]], ['Ocean J', '#2B303B', '#A3BE8C']);
});

test('Alacritty TOML maps primary and ANSI colors like VS Code terminal colors', () => {
  const toml = `[colors.primary]
background = "#fdf6e3"
foreground = "#586e75"

[colors.normal]
black = "#073642"
red = "#dc322f"
green = "#859900"
yellow = "#b58900"
blue = "#268bd2"
magenta = "#d33682"
cyan = "#2aa198"
white = "#eee8d5"

[colors.bright]
black = "#002b36"
red = "#cb4b16"
`;
  const t = parseThemeFile(toml, 'solarized_light.toml');
  assert.equal(t.name, 'Solarized Light');
  assert.equal(t.kind, 'light');
  assert.deepEqual([t.colors.bg, t.colors.text], ['#FDF6E3', '#586E75']);
  assert.deepEqual(t.slots.slice(0, 8), ['#268BD2', '#859900', '#CB4B16', '#D33682', '#DC322F', '#2AA198', '#B58900', '#002B36']);
});

test('iTerm .itermcolors maps background, foreground and ANSI colors', () => {
  const color = (key: string, r: number, g: number, b: number) =>
    `<key>${key}</key><dict><key>Blue Component</key><real>${b}</real><key>Green Component</key><real>${g}</real><key>Red Component</key><real>${r}</real></dict>`;
  const plist = `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>
    ${color('Background Color', 0, 0, 0)}${color('Foreground Color', 1, 1, 1)}
    ${color('Ansi 4 Color', 0, 0, 1)}${color('Ansi 2 Color', 0, 1, 0)}${color('Ansi 1 Color', 1, 0, 0)}
  </dict></plist>`;
  const t = parseThemeFile(plist, 'Pure.itermcolors');
  assert.equal(t.name, 'Pure');
  assert.deepEqual([t.colors.bg, t.colors.text, t.kind], ['#000000', '#FFFFFF', 'dark']);
  assert.deepEqual([t.slots[0], t.slots[1], t.slots[4]], ['#0000FF', '#00FF00', '#FF0000']);
});

test('unknown files are refused', () => {
  assert.throws(() => parseThemeFile('{"hello": 1}', 'x.json'), /Unknown JSON theme/);
  assert.throws(() => parseThemeFile('just text', 'x.txt'), /Unknown theme file/);
});

test('resolving and picking follow the mode', () => {
  const fixed = { ...DEFAULT_SETTINGS, themeMode: 'fixed' as const, themeId: 'nord' };
  assert.equal(resolveTheme(fixed, BUILTIN, true).id, 'nord');
  const sys = { ...DEFAULT_SETTINGS, themeMode: 'system' as const, lightThemeId: 'dune', darkThemeId: 'tokyo-night' };
  assert.equal(resolveTheme(sys, BUILTIN, false).id, 'dune');
  assert.equal(resolveTheme(sys, BUILTIN, true).id, 'tokyo-night');
  assert.equal(resolveTheme({ ...sys, darkThemeId: 'gone' }, BUILTIN, true).id, 'graphite'); // deleted theme
  assert.deepEqual(pickThemePatch(fixed, 'dune', true), { themeId: 'dune' });
  assert.deepEqual(pickThemePatch(sys, 'nord', true), { darkThemeId: 'nord' });
  assert.deepEqual(pickThemePatch(sys, 'paper', false), { lightThemeId: 'paper' });
});

test('css variables cover every token and slot', () => {
  const v = cssVars(PAPER);
  assert.equal(v['--on-accent'], '#FFFFFF');
  assert.equal(v['--slot-8'], '#4D4D49');
  assert.equal(v['--slot-16'], '#5B6472');
  assert.equal(v['color-scheme'], 'light');
});
