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
- The list is configured in Settings. You can add one or more names at once (comma- or newline-separated), rename, recolor
  and reorder activities, and set an optional daily target in minutes.
- **Removing** an activity is a soft delete (`archived: true`). Its data is **never** deleted:
  - past days and summaries still show its time, with the label "(removed)"
  - a "Removed activities" section in Settings lets you restore it
- **Hide for today:** a per-activity toggle in Settings.
  - It can only be used when the activity has **no time recorded in the current day** and is not active.
  - It stores `hiddenForDayId = <current day id>`. The button reappears automatically on the next day (after a manual
    reset or the automatic rollover).
- When a day closes, each activity's name and color are copied into the day's snapshot, so a later rename or removal
  does not change history.

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

## 6. Main screen (kept minimal)
- **Header:**
  - "Today · Thu, Oct 22": the label and the current date on one line, in the same style. With more than one
    profile the label starts with the open profile's name ("Work · Thu, Oct 22")
  - the day total, then the start time of the day's **first activity** in smaller text ("since 08:12"); nothing
    before the first activity
  - the active activity with its current run, and the time since the last switch. While idle it shows just "Idle":
    no idle duration and no "since switch"
  - the clock
  - icon buttons in one matching style (line icons in a shared rounded group): Profiles (only with more than one
    profile, §12), Summary, Settings, Reset day, Full screen toggle (the icon reflects the state), Close app
- **Layout** (Settings → Appearance → Buttons): **Rows** (default, described next), **Tiles**: a grid of vertical
  tiles (name, total, run, target stacked) stretched to fill the screen, or **Circles**: round buttons (same
  content, stacked) wrapped and centered on the screen. With popularity sizing on, tiles span 1–3 grid cells and
  circles grow up to about 1.6× in diameter.
- **Empty day** (nothing tracked yet today): a short welcome hint ("Tap an activity to start the day · hold one to
  set an earlier start") and the buttons centered vertically on the screen.
- **Theme** (Settings → Appearance → Theme): System (follows the OS) / Dark / Light. The last choice is also mirrored
  to localStorage so the page does not flash the wrong theme on load.
- **Buttons (Rows layout):** one horizontal row per activity in a centered column (max ≈820 px wide). Rows are not stretched to fill
  the screen; leftover space stays empty. Each row shows the name on the left, then the target delta, today's total
  and, for the active row, the live current run (▶). The active row is strongly highlighted. When a daily target is
  set, the row shows "x left" or "x over".
- **Tap:** switch activity, or stop if the button is already active.
- **Long-press (600 ms):** opens the activity popup (§7).
- **Popularity sizing** (Settings toggle, **off** by default): row height follows today's share of time. Activities
  not used yet today move to a small strip at the bottom.

### 6.1 Navigation, full screen, closing
- **Esc = back**, following a fixed hierarchy with no loops: open popup → closes it; Day editor → Settings; Settings
  and Summary → Main. On Main, Esc does nothing.
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

## 8. Settings
The settings screen shows the open profile's name in its title.
- Profiles: open (switch to), rename, add, delete (§12)
- Groups: add, rename, on/off, reorder, delete (§13)
- Activities: add, rename, color, group, daily target, reorder, hide for today, remove (soft), restore removed
- Appearance: theme (System/Dark/Light), button layout (Rows/Tiles/Circles)
- Minimum switch: Off / 15 s / 30 s / 1 min (default) / 2 min / 3 min / 5 min (§4.2)
- **Every setting below belongs to the open profile** (§12), appearance included.
- Daily reset hour (0–23)
- Start in full screen (toggle)
- Keep the screen on (toggle, **on** by default; §10)
- Popularity sizing toggle
- Auto-export a JSON file when a day closes (toggle)
- Export the open profile to JSON, import JSON into the open profile (replaces that profile's data and settings,
  after a confirmation; other profiles are untouched)
- Link to the **day editor**: a timeline of today's segments, editing and deleting segments, adding a range
  (activity + from + to/now), and clearing the whole day. Its bar runs from the first activity's start to the last
  activity's end (or now while one is running); idle rows appear only for gaps between activities.

## 9. Summary
For the current day and every archived day **of the open profile**:
- total tracked time, the start of the first activity and the end of the last one (or "now" while running), and
  idle time (untracked gaps between the first start and the last end; time before the first or after the last
  activity is never idle)
- per activity: total, percentage, and target delta
- per group (when the profile has groups): total of its activities, plus "no group"
- a horizontal timeline bar over the same range, and the session list with idle rows for the gaps between activities

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
summary, backup file and **all settings** (theme, button layout, full screen, keep the screen on, reset hour, minimum
switch, popularity sizing, auto-export).
- **Exactly one profile is open** at a time. The open profile is remembered across restarts.
- **Switching** (header Profiles button, or Settings → Profiles → Open) loads the other profile. Nothing is stopped:
  a running activity in the profile you leave keeps counting, exactly as when the app is closed, and that profile's
  day rolls over (§5) when it is opened again. The profile picker warns when an activity is running in the open
  profile.
- **Add:** creates a profile with no activities, groups or days, and a **copy of the open profile's settings**
  (appearance included); change them afterwards in that profile.
- **Rename:** any profile.
- **Delete:** only a profile that is not open; after a confirmation it permanently deletes that profile's
  activities, groups, days and segments. The last profile cannot be deleted.
- **Upgrade from a version without profiles:** all existing activities and days move into a profile named
  "Default", which also takes over the old settings.
- **Export/import is per profile.** Export writes the open profile (name, settings, groups, activities, days,
  segments) to `activity-tracker-<profile>-<date>.json`. Import replaces the open profile's data and settings with the
  file's (its name is kept) and never touches other profiles. All ids are renewed on import, so a file exported from
  one profile can be imported into another, or into a copy of the app elsewhere, without clashes. Exports from the
  version without profiles import the same way.

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
- `palette`: colors given to new activities in turn
- `settings`: the settings of every seeded profile (`theme`, `layout`, `startFullscreen`, `keepAwake`,
  `resetHour`, `minSwitchSec`, `popularity`, `autoExport`); a profile may override some with its own `settings`
- `profiles`: the profiles to create, the first one is opened. Each has a `name`, optional `settings`, optional
  `groups` (`name`, `on` (default true), `activities`) and optional ungrouped `activities`. An activity is a name, or
  an object `{ "name", "color"?, "targetMin"? }`.

## 15. Non-goals (for now)
- multi-device sync
- server-side storage
