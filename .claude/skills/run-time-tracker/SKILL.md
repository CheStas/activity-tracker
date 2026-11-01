---
name: run-time-tracker
description: Run, test, smoke-test, screenshot or demo the Time Tracker app (Preact + Vite, IndexedDB). Use to check a UI change in a real browser, drive the main screen, popups, Summary or Settings with sample data, take desktop/phone screenshots, run the unit tests, or regenerate docs/screenshots and the README demo animations.
---

# Run Time Tracker

A browser app (Preact + TypeScript + Vite, data in IndexedDB). Agents drive it with
`.claude/skills/run-time-tracker/driver.mjs`: headless Chrome through `playwright-core`. The driver starts Vite on
port 5199 when nothing serves it (and stops it at exit), seeds realistic data through the app's own Settings → Backup →
Import, and then walks the app. All paths below are relative to the project root.

## Prerequisites

- Node + `npm install` (brings `vite`, `vitest`, `playwright-core`).
- A Chrome to drive. The driver tries `CHROME_PATH`, then the installed **Google Chrome** (`channel: 'chrome'`), then
  Playwright's own Chromium (install it with `npx playwright-core install chromium` if neither exists).
- ImageMagick (`magick`) only for `docs` (the demo animations, PNG compression); without it the PNGs are still written.

## Check a change (agent path)

```sh
node .claude/skills/run-time-tracker/driver.mjs smoke     # or: npm run smoke
```
Desktop (1440×900) and phone (390×844): first run, seed, tap, long-press popup, profile switcher, reset confirm
(⋯ More on phone), Summary Day/Week/Month/Custom, Group by Focus, period picker, Settings → Categories, browser back,
the hash route, then the site pages (landing, privacy, terms), the landing's Open the app and Try the live demo
(`app/?demo`: the demo strip and a running session, then Start your own back in the untouched real profile). ~20 s. Prints
`OK: no page errors` or `FAIL: …` (exit 1). Screenshots: `.claude/skills/run-time-tracker/out/smoke/{desktop,phone}/`
(git-ignored). **Look at them** with the Read tool; a passing run can still look wrong.

To look at one specific thing, script steps (one argument each, run in order in one session):

```sh
node .claude/skills/run-time-tracker/driver.mjs do seed "goto summary" "click .period-kinds button:has-text('Week')" "click .group-by button:has-text('Company')" "text .fig-value" "ss check/week-company full"
node .claude/skills/run-time-tracker/driver.mjs do seed "layout Rows" "hold .act:has-text('Task')" "ss check/rows-popup"
node .claude/skills/run-time-tracker/driver.mjs do seed "theme Nord" "goto summary" "ss check/nord-summary"
node .claude/skills/run-time-tracker/driver.mjs do --phone "ss check/phone-first-run"
```

| Step | Does |
| --- | --- |
| `seed` | adds a "Home" profile, imports the sample (`src/sample.ts`, also the app's `?demo` data) into the open one (renamed "Work"): 7 activities (Break has a 1 h target) + 1 removed, dimensions Focus and Company, 3 weeks of weekdays, today ending now with a session running. Without it you get the first-run state ("New here?" strip, seed activities, nothing tracked). |
| `goto main\|summary\|settings[#id]` | in-app navigation; section ids: `profiles groups categories activities appearance theme colors main-screen day device backup about` |
| `click <sel>` / `hold <sel>` | tap (first match) / 800 ms long-press (opens the activity popup) |
| `press <key>` / `fill <sel>=<text>` | keyboard (Escape = back) / type into a field |
| `layout Tiles\|Rows\|Circles`, `theme <name>` | change the setting through Settings, back to main |
| `scroll <y>`, `wait <ms>` | instant scroll / pause |
| `ss <name> [full]` | screenshot to `out/<name>.png` (`full` = whole page) |
| `text <sel>`, `eval <js>` | print innerText / the JSON of a page expression |

Options: `--phone`, `--url <url>` (another server, e.g. `http://localhost:8765/app/`), `--out <dir>`.
Useful selectors: `.act` (main buttons, `.act.active` running), `.prof` (profile button), `button[aria-label="Summary"|"Settings"|"Reset day"|"Close app"]`,
`button[aria-label^="More"]` (phone), `.modal` / `.modal-confirm` (dialogs), `.period-kinds`, `.group-by`, `.period-label`, `.picker`,
`button.day-row`, `.share-row.option`, `.blocks.big .block`.

## Unit tests and types

```sh
npm test              # Vitest: tests/*.test.ts (stats, theme, backup, seed, timeline)
npm run build         # tsc + vite build
```
Pure logic has no DOM: `src/timeline.ts` (segments), `src/stats.ts` (Summary periods, day splitting at the reset hour,
totals), `src/theme.ts` (slots, import), `src/backup.ts`. Change those test-first; one file: `npx vitest run tests/stats.test.ts`.

## Regenerate docs/screenshots and the README animations

```sh
node .claude/skills/run-time-tracker/driver.mjs docs      # or: npm run screenshots
```
Rewrites `docs/screenshots/01-main-screen … 04-settings`, `phone/` and `demo-{main,summary,phone}.webp` and `public/og.png` (the link preview) (~45 s). Run
it in the evening or afternoon so "today" has ~6 h tracked. Early in a week or month Summary Week/Month step back to
the previous period, so they always show full data. `docs/screenshots/README.md` captions and the landing page
(`index.html`, which shows several of these files) are hand-written: update them if a screen changes meaning. Review an animation by extracting its frames and reading a few:

```sh
magick docs/screenshots/demo-main.webp -coalesce .claude/skills/run-time-tracker/out/frame-%02d.png
```

## Human path

`npm run dev` (hot reload, its own origin and data) or `scripts/start.sh` (built app on :8765 in a Chromium app
window, the real data). Both open a window; not useful headless.

## Gotchas

- **Don't reload after a change.** Writes are queued to IndexedDB asynchronously; `page.goto` right after a setting
  change can drop it (layout and theme silently reverted). The driver navigates in-app (Esc goes back to main).
- **Taps under a minute are merged.** Minimum switch defaults to 60 s: tapping Meeting then Task within a minute leaves
  no Meeting session (it goes to Task). To keep a short session, wait, or set Settings → Day → Minimum switch Off.
- **Long-press is pointer down ≥ 600 ms**; Playwright `click` is a tap. Use `hold`.
- **Every run is a fresh browser profile** = first run of the app (seed config, "New here?" strip, introDismissed false).
  `seed` replaces the open profile's data; import keeps the profile's old name, hence the rename to "Work".
- **Import shows an `alert('Import done.')`**; Playwright dismisses it on its own. All other confirms are in-page
  dialogs (`.modal`), not `window.confirm`.
- **Week starts Sunday in headless Chrome** (locale en-US, Settings → Day → Week starts on: System). Set Monday in
  Settings if a screenshot needs it.
- **The dev server has no favicon**; its 404 console error is ignored by the driver.
- **Animations:** screenshots during a smooth scroll tear
  (scroll with `behavior: 'instant'`). `magick montage` fails here (no fontconfig): use `-append` / `+append`.
- **"Today" is real time.** The sample's today ends at `now`; just after midnight it is short (it never crosses midnight).

## Troubleshooting

- A `layout`/`theme`/settings change has no effect in the next screenshot → something reloaded the page right after
  the change (see the first gotcha). Navigate with `goto`, never `page.goto`.
- `montage: unable to read font` (Fontconfig error) → use `magick a.png b.png -append out.png` instead of `montage`.
- An animation frame shows two halves of different scroll positions → it was captured mid smooth-scroll; scroll with
  `scroll <y>` (instant) before `ss`.
