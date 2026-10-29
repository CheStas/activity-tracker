# Activity Tracker — Specification

The source requirements are in [`../custom-pomodoro-tracking.md`](../custom-pomodoro-tracking.md). This document is the
authoritative spec: it covers those requirements plus every decision made since. Update it whenever a requirement changes.

## 1. Purpose
A full-screen web app for a Linux PC/laptop with a touchscreen. It works like a **chess clock** for the work day:
- one large button per activity
- tapping a button makes that activity active and stops the previous one
- at most **one** activity is active at a time
- tapping the **active** button again stops everything (idle)

## 2. Platform decisions
| Topic | Decision |
|---|---|
| Stack | Preact + TypeScript, built with Vite (`npm run build` → `dist/`). Pure timeline logic lives in `src/timeline.ts` (no DOM, no storage), tested with Vitest. Development: `npm run dev` (Vite dev server, a different origin, so its data is separate). |
| Storage | IndexedDB in the browser profile; `navigator.storage.persist()` requested |
| Serving | `python3 -m http.server 8765 --bind 127.0.0.1 --directory dist` (localhost is a secure context, needed for Wake Lock). The origin `http://localhost:8765` is unchanged, so data from earlier versions is kept. |
| Main run | `scripts/start.sh`: rebuilds `dist/` when sources are newer (needs `npm`; with no `npm` it serves the existing build), then opens Chromium with a dedicated profile. Modes: **app window** (default; title bar, resizable, closable), `--kiosk` (locked full screen), `--browser` (normal window with tabs). All modes share the same data. The script and its server exit when the window closes. |
| Static hosting | The built `dist/` folder works from any static web server, including a subpath, because Vite builds with relative paths (`base: './'`). Data is per browser, per device, per site address (IndexedDB); there is no sync. Use **HTTPS** for screen keep-awake and persistent storage. Plain HTTP works too: IDs fall back to `crypto.getRandomValues` because `crypto.randomUUID` needs a secure context. Safari may evict data after about 7 days without visits unless the site is added to the home screen. |
| Plain HTML (optional) | `npm run build:single` builds `dist-single/activity-tracker.html` (all JS and CSS inlined via `vite-plugin-singlefile`), a single file to open by double-click (browsers block module files on `file://`). No screen keep-awake. **Its data is separate** from the localhost version (a different origin); move data between them with export/import. Rebuild after code changes. |
| Device | Linux PC/laptop touchscreen; the layout is responsive, with large touch targets |
| Backup | JSON export/import in settings, **one profile per file** (§12); optional automatic JSON download when a day closes |
| Seed data | `config/seed.json`, bundled at build time (§14) |

## 3. Activities (buttons)
- Activities belong to a **profile** (§12) and optionally to one **group** (§13).
- The first-run activities, groups and profiles come from the seed config file `config/seed.json` (§14), not from
  the code.
- The list is configured in Settings. You can add one or more names at once (comma- or newline-separated), rename
  and reorder activities, and set an optional daily target in minutes.
- **Color = a theme slot.** An activity stores a slot number `colorSlot` (0–7), not a color; the theme (§16) gives
  each slot its color, so switching the theme recolors everything. The slot is chosen in Settings → Appearance →
  Activity colors; the Activities list shows the swatch read-only and links there. New activities get slots in the
  seed `palette` order (§14).
- **Names are unique** within a profile, compared trimmed and case-insensitive ("Task" = " task "). Adding or renaming
  to a name that a live or removed activity already has is refused with a message (a removed one can be restored or
  deleted instead). Existing duplicates from earlier versions are left as they are.
- **Removing** an activity is a soft delete (`archived: true`). Its data is **never** deleted:
  - past days and summaries still show its time, with the label "(removed)"
  - a "Removed activities" section in Settings lets you restore it, or **delete** it from that list
- **Deleting** a removed activity (`deleted: true`) takes it off the "Removed activities" list for good: no restore
  button. The record is kept, so its tracked time still shows in the summary. Adding an activity with the same name
  later brings that record back as a fresh button (no group, no target, at the end of the list, color slot kept), so the
  old history and the new time are one activity: summary and history show no difference.
- **Hide for today:** a per-activity toggle in Settings.
  - It can only be used when the activity has **no time recorded in the current day** and is not active.
  - It stores `hiddenForDayId = <current day id>`. The button reappears automatically on the next day (after a manual
    reset or the automatic rollover).
- When a day closes, each activity's name and color slot are copied into the day's snapshot, so a later rename,
  recolor or removal does not change history (the slot still follows the theme). Snapshots from before slots keep
  their stored hex colors untouched.
- **Upgrade:** an activity from before slots gets the nearest **Paper** slot to its old `color` (RGB distance, ties
  to the lower slot).

## 4. Time model
Time is stored as **segments**: `{id, dayId, activityId, start, end|null}`. Timestamps are epoch milliseconds.
- At most one segment is open (`end === null`), and it is the active activity.
- All numbers are **derived** from the segments; no counters are stored.
- Adjacent segments of the same activity are merged (`a.end === b.start`).

### 4.1 The `assign(activityId | null, from, to | null)` primitive
1. Every existing segment that overlaps `[from, to)` is trimmed, split or deleted. When `to = null`, the range runs to
   "now and onward", so the open segment and everything after `from` are affected.
2. If `activityId` is not null, a new segment `[from, to)` is inserted. With `to = null`, the new segment is open and
   therefore active.

| Action | Call |
|---|---|
| Tap a button | `assign(X, now, null)` |
| Tap the active button (stop all) | `assign(null, now, null)` |
| "X is actually active since 14:30" | `assign(X, 14:30, null)` |
| "Stop all since 14:40" | `assign(null, 14:40, null)` |
| Edit a session | remove the old range, then assign the new range |
| Add a range in the day editor | `assign(X, from, to)` |
| Rebuild the day from scratch | clear the day's segments, then assign the ranges again |

**Example from the requirements.** It is 14:53 and activity1 has been active since 14:10. The user marks activity2 as
active since 14:30. The result is activity1 from 14:10 to 14:30 (20 min) and activity2 from 14:30 to now (23 min,
running).

`from` is clamped to `[day start, now]`, and `to` to `[from, now]`.

### 4.2 Short switches are ignored
A tap ends the current run (an activity or idle). When that run is shorter than the **minimum switch** setting
(default **60 s**, configurable in Settings, "Off" disables it), the run does not count as its own entry:
- a short **activity** run goes to the **next** activity (the one just tapped starts at the short run's start);
  when the tap stops everything, it goes to the **previous** activity if that one ended exactly where the short run
  started, otherwise it is dropped (start and stop within a minute);
- a short **idle** gap goes to the next activity (it starts where the previous activity ended).

Example: task since 09:00, meeting tapped at 10:00:00 by mistake, task tapped again at 10:00:20 → one task session
from 09:00, no meeting entry. Backdating from the popup and the day editor is not affected.

## 5. Day
- A day starts with the first app start, or when the previous day ends.
- **Manual reset** (button on the main screen): stops the active segment at now, closes the day (archive and snapshot),
  and starts a new day.
- **Automatic rollover:** at the configured reset hour (default **00:00** local time). The open segment is closed at the
  boundary; nothing carries over into the new day. The new day starts at the boundary.
- When the app is opened after one or more missed boundaries, the day is closed at the first missed boundary.

## 6. Main screen
The main screen fills exactly one viewport (`height: 100vh`, min 640 px) and never scrolls inside itself (only when
the buttons cannot fit at all does the buttons area scroll, rather than clip). The footer sits below it and is reached
by scrolling the page. All numbers use tabular figures so they do not jitter while ticking. All colors come from the
theme (§16). Top to bottom:
1. **Welcome strip** (new users only, see §6.1).
2. **Header** (surface color, bottom border):
   - **Profile button**: the profile's initial in a square, its name and a chevron; opens the profile picker (§12).
     Shown only with more than one profile.
   - "Today · Wed, Oct 28" (uppercase, muted), the day total `h:mm:ss` in mono, then "since 10:03" (start of the day's
     first activity) muted; nothing before the first activity.
   - "Now": a color dot, the active activity's name and its current run (`m:ss` under an hour, `h:mm:ss` after).
     While idle: a neutral dot and "Idle", no duration (one timer only: a separate "since switch" timer would always
     show the same value).
   - Right: "Clock" + `HH:MM`, then round 44 px icon buttons on the `chip` background: Summary, Settings, Reset day,
     Full screen toggle (the icon reflects the state), Close app.
3. **Buttons area** (`flex: 1`) in one of three layouts (Settings → Main screen → Buttons):
   - **Tiles** (default): side-by-side columns that wrap on narrow screens. Each tile: color square, name and share
     of today in %; then, while active, a "Running m:ss" chip with a pulsing dot; the total in large mono; a progress
     bar toward the target when one is set ("8m left of 2h 00m target" / "5m over target"), otherwise the share of
     today ("31% of today").
   - **Rows**: a centered column, max 860 px: dot, name, target delta ("x left" / "x over"), running chip, total.
   - **Circles**: wrapped and centered: name, total, run, target delta.
   - The active button is filled with its slot color, text in the theme's `onAccent`; inactive buttons use the
     surface color with a 1 px border.
   - **Size by usage** (toggle, **off** by default): relative to the most-used activity today, tiles get flex-grow
     1–3×, rows 1–2.2× the height, circles 1–1.6× the diameter.
   - **Empty day** (nothing tracked yet today): the hint "Ready to start the day · Tap an activity to start tracking ·
     hold one to set an earlier start" above the buttons.
4. **Unused strip** (toggle, **off** by default): "Not used today" and a chip (color dot + name, min height 44 px) per
   activity without time today; they work like the buttons (tap starts it and it moves into the buttons area,
   long-press). Profiles saved before this setting existed (and backup files without it) get it **on exactly when
   size by usage was on**. The same line ends with the right-aligned hint "Tap to switch · tap the running one to
   stop · hold for sessions".
5. **Timeline** (toggle, **on** by default; shown once something is tracked today): hour labels above (the first
   activity's start at the left edge, then each full hour, thinned out when narrow), a 36 px bar of rounded blocks
   with 3 px gaps, one per session plus the running one; untracked gaps between activities are `track`-colored idle
   blocks. Blocks of 35 min or more show their duration inside; every block has a tooltip "Task · 1h 15m". It grows
   live while an activity runs.
6. **Group totals** (toggle, **on** by default; shown once something is tracked today): "productive 6h 51m ·
   non-productive 1h 52m · idle 0m", centered, muted labels and values in the text color. One entry per group with
   time today (by the activity's current group), then "no group" if any, then idle. A profile without groups shows
   "tracked … · idle …".
7. **More hint**: a small chevron at the bottom edge that scrolls to the footer. Hidden with the footer.
- **Tap:** switch activity, or stop if the button is already active.
- **Long-press (600 ms):** opens the activity popup (§7).

### 6.1 Footer and welcome strip
- **Footer** (below the fold, toggle *Show the footer*, **on** by default): three columns that wrap on narrow screens:
  1. "Activity Tracker", "A chess clock for your work day. Your data stays in this browser.", the version.
  2. Links: What is it?, Similar apps, Send feedback. Until those pages exist they open a placeholder popup.
  3. **Theme quick switch**: one round swatch per installed theme (its background and two activity colors), the
     current one ringed, "Theme · <name>" and a "More in Settings" link (opens Settings → Appearance). A tap applies the
     theme to the open profile immediately, the same as picking it in Settings (§16).
- **Welcome strip** (top, above the header) while the profile's `introDismissed` is false: "New here?", the first-run
  hint, the same three links, compact theme swatches and a **Got it** button that sets `introDismissed = true` for
  good. While it shows, the footer and the more hint are hidden (the links are at the top instead); afterwards the
  links are in the footer and in Settings → About.
- **Who is new:** only the profile opened on a first run (an empty database) starts with `introDismissed = false`.
  Other seeded profiles, profiles added later, imports and upgrades from earlier versions start with `true`.
- **Kiosk:** in `--kiosk` mode the page still scrolls by touch; *Show the footer* off hides the footer and the more
  hint completely.

### 6.2 Navigation, full screen, closing
- **Esc = back**, following a fixed hierarchy with no loops: open popup → closes it; Day editor → where it was opened
  from (Settings, Summary, or Main via the activity popup); Settings and Summary → Main. On Main, Esc does nothing.
- **Full screen is optional.** The ⛶ button toggles document full screen. The "Start in full screen" setting enters it
  on the first tap, because browsers require a user gesture. While in full screen, Esc is captured (Keyboard Lock) so
  it keeps meaning "back"; **hold Esc** (about 2 s) to leave full screen.
- **⏻ Close app:** asks for confirmation, then closes the window, which also stops `start.sh` and its server. A
  running activity keeps counting while the app is closed (time is derived from the start timestamp). When the
  browser refuses to let the page close the window (a normal tab or a `file://` page), a hint says to use
  Alt+F4 / Ctrl+W.

## 7. Activity popup (long-press)
- Lists today's sessions for the activity (start–end and duration), each with edit and delete actions.
- **Active since…:** a touch time picker with quick offsets (−5/−10/−15/−30 min, ±1/±5/±15 adjustments, now). It calls
  `assign(X, t, null)`.
- **Stop all since…:** calls `assign(null, t, null)`.
- **Edit sessions…:** closes the popup and opens the day editor (§8) on today.

## 8. Settings
A two-column page: a section list on the left (stacked above the content on narrow screens) and the content on the
right, max 1240 px wide. Header: a round back button and "Settings · <profile>". The page uses the open profile's
theme, so theme changes preview live. All controls are native (`button`, `input type=checkbox` inside a `label`), at
least 44 px tall, with a visible focus ring.
- **Section list:** Profiles, Groups, Activities, Appearance, Day, Device, Backup, About. A tap scrolls to the section;
  the section in view is highlighted.
- **Every setting belongs to the open profile** (§12), appearance included; imported themes are shared (§16).
- **Profiles:** open (switch to), rename, add, delete (§12)
- **Groups:** add, rename, on/off, reorder, delete (§13)
- **Activities:** add, rename (names unique, §3), group, daily target, reorder, hide for today, remove (soft),
  restore removed, delete removed from the list. The color swatch is read-only and links to Activity colors.
- **Appearance:**
  - **Theme:** Fixed / Follow system, a grid of theme cards (a mini preview of background, surface, a filled tile and
    the 8 slots; name; light/dark), the selected card ringed, and an *Import theme* card last. Imported themes can be
    renamed, exported and deleted (§16).
  - **Activity colors:** one row per activity (live and removed-but-listed): its name in its current color and the 8
    slot swatches (44 px targets); a tap sets the slot.
  - **Main screen:** Buttons Tiles / Rows / Circles (segmented, with small layout icons), and toggles, each with a
    one-line hint: Size buttons by today's usage; Move unused activities to a strip; Show today's timeline; Show group
    totals; Show the footer (§6).
- **Day:** automatic reset hour (0–23); minimum switch Off / 15 s / 30 s / 1 min (default) / 2 min / 3 min / 5 min
  (§4.2); auto-export a JSON file when a day closes; Edit timeline…
- **Device:** start in full screen; keep the screen on (**on** by default; §10)
- **Backup:** export the open profile to JSON, import JSON into the open profile (replaces that profile's data and
  settings, after a confirmation; other profiles are untouched)
- **About:** What is it?, Similar apps, Send feedback (same targets as the footer), the version.
- Link to the **day editor** (also reachable from the activity popup, §7, and from each summary day, §9): a timeline of one day's segments,
  editing and deleting segments, adding a range (activity + from + to/now), and clearing the whole day. Its bar runs
  from the first activity's start to the last activity's end (or now while one is running); idle rows appear only for
  gaps between activities.
  - It opens on today (from the summary: on that day); ‹ › in its header step through the profile's earlier days (any closed day can be edited).
  - A closed day is edited within its own start and end: no "now", no running session, and the "x min ago" shortcuts
    are hidden. Its snapshot total is updated, so the summary shows the edited day. Clearing a closed day keeps it
    (empty) so it can be rebuilt; the summary skips empty days.
  - Leaving the editor always returns it to today. The summary has no edit controls of its own, only the link.

## 9. Summary
For the current day and every archived day **of the open profile**:
- total tracked time, the start of the first activity and the end of the last one (or "now" while running), and
  idle time (untracked gaps between the first start and the last end; time before the first or after the last
  activity is never idle)
- per activity: total, percentage, and target delta
- per group (when the profile has groups): total of its activities, plus "no group"
- a horizontal timeline bar over the same range, one colored block per session with its duration inside ("1h 05m",
  "12m"; hidden when the block is too narrow; the day editor's bar shows the same), and the session list with idle rows for the gaps between activities
- an **Edit sessions…** button next to the session list's toggle opens the day editor on that day; back returns to
  the summary, which reloads

## 10. Keeping the screen awake
- Settings → **Keep the screen on** (default on). While it is on and the page is visible, the app holds a screen Wake
  Lock (`navigator.wakeLock.request('screen')`), requested again on `visibilitychange`; turning it off releases it.
- Chromium turns the Wake Lock into a desktop idle inhibitor (D-Bus screensaver/session inhibit on GNOME and KDE,
  X11 and Wayland), so `scripts/start.sh` no longer changes system settings (`xset`, `gsettings`, `systemd-inhibit`):
  the in-app setting alone decides, in every mode.
- The Wake Lock needs a secure context (localhost or HTTPS); the plain HTML file and plain-HTTP hosting cannot keep
  the screen on. Settings says so when it is not available.

## 12. Profiles
A profile is a separate workspace, like a separate copy of the app: its own activities, groups, days, segments,
summary, backup file and **all settings** (theme mode and themes, button layout, size by usage, unused strip,
timeline, group totals, footer, welcome strip dismissed, full screen, keep the screen on, reset hour, minimum switch,
auto-export). Imported themes are shared by all profiles (§16).
- **Exactly one profile is open** at a time. The open profile is remembered across restarts.
- **Switching** (header Profiles button, or Settings → Profiles → Open) loads the other profile. Nothing is stopped:
  a running activity in the profile you leave keeps counting, exactly as when the app is closed, and that profile's
  day rolls over (§5) when it is opened again. The profile picker warns when an activity is running in the open
  profile.
- **Add:** creates a profile with no activities, groups or days, and a **copy of the open profile's settings**
  (appearance included, welcome strip dismissed); change them afterwards in that profile.
- **Rename:** any profile.
- **Delete:** only a profile that is not open; after a confirmation it permanently deletes that profile's
  activities, groups, days and segments. The last profile cannot be deleted.
- **Upgrade from a version without profiles:** all existing activities and days move into a profile named
  "Default", which also takes over the old settings.
- **Export/import is per profile.** Export writes the open profile (name, settings, groups, activities, days,
  segments) to `activity-tracker-<profile>-<date>.json`; when the profile uses imported themes, they are embedded
  (`themes`) and installed on import. Import replaces the open profile's data and settings with the
  file's (its name is kept) and never touches other profiles. All ids are renewed on import, so a file exported from
  one profile can be imported into another, or into a copy of the app elsewhere, without clashes. Exports from the
  version without profiles import the same way. Older files import with defaults for newer settings (their `theme`
  and activity colors are mapped as on upgrade, §16).

## 13. Groups
Groups are a soft way to separate activities inside one profile, for people who don't want to switch profiles
(for example "Work" and "Home" in one profile).
- A group has a name, an order and an **on** flag. An activity is in at most one group or in none.
- Groups appear **only in Settings and the Summary**; the main screen shows no group controls.
- **On/off** is switched in Settings → Groups and **stays** until it is changed (no daily reset).
- **Not strict:** any number of groups can be on at the same time, and a group can be turned on at any moment, so one
  day can use activities from several groups. Activities without a group are always shown.
- When a group is off its activities are hidden from the main screen, except the **active** activity, which stays
  visible until it is stopped. Their time is kept and still shows in the summary.
- The day editor's "Add range" offers all activities that are not removed, whatever their group.
- **Delete group:** its activities move to "no group"; nothing else changes.

## 14. Seed config
`config/seed.json` holds every default that used to be in the code. It is imported at build time (so it also works
in the single-file build); `scripts/start.sh` rebuilds when it changes. It is applied **only on first run** (an empty
database); after that everything is edited in Settings.
- `palette`: the order in which new activities get color slots, as slot numbers 1–8 or hex colors (a hex color
  means its nearest Paper slot)
- `settings`: the settings of every seeded profile (`themeMode`, `themeId`, `lightThemeId`, `darkThemeId`, `layout`,
  `popularity`, `unusedStrip`, `showTimeline`, `showGroups`, `showFooter`, `startFullscreen`, `keepAwake`,
  `resetHour`, `minSwitchSec`, `autoExport`); a profile may override some with its own `settings`
- `profiles`: the profiles to create, the first one is opened (and shows the welcome strip). Each has a `name`,
  optional `settings`, optional `groups` (`name`, `on` (default true), `activities`) and optional ungrouped
  `activities`. An activity is a name, or an object `{ "name", "slot"?, "color"?, "targetMin"? }`: `slot` is 1–8;
  `color` (hex) is still accepted and mapped to the nearest Paper slot.
- `config/themes/*.json`: the built-in themes (§16), bundled at build time the same way.

## 15. Non-goals (for now)
- multi-device sync
- server-side storage

## 16. Themes
A theme is one JSON object of color tokens plus 8 activity color slots. It is applied as CSS custom properties on
`:root` (`--bg`, `--surface`, `--chip`, `--line`, `--track`, `--text`, `--muted`, `--on-accent`, `--slot-1` …
`--slot-8`); no component hard-codes a color.

| Token | Used for | Paper |
|---|---|---|
| `bg` | page background | `#F5F5F2` |
| `surface` | header, footer, inactive buttons, cards | `#FFFFFF` |
| `chip` | icon buttons, segmented controls, welcome strip | `#EFEFEB` |
| `line` | borders, dividers | `#E3E3DE` |
| `track` | empty part of progress bars, timeline idle | `#ECECE7` |
| `text` | primary text | `#1B1B1A` |
| `muted` | labels, hints (at least 4.5:1 on `bg` and `surface`) | `#62625D` |
| `onAccent` | text and icons on an active button or a timeline block | `#FFFFFF` |
| `slots[0..7]` | activity colors | `#2F5FCC #17804F #B5561A #8A47C4 #C03636 #1F7799 #8C6A0A #4D4D49` |

The slot order is fixed by meaning so imported palettes line up: 1 blue, 2 green, 3 orange, 4 purple, 5 red, 6 cyan,
7 yellow, 8 neutral. Slot 1 doubles as the accent (primary buttons, checkboxes, focus ring), slot 5 as danger.

**File format** (also what Export writes):
```json
{
  "name": "Paper",
  "kind": "light",
  "colors": { "bg": "#F5F5F2", "surface": "#FFFFFF", "chip": "#EFEFEB", "line": "#E3E3DE",
              "track": "#ECECE7", "text": "#1B1B1A", "muted": "#62625D", "onAccent": "#FFFFFF" },
  "slots": ["#2F5FCC", "#17804F", "#B5561A", "#8A47C4", "#C03636", "#1F7799", "#8C6A0A", "#4D4D49"]
}
```
- **Built-in themes** (`config/themes/*.json`, id = file name, listed by their optional `order`): Paper (light,
  default), Graphite (dark), Dune (light), Tokyo Night, Gruvbox Dark, Nord (dark), Solarized Light. They cannot be
  deleted.
- **Mode** (per profile): *Fixed* (`themeMode: "fixed"`, `themeId`) or *Follow system* (`themeMode: "system"`,
  `lightThemeId` / `darkThemeId`, switched live by `prefers-color-scheme`). Picking a theme (Settings card or footer
  swatch) under Follow system sets the theme of the mode the system is in now. Defaults: Follow system, Paper +
  Graphite; fixed theme Paper. A missing theme id falls back to Paper (light) / Graphite (dark).
- **Upgrade** from the old setting: `theme` System → Follow system with Paper + Graphite; Light → Fixed Paper; Dark →
  Fixed Graphite.
- **No flash on load:** the resolved theme's CSS variables (both themes under Follow system) are mirrored to
  `localStorage` and applied by an inline script in `index.html` before first paint.
- **Import** (Settings → Appearance → Import theme):
  - own format, as above;
  - VS Code color theme `.json` (comments and trailing commas allowed): `editor.background` → bg,
    `sideBar.background` → surface, `editorGroup.border` or `panel.border` → line, `editor.foreground` → text,
    `descriptionForeground` → muted; slots from `terminal.ansiBlue`, `ansiGreen`, `ansiBrightRed` (orange),
    `ansiMagenta`, `ansiRed`, `ansiCyan`, `ansiYellow`, `ansiBrightBlack`; `type` gives light/dark;
  - base16 `.yaml` / `.json`: base00 bg, base01 surface, base02 line, base05 text, base04 muted; slots base0D, base0B,
    base09, base0E, base08, base0C, base0A, base03;
  - Alacritty `.toml` and iTerm `.itermcolors`: primary background/foreground and the 16 ANSI colors, mapped like the
    VS Code terminal colors.
  - Colors with alpha are blended over the background. Missing tokens are derived: surface, chip, line, track = `bg`
    mixed toward `text` by 3 %, 7 %, 12 %, 8 %; muted = a 60 % mix, raised until it reaches 4.5:1 on `bg` and
    `surface` (an imported muted below 4.5:1 is raised the same way). Missing slots come from Paper (light) or
    Graphite (dark). `kind` comes from the file, else from the background's luminance.
  - `onAccent` = white or `bg`, whichever has the better worst-case contrast against the 8 slots.
  - After import a warning lists every slot under 3:1 against `bg`; the theme still installs and is applied.
  - Imported themes are stored per app (IndexedDB store `themes`, shared by all profiles) and can be renamed,
    exported and deleted. Deleting one that profiles use makes them fall back as above.
