// Themes: color tokens + 16 activity color slots, the built-in set, resolving a profile's theme, and importing theme
// files from other apps. Pure: no DOM, no storage.
import type { Settings } from './types.ts';

export const TOKENS = ['bg', 'surface', 'chip', 'line', 'track', 'text', 'muted', 'onAccent'] as const;
export type Token = (typeof TOKENS)[number];
export type ThemeColors = Record<Token, string>;
export const SLOT_COUNT = 16;
/** Slots 1–8 as themes had them before 16 slots; files with only these get 9–16 derived. */
export const BASE_SLOTS = 8;
/** Slot meanings, fixed so imported palettes line up. */
export const SLOT_NAMES = [
  'blue', 'green', 'orange', 'purple', 'red', 'cyan', 'yellow', 'neutral',
  'pink', 'teal', 'lime', 'brown', 'indigo', 'olive', 'wine', 'slate',
];

/** The theme file format (also what Export writes). */
export interface ThemeFile {
  name: string;
  kind: 'light' | 'dark';
  colors: ThemeColors;
  slots: string[];
}
/** An installed theme: built-in (config/themes/<id>.json) or imported (stored in IndexedDB). */
export interface Theme extends ThemeFile {
  id: string;
  builtin?: boolean;
}

const files = import.meta.glob<ThemeFile & { order?: number }>('../config/themes/*.json', { eager: true, import: 'default' });
export const BUILTIN: Theme[] = Object.entries(files)
  .map(([path, t]) => ({ ...t, id: path.replace(/^.*\/|\.json$/g, ''), builtin: true }))
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
  .map(({ order: _, ...t }) => t);

export const DEFAULT_LIGHT = 'paper';
export const DEFAULT_DARK = 'graphite';
const builtin = (id: string) => BUILTIN.find((t) => t.id === id)!;
export const PAPER = builtin(DEFAULT_LIGHT);

// ---------- colors ----------

type RGBA = [number, number, number, number];

/** "#rgb", "#rrggbb", "#rrggbbaa" (with or without "#", or "0x") -> [r, g, b, a 0..1]; null if not a hex color. */
export function parseColor(input: unknown): RGBA | null {
  if (typeof input !== 'string') return null;
  let h = input.trim().replace(/^(#|0x)/i, '');
  if (!/^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(h)) return null;
  if (h.length <= 4) h = [...h].map((c) => c + c).join('');
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
}

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
export const toHex = ([r, g, b]: number[]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();
const rgb = (hex: string) => parseColor(hex) ?? [0, 0, 0, 1];

/** `a` mixed toward `b` by t (0..1). */
export function mix(a: string, b: string, t: number) {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t));
}

/** WCAG relative luminance. */
export function luminance(hex: string) {
  const [r, g, b] = rgb(hex).slice(0, 3).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Nearest slot (RGB distance, ties to the lower slot) of a hex color; used for colors from before slots (slots 1–8). */
export function nearestSlot(color: string, slots = PAPER.slots.slice(0, BASE_SLOTS)) {
  const c = rgb(color);
  let best = 0;
  let bestD = Infinity;
  slots.forEach((s, i) => {
    const v = rgb(s);
    const d = (c[0] - v[0]) ** 2 + (c[1] - v[1]) ** 2 + (c[2] - v[2]) ** 2;
    if (d < bestD) [best, bestD] = [i, d];
  });
  return best;
}

/** CIE L*a*b* of a hex color (D65), for the ΔE distance. */
function lab(hex: string) {
  const [r, g, b] = rgb(hex).slice(0, 3).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIE76 color difference; about 2 is barely visible, 15 is clearly a different color. */
export function deltaE(a: string, b: string) {
  const [x, y] = [lab(a), lab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** The color with its HSL hue turned by `deg` (saturation and lightness kept). */
function rotateHue(hex: string, deg: number) {
  const [r, g, b] = rgb(hex).slice(0, 3).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return toHex([r * 255, g * 255, b * 255]);
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (((h * 60 + deg) % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [p, q, t] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(p + m) * 255, (q + m) * 255, (t + m) * 255]);
}

/**
 * Slots 9–16 (pink, teal, lime, brown, indigo, olive, wine, slate) derived from slots 1–8 (blue, green, orange,
 * purple, red, cyan, yellow, neutral).
 */
export function deriveExtraSlots([blue, green, orange, purple, red, cyan, yellow, neutral]: string[]) {
  return [
    rotateHue(red, -28), // pink: red turned toward magenta
    mix(green, cyan, 0.5), // teal
    mix(green, yellow, 0.5), // lime
    mix(orange, '#000000', 0.25), // brown: orange darkened
    mix(blue, purple, 0.5), // indigo
    mix(yellow, neutral, 0.3), // olive: yellow toward neutral
    mix(mix(red, purple, 0.5), '#000000', 0.2), // wine
    mix(neutral, blue, 0.15), // slate
  ];
}

/** The color moved in lightness (toward black or white, hue kept) until it reaches `ratio` against `against`. */
export function withContrast(color: string, against: string, ratio = 4.5) {
  const toward = luminance(against) > 0.5 ? '#000000' : '#FFFFFF';
  let c = color;
  for (let t = 0.05; contrast(c, against) < ratio && t <= 1; t += 0.05) c = mix(color, toward, t);
  return c;
}

// ---------- completing a theme ----------

/** White or the background, whichever has the better worst-case contrast against the slots. */
export function onAccentFor(bg: string, slots: string[]) {
  const worst = (c: string) => Math.min(...slots.map((s) => contrast(c, s)));
  return worst('#FFFFFF') >= worst(bg) ? '#FFFFFF' : toHex(rgb(bg));
}

/** `muted` raised toward `text` until it reaches 4.5:1 on bg and surface. */
function readableMuted(muted: string, { bg, surface, text }: Pick<ThemeColors, 'bg' | 'surface' | 'text'>) {
  let m = muted;
  for (let t = 0.1; Math.min(contrast(m, bg), contrast(m, surface)) < 4.5 && t <= 1; t += 0.1) m = mix(muted, text, t);
  return m;
}

/** Slots under 3:1 against the background (0-based), for the import warning. */
export const lowContrastSlots = (t: ThemeFile) => t.slots.flatMap((s, i) => (contrast(s, t.colors.bg) < 3 ? [i] : []));

/**
 * A complete theme from whatever a file gave: missing tokens are derived from bg and text, missing slots 1–8 come from
 * Paper or Graphite, muted is kept readable and onAccent is chosen for slots 1–8. Slots 9–16 come from `slots` (or
 * `candidates`: per slot a list of colors to try, taken when one differs from every other slot by ΔE 15 or more),
 * otherwise they are derived from 1–8; they are then kept at 4.5:1 against onAccent.
 */
export function completeTheme(
  name: string, given: Partial<Record<Token, string | undefined>>, slots: (string | undefined)[], kind?: string,
  candidates: (string | undefined)[][] = [],
): ThemeFile {
  const solid = (c: string | undefined, over?: string) => {
    const v = parseColor(c);
    if (!v) return undefined;
    return over && v[3] < 1 ? mix(over, toHex(v), v[3]) : toHex(v);
  };
  const bg = solid(given.bg) ?? '#FFFFFF';
  const dark = kind === 'dark' || kind === 'light' ? kind === 'dark' : luminance(bg) < 0.2;
  const text = solid(given.text, bg) ?? (dark ? '#EDEDEB' : '#1B1B1A');
  const fallback = builtin(dark ? DEFAULT_DARK : DEFAULT_LIGHT);
  const surface = solid(given.surface, bg) ?? mix(bg, text, 0.03);
  const base = Array.from({ length: BASE_SLOTS }, (_, i) => solid(slots[i], bg) ?? fallback.slots[i]);
  const derived = deriveExtraSlots(base);
  const extra: string[] = [];
  for (let i = 0; i < SLOT_COUNT - BASE_SLOTS; i++) {
    const own = solid(slots[BASE_SLOTS + i], bg);
    const picked = own ?? (candidates[i] ?? []).map((c) => solid(c, bg)).find((c) => c && [...base, ...extra].every((s) => deltaE(c, s) >= 15));
    extra.push(picked ?? derived[i]);
  }
  const colors: ThemeColors = {
    bg, text, surface,
    chip: solid(given.chip, bg) ?? mix(bg, text, 0.07),
    line: solid(given.line, bg) ?? mix(bg, text, 0.12),
    track: solid(given.track, bg) ?? mix(bg, text, 0.08),
    muted: readableMuted(solid(given.muted, bg) ?? mix(bg, text, 0.6), { bg, surface, text }),
    onAccent: solid(given.onAccent, bg) ?? onAccentFor(bg, base),
  };
  const fullSlots = [...base, ...extra.map((c, i) => (solid(slots[BASE_SLOTS + i], bg) ? c : withContrast(c, colors.onAccent)))];
  return { name: name.trim() || 'Imported theme', kind: dark ? 'dark' : 'light', colors, slots: fullSlots };
}

// ---------- importing ----------

/** JSON with // and /* comments and trailing commas (VS Code themes are JSONC). */
function parseJsonc(text: string): unknown {
  const noComments = text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, str) => str ?? '');
  return JSON.parse(noComments.replace(/,(\s*[}\]])/g, '$1'));
}

const baseName = (filename: string) => filename.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
const titleCase = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Terminal palette (16 ANSI colors, 0 = black … 7 = white, 8–15 bright) -> our slot order. */
const ANSI_SLOTS = [4, 2, 9, 5, 1, 6, 3, 8];
/**
 * Bright ANSI colors tried for slots 9–16: BrightMagenta -> pink, BrightCyan -> teal, BrightGreen -> lime, (brown),
 * BrightBlue -> indigo, BrightYellow -> olive, (wine), BrightBlack / BrightWhite -> slate.
 */
const ANSI_EXTRA = [[13], [14], [10], [], [12], [11], [], [8, 15]];
const ansiCandidates = (ansi: (string | undefined)[]) => ANSI_EXTRA.map((list) => list.map((i) => ansi[i]));

function fromAnsi(name: string, bg: string | undefined, fg: string | undefined, ansi: (string | undefined)[]) {
  return completeTheme(name, { bg, text: fg }, ANSI_SLOTS.map((i) => ansi[i]), undefined, ansiCandidates(ansi));
}

function fromVsCode(name: string, file: { name?: string; type?: string; colors: Record<string, string> }) {
  const c = file.colors;
  const t = (k: string) => c[`terminal.ansi${k}`];
  return completeTheme(
    file.name ?? name,
    {
      bg: c['editor.background'], surface: c['sideBar.background'], line: c['editorGroup.border'] ?? c['panel.border'],
      text: c['editor.foreground'], muted: c['descriptionForeground'],
    },
    [t('Blue'), t('Green'), t('BrightRed'), t('Magenta'), t('Red'), t('Cyan'), t('Yellow'), t('BrightBlack')],
    file.type === 'hc' ? undefined : file.type,
    [[t('BrightMagenta')], [t('BrightCyan')], [t('BrightGreen')], [], [t('BrightBlue')], [t('BrightYellow')], [], [t('BrightBlack'), t('BrightWhite')]],
  );
}

function fromBase16(name: string, b: Record<string, string>) {
  return completeTheme(
    b.scheme ?? b.name ?? name,
    { bg: b.base00, surface: b.base01, line: b.base02, text: b.base05, muted: b.base04 },
    [b.base0D, b.base0B, b.base09, b.base0E, b.base08, b.base0C, b.base0A, b.base03],
    b.variant,
  );
}

/** Flat `key: value` YAML (base16 schemes); nested `palette:` blocks are flattened. */
function parseFlatYaml(text: string) {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([\w-]+)\s*:\s*(?:"([^"]*)"|'([^']*)'|([^#\s][^#]*?))\s*(?:#.*)?$/);
    const value = m && (m[2] ?? m[3] ?? m[4]);
    if (value) out[m[1]] = value;
  }
  return out;
}

/** The parts of an Alacritty TOML file we need: `[colors.primary]`, `[colors.normal]`, `[colors.bright]`. */
function fromAlacritty(name: string, text: string) {
  const sections: Record<string, Record<string, string>> = {};
  let section = '';
  for (const line of text.split('\n')) {
    const header = line.match(/^\s*\[([^\]]+)\]/);
    if (header) section = header[1].trim();
    const kv = line.match(/^\s*([\w-]+)\s*=\s*["']([^"']+)["']/);
    if (kv) (sections[section] ??= {})[kv[1]] = kv[2];
  }
  const order = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
  const normal = sections['colors.normal'] ?? {};
  const bright = sections['colors.bright'] ?? {};
  const primary = sections['colors.primary'] ?? {};
  return fromAnsi(name, primary.background, primary.foreground, [...order.map((k) => normal[k]), ...order.map((k) => bright[k])]);
}

/** iTerm2 .itermcolors (an XML plist of color dicts with 0..1 components). */
function fromITerm(name: string, text: string) {
  const colors: Record<string, string> = {};
  for (const m of text.matchAll(/<key>([^<]+)<\/key>\s*<dict>([\s\S]*?)<\/dict>/g)) {
    const comp = (c: string) => Number(m[2].match(new RegExp(`<key>${c} Component</key>\\s*<real>([^<]+)</real>`))?.[1] ?? 0) * 255;
    colors[m[1]] = toHex([comp('Red'), comp('Green'), comp('Blue')]);
  }
  const ansi = Array.from({ length: 16 }, (_, i) => colors[`Ansi ${i} Color`]);
  return fromAnsi(name, colors['Background Color'], colors['Foreground Color'], ansi);
}

/** Read a theme file of any supported format. Throws when it is none of them. */
export function parseThemeFile(text: string, filename = 'theme'): ThemeFile {
  const name = titleCase(baseName(filename));
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    if (/Ansi \d+ Color/.test(trimmed)) return fromITerm(name, trimmed);
    throw new Error('Unknown XML file (expected an iTerm .itermcolors file)');
  }
  if (trimmed.startsWith('{')) {
    const data = parseJsonc(trimmed) as Record<string, unknown>;
    const colors = data.colors as Record<string, string> | undefined;
    if (colors && Array.isArray(data.slots)) {
      return completeTheme(String(data.name ?? name), colors, data.slots as string[], data.kind as string);
    }
    if (colors && typeof colors === 'object' && ('editor.background' in colors || 'editor.foreground' in colors)) {
      return fromVsCode(name, data as { colors: Record<string, string> });
    }
    const base16 = (data.palette as Record<string, string>) ?? data;
    if (typeof base16.base00 === 'string') return fromBase16(String(data.scheme ?? data.name ?? name), base16);
    throw new Error('Unknown JSON theme (expected our theme file, a VS Code color theme or base16)');
  }
  if (/^\s*\[colors\./m.test(trimmed)) return fromAlacritty(name, trimmed);
  const yaml = parseFlatYaml(trimmed);
  if (yaml.base00) return fromBase16(name, yaml);
  throw new Error('Unknown theme file (supported: our theme .json, VS Code .json, base16 .yaml/.json, Alacritty .toml, iTerm .itermcolors)');
}

/** A stored or embedded theme with fewer than 16 slots (from before they existed) gets the rest derived. */
export const upgradeTheme = <T extends ThemeFile>(t: T): T =>
  t.slots.length >= SLOT_COUNT ? t : { ...t, ...completeTheme(t.name, t.colors, t.slots, t.kind) };

/** A theme as a file to export: the format above, without the install id. */
export const themeFile = ({ name, kind, colors, slots }: ThemeFile): ThemeFile => ({ name, kind, colors, slots });

// ---------- applying ----------

type ThemeSettings = Pick<Settings, 'themeMode' | 'themeId' | 'lightThemeId' | 'darkThemeId'>;

export const findTheme = (themes: Theme[], id: string, dark: boolean) =>
  themes.find((t) => t.id === id) ?? builtin(dark ? DEFAULT_DARK : DEFAULT_LIGHT);

/** The theme a profile shows; `systemDark` is the current prefers-color-scheme. */
export function resolveTheme(s: ThemeSettings, themes: Theme[], systemDark: boolean) {
  if (s.themeMode === 'fixed') return findTheme(themes, s.themeId, false);
  return systemDark ? findTheme(themes, s.darkThemeId, true) : findTheme(themes, s.lightThemeId, false);
}

/** The settings change for picking a theme: the fixed theme, or the theme of the mode the system is in now. */
export function pickThemePatch(s: ThemeSettings, id: string, systemDark: boolean): Partial<ThemeSettings> {
  if (s.themeMode === 'fixed') return { themeId: id };
  return systemDark ? { darkThemeId: id } : { lightThemeId: id };
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** CSS custom properties of a theme: --bg … --on-accent, --slot-1 … --slot-16, plus color-scheme. */
export function cssVars(t: ThemeFile): Record<string, string> {
  const vars: Record<string, string> = { 'color-scheme': t.kind };
  for (const k of TOKENS) vars[`--${kebab(k)}`] = t.colors[k];
  t.slots.forEach((c, i) => (vars[`--slot-${i + 1}`] = c));
  return vars;
}

/** The CSS value of an activity's color: its slot, so it follows the theme. */
export const slotColor = (slot: number) => `var(--slot-${(slot % SLOT_COUNT) + 1})`;
