#!/usr/bin/env node
// Drives the app in headless Chrome: starts Vite if nothing serves the URL, seeds sample data through the app's own
// import, then runs one of:
//   smoke             walk every screen and popup, screenshot each, exit 1 on page errors
//   do <step>...      run steps in one session (see STEPS below), e.g. do seed "goto summary" "ss summary full"
//   docs              regenerate docs/screenshots (PNGs, gallery shots and the demo GIFs; GIFs need ImageMagick)
// Options: --phone (390×844, default 1440×900), --url <url> (default http://localhost:5199/), --out <dir>.
// Screenshots land in .claude/skills/run-activity-tracker/out/ (git-ignored) unless --out is given.
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { sampleExport } from './sample-data.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const positional = args.filter((a, i) => !a.startsWith('--') && !['--url', '--out'].includes(args[i - 1]));
const [command = 'smoke', ...steps] = positional;
const URL_ = option('--url', 'http://localhost:5199/');
const OUT = option('--out', join(HERE, 'out'));
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

// ---------- server ----------

const up = async () => fetch(URL_).then((r) => r.ok, () => false);
let server = null;
async function ensureServer() {
  if (await up()) return;
  const port = new URL(URL_).port || '80';
  server = spawn(join(ROOT, 'node_modules/.bin/vite'), ['--port', port, '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    if (await up()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Vite did not start on ${URL_}`);
}
const stopServer = () => server && process.kill(-server.pid);

// ---------- browser ----------

/** CHROME_PATH, else the installed Google Chrome, else Playwright's own Chromium (`npx playwright-core install chromium`). */
async function launch() {
  const tries = [
    process.env.CHROME_PATH && { executablePath: process.env.CHROME_PATH },
    { channel: 'chrome' },
    {},
  ].filter(Boolean);
  let last;
  for (const t of tries) {
    try {
      return await chromium.launch(t);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

const errors = [];
async function newPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // The dev server has no favicon: that 404 is expected.
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(`console: ${m.text()}`));
  await page.goto(URL_);
  await page.waitForSelector('#view-main');
  return { ctx, page };
}

// ---------- steps ----------

const SAMPLE = join(tmpdir(), 'activity-tracker-sample.json');
const back = (page) => page.click('header button[aria-label="Back"]');

/** Seed through Settings: a second profile "Home", then import the sample into the open profile and name it "Work". */
async function seed(page) {
  writeFileSync(SAMPLE, JSON.stringify(sampleExport()));
  await page.click('button[aria-label="Settings"]');
  await page.fill('input[placeholder^="New profile name"]', 'Home');
  await page.click('button:has-text("Add profile")');
  await page.setInputFiles('#backup input[type=file]', SAMPLE);
  await page.click('.modal button:has-text("Import")'); // the confirm dialog; the "Import done." alert auto-dismisses
  await page.waitForTimeout(800);
  const name = page.locator('#profiles input[aria-label="Profile name"]').first();
  await name.fill('Work');
  await name.press('Tab');
  await back(page);
  await page.waitForSelector('#view-main');
}

/**
 * Open a view: main, summary, settings, or settings#<section id>. Navigates inside the app (Esc closes popups and
 * goes back to main): a reload right after a change can drop it, because writes reach IndexedDB asynchronously.
 */
async function goto(page, where) {
  for (let i = 0; i < 5 && !(await page.locator('#view-main').count()); i++) await page.keyboard.press('Escape');
  while (await page.locator('.modal').count()) await page.keyboard.press('Escape');
  await page.waitForSelector('#view-main');
  const [view, section] = where.split('#');
  if (view === 'summary') {
    await page.click('button[aria-label="Summary"]');
    await page.waitForSelector('.period-card, .summary .muted');
  } else if (view === 'settings') {
    await page.click('button[aria-label="Settings"]');
    if (section) await page.evaluate((id) => document.getElementById(id)?.scrollIntoView({ behavior: 'instant' }), section);
  }
}

/** Long-press (the activity popup needs 600 ms down). */
async function hold(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(40, box.height / 2));
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
}

/** Settings → Appearance → Main screen → Buttons: Tiles, Rows or Circles. */
async function setting(page, label) {
  await goto(page, 'settings#main-screen');
  await page.click(`#main-screen .seg:has-text("${label}")`);
  await goto(page, 'main');
}

const shotPath = (name) => {
  const file = join(OUT, `${name}.png`);
  mkdirSync(dirname(file), { recursive: true });
  return file;
};
async function ss(page, name, full = false) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: shotPath(name), fullPage: full });
  console.log(`screenshot ${shotPath(name)}`);
}

/**
 * STEPS for `do` (each one argument; quote it):
 *   seed | goto main|summary|settings[#section] | click <selector> | hold <selector> | press <key> | fill <selector>=<text>
 *   layout Tiles|Rows|Circles | theme <name> | scroll <y> | wait <ms> | ss <name> [full] | text <selector> | eval <js>
 */
async function step(page, line) {
  const [cmd, ...rest] = line.split(' ');
  const arg = rest.join(' ');
  switch (cmd) {
    case 'seed': return seed(page);
    case 'goto': return goto(page, arg);
    case 'click': return page.locator(arg).first().click();
    case 'hold': return hold(page, arg);
    case 'press': return page.keyboard.press(arg);
    case 'fill': {
      const [sel, ...text] = arg.split('=');
      return page.fill(sel, text.join('='));
    }
    case 'layout': return setting(page, arg);
    case 'theme': {
      await goto(page, 'settings#theme');
      await page.locator('.theme-card', { hasText: arg }).first().click();
      return goto(page, 'main');
    }
    case 'scroll': return page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Number(arg));
    case 'wait': return page.waitForTimeout(Number(arg));
    case 'ss': return ss(page, rest[0], rest[1] === 'full');
    case 'text': return console.log(await page.locator(arg).first().innerText());
    case 'eval': return console.log(JSON.stringify(await page.evaluate(arg)));
    default: throw new Error(`Unknown step "${line}"`);
  }
}

// ---------- smoke: every screen once ----------

async function smoke(browser, viewport, tag) {
  const { ctx, page } = await newPage(browser, viewport);
  await ss(page, `${tag}/00-first-run`);
  await seed(page);
  await ss(page, `${tag}/01-main`);
  await page.locator('.act', { hasText: 'Meeting' }).click();
  if (!(await page.locator('.act.active', { hasText: 'Meeting' }).count())) errors.push('tap did not start Meeting');
  await hold(page, '.act:has-text("Meeting")');
  await page.waitForSelector('.modal .popup');
  await ss(page, `${tag}/02-activity-popup`);
  await page.keyboard.press('Escape');
  await page.click('.prof');
  await page.waitForSelector('.profile-row');
  await ss(page, `${tag}/03-profiles`);
  await page.keyboard.press('Escape');
  if (viewport === PHONE) {
    await page.click('button[aria-label^="More"]');
    await ss(page, `${tag}/04-more-menu`);
    await page.click('.menu-item:has-text("Reset day")');
  } else await page.click('button[aria-label="Reset day"]');
  await ss(page, `${tag}/05-reset-confirm`);
  await page.click('.modal button:has-text("Cancel")');
  await goto(page, 'summary');
  for (const p of ['Day', 'Week', 'Month', 'Custom']) {
    await page.click(`.period-kinds button:has-text("${p}")`);
    await ss(page, `${tag}/06-summary-${p.toLowerCase()}`, true);
  }
  await page.click('.group-by button:has-text("Focus")');
  await ss(page, `${tag}/07-summary-by-focus`, true);
  await page.click('.group-by button:has-text("Activity")');
  await page.click('.period-label');
  await page.click('.pill:has-text("Last 30 days")');
  await ss(page, `${tag}/08-picker`);
  await page.click('.picker button:has-text("Apply")');
  await goto(page, 'settings#categories');
  await ss(page, `${tag}/09-settings-categories`);
  await ctx.close();
}

// ---------- docs: the repo's screenshot gallery and demo GIFs ----------

async function docs(browser) {
  const DOCS = join(ROOT, 'docs/screenshots');
  const FRAMES = join(tmpdir(), 'activity-tracker-frames');
  rmSync(FRAMES, { recursive: true, force: true });
  const count = {};
  const shot = async (page, name, full = false) => {
    await page.waitForTimeout(250);
    mkdirSync(dirname(join(DOCS, name)), { recursive: true });
    await page.screenshot({ path: join(DOCS, `${name}.png`), fullPage: full });
  };
  const grab = async (page, gif, hold = 1) => {
    mkdirSync(join(FRAMES, gif), { recursive: true });
    await page.waitForTimeout(200);
    for (let i = 0; i < hold; i++) {
      count[gif] = (count[gif] ?? 0) + 1;
      await page.screenshot({ path: join(FRAMES, gif, `${String(count[gif]).padStart(3, '0')}.png`) });
    }
  };
  const top = (page, y = 0) => page.evaluate((v) => window.scrollTo({ top: v, behavior: 'instant' }), y);

  // ----- desktop -----
  let { ctx, page } = await newPage(browser, DESKTOP);
  await seed(page);
  await goto(page, 'settings#categories');
  await shot(page, '04-settings/1-categories');
  await page.locator('.opt-color').first().click();
  await shot(page, '04-settings/2-option-color-16-slots');
  for (const [id, name] of [['activities', '3-activities-with-categories'], ['colors', '4-activity-colors-16-slots'], ['day', '5-day-week-start']]) {
    await page.evaluate((x) => document.getElementById(x).scrollIntoView({ behavior: 'instant' }), id);
    await shot(page, `04-settings/${name}`);
  }
  await goto(page, 'main');
  await shot(page, '01-main-screen/1-tiles');
  await grab(page, 'main', 4);
  await page.locator('.act', { hasText: 'Meeting' }).click();
  await grab(page, 'main', 4);
  await page.locator('.act', { hasText: 'Task' }).click();
  await grab(page, 'main', 3);
  await hold(page, '.act:has-text("Task")');
  await grab(page, 'main', 5);
  await shot(page, '02-popups/1-activity-long-press');
  await page.click('.tp-ago .pill:has-text("15m ago")');
  await grab(page, 'main', 4);
  await page.keyboard.press('Escape');
  await grab(page, 'main', 3);
  await page.click('.prof');
  await page.waitForSelector('.profile-row');
  await page.waitForTimeout(300);
  await grab(page, 'main', 5);
  await shot(page, '02-popups/2-switch-profile');
  await page.keyboard.press('Escape');
  await grab(page, 'main', 2);
  await hold(page, '.act:has-text("Task")');
  await page.locator('.sessions.boxed .ghost.danger').first().click();
  await shot(page, '02-popups/3-delete-session');
  await page.click('.modal-confirm button:has-text("Cancel")');
  await page.keyboard.press('Escape');
  for (const [label, name] of [['Reset day', '4-reset-day'], ['Close app', '5-close-app']]) {
    await page.click(`button[aria-label="${label}"]`);
    await shot(page, `02-popups/${name}`);
    await page.click('.modal-confirm button:has-text("Cancel")');
  }
  await setting(page, 'Rows');
  await shot(page, '01-main-screen/2-rows');
  await setting(page, 'Circles');
  await shot(page, '01-main-screen/3-circles');
  await setting(page, 'Tiles');

  await goto(page, 'summary');
  await page.click('.period-kinds button:has-text("Day")');
  await grab(page, 'summary', 5);
  await shot(page, '03-summary/1-day', true);
  await page.locator('.blocks.big .block:not(.idle)').nth(3).click();
  await grab(page, 'summary', 3);
  await page.click('.period-kinds button:has-text("Week")');
  await grab(page, 'summary', 5);
  await shot(page, '03-summary/2-week', true);
  await page.click('.group-by button:has-text("Focus")');
  await grab(page, 'summary', 4);
  await page.locator('button.day-row').nth(2).click();
  await grab(page, 'summary', 4);
  await page.locator('.share-row.option').first().click();
  await top(page, 700);
  await grab(page, 'summary', 5);
  await shot(page, '03-summary/3-week-grouped-by-focus', true);
  await top(page);
  await page.click('.group-by button:has-text("Activity")');
  await page.click('.period-kinds button:has-text("Month")');
  await grab(page, 'summary', 5);
  await shot(page, '03-summary/4-month', true);
  await page.click('.period-label');
  await grab(page, 'summary', 3);
  await page.click('.pill:has-text("Last 30 days")');
  await grab(page, 'summary', 4);
  await shot(page, '03-summary/5-period-picker');
  await page.click('.picker button:has-text("Apply")');
  await grab(page, 'summary', 4);
  for (let i = 0; i < 3; i++) await page.click('button[aria-label="Previous period"]');
  await shot(page, '03-summary/6-empty-period');

  await step(page, 'theme Graphite');
  await shot(page, '01-main-screen/4-graphite-theme');
  await page.click('button[aria-label="Reset day"]');
  await page.click('.modal-confirm button:has-text("Reset day")');
  await page.waitForTimeout(500);
  await shot(page, '01-main-screen/5-empty-day');
  await ctx.close();

  // ----- phone -----
  ({ ctx, page } = await newPage(browser, PHONE));
  await seed(page);
  await shot(page, 'phone/1-main-tiles');
  await grab(page, 'phone', 4);
  await page.locator('.act', { hasText: 'Meeting' }).click();
  await grab(page, 'phone', 3);
  await hold(page, '.act:has-text("Meeting")');
  await grab(page, 'phone', 5);
  await shot(page, 'phone/2-activity-sheet');
  await page.keyboard.press('Escape');
  await page.click('button[aria-label^="More"]');
  await grab(page, 'phone', 4);
  await shot(page, 'phone/3-more-menu');
  await page.keyboard.press('Escape');
  await goto(page, 'summary');
  await page.click('.period-kinds button:has-text("Day")');
  await grab(page, 'phone', 5);
  await shot(page, 'phone/4-summary-day', true);
  await page.click('.period-kinds button:has-text("Week")');
  await grab(page, 'phone', 4);
  await top(page, 500);
  await grab(page, 'phone', 4);
  await shot(page, 'phone/5-summary-week', true);
  await goto(page, 'settings#categories');
  await shot(page, 'phone/6-settings-categories');
  await ctx.close();

  // ----- GIFs and PNG size (ImageMagick) -----
  try {
    execFileSync('magick', ['-version'], { stdio: 'ignore' });
  } catch {
    console.warn('ImageMagick (magick) not found: PNGs written, GIFs and PNG compression skipped');
    return;
  }
  // No dithering: it speckles the flat backgrounds. OptimizePlus merges identical frames into longer ones.
  for (const [gif, width] of [['main', 960], ['summary', 960], ['phone', 300]]) {
    const frames = readdirSync(join(FRAMES, gif)).sort().map((f) => join(FRAMES, gif, f));
    execFileSync('magick', ['-delay', '45', '-loop', '0', ...frames, '-resize', `${width}x`, '+dither', '-colors', '255', '-layers', 'OptimizePlus', join(DOCS, `demo-${gif}.gif`)]);
  }
  const pngs = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? pngs(join(dir, e.name)) : e.name.endsWith('.png') ? [join(dir, e.name)] : []));
  for (const f of pngs(DOCS)) execFileSync('magick', [f, '-strip', '+dither', '-colors', '256', `PNG8:${f}`]);
  console.log(`docs/screenshots regenerated (${pngs(DOCS).length} PNGs, 3 GIFs)`);
}

// ---------- main ----------

try {
  await ensureServer();
  const browser = await launch();
  console.log(`${URL_} · Chrome ${browser.version()}${server ? ' · started Vite (stops at exit)' : ''}`);
  try {
    if (command === 'smoke') {
      rmSync(join(OUT, 'smoke'), { recursive: true, force: true });
      await smoke(browser, DESKTOP, 'smoke/desktop');
      await smoke(browser, PHONE, 'smoke/phone');
    } else if (command === 'do') {
      const { page } = await newPage(browser, flag('--phone') ? PHONE : DESKTOP);
      for (const s of steps) {
        console.log(`> ${s}`);
        await step(page, s);
      }
    } else if (command === 'docs') {
      if (!existsSync(join(ROOT, 'docs'))) throw new Error('run from the project');
      await docs(browser);
    } else throw new Error(`Unknown command "${command}" (smoke | do <step>... | docs)`);
  } finally {
    await browser.close();
  }
  if (errors.length) {
    console.error(`FAIL: ${errors.length} page error(s)\n${errors.join('\n')}`);
    process.exitCode = 1;
  } else console.log('OK: no page errors');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  stopServer();
}
