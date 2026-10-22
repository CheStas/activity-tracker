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
| Stack | Browser-only static app (HTML/CSS/vanilla JS ES modules, no build step for the main run) |
| Storage | IndexedDB in the browser profile; `navigator.storage.persist()` requested |
| Serving | `python3 -m http.server 8765 --bind 127.0.0.1` (localhost is a secure context, needed for Wake Lock) |
| Main run | `scripts/start.sh`: Chromium with a dedicated profile. Modes: **app window** (default; title bar, resizable, closable), `--kiosk` (locked full screen), `--browser` (normal window with tabs, screen not kept awake). All modes share the same data. The script and its server exit when the window closes. |
| Static hosting | The app folder (`index.html`, `css/`, `js/`) works from any static web server, including a subpath, because all paths are relative. Data is per browser, per device, per site address (IndexedDB); there is no sync. Use **HTTPS** for screen keep-awake and persistent storage. Plain HTTP works too: IDs fall back to `crypto.getRandomValues` because `crypto.randomUUID` needs a secure context. Safari may evict data after about 7 days without visits unless the site is added to the home screen. |
| Plain HTML (optional) | `node scripts/build-single.mjs` builds `dist/activity-tracker.html`, a single file to open by double-click (browsers block module files on `file://`). No screen keep-awake. **Its data is separate** from the localhost version (a different origin); move data between them with export/import. Rebuild after code changes. |
| Device | Linux PC/laptop touchscreen; the layout is responsive, with large touch targets |
| Backup | JSON export/import in settings; optional automatic JSON download when a day closes |

## 3. Activities (buttons)
- These activities are seeded on first run: **break, meeting, task, pr review, communication, setup, prepare ticket**.
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

## 5. Day
- A day starts with the first app start, or when the previous day ends.
- **Manual reset** (button on the main screen): stops the active segment at now, closes the day (archive and snapshot),
  and starts a new day.
- **Automatic rollover:** at the configured reset hour (default **00:00** local time). The open segment is closed at the
  boundary; nothing carries over into the new day. The new day starts at the boundary.
- When the app is opened after one or more missed boundaries, the day is closed at the first missed boundary.

## 6. Main screen (kept minimal)
- **Header:** day total (since the last reset), followed by the day's start time in smaller text ("since 08:12"); the
  active activity with its current run (or "idle for X"); the time since the last switch; the clock; small icons for
  📊 Summary, ⚙️ Settings, ⟲ Reset, ⛶ full screen toggle and ⏻ close app.
- **Layout** (Settings → Appearance → Buttons): **Rows** (default, described next) or **Tiles**: a grid of vertical
  tiles (name, total, run, target stacked) stretched to fill the screen. With popularity sizing on, tiles span 1–3
  grid cells.
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
- Activities: add, rename, color, daily target, reorder, hide for today, remove (soft), restore removed
- Appearance: theme (System/Dark/Light), button layout (Rows/Tiles)
- Daily reset hour (0–23)
- Start in full screen (toggle)
- Popularity sizing toggle
- Auto-export a JSON file when a day closes (toggle)
- Export all data to JSON, import JSON (replaces all data, after a confirmation)
- Link to the **day editor**: a timeline of today's segments, editing and deleting segments, adding a range
  (activity + from + to/now), and clearing the whole day

## 9. Summary
For the current day and every archived day:
- total tracked time, the start and end of the day, and idle time (untracked gaps between the first start and the last
  end)
- per activity: total, percentage, and target delta
- a horizontal timeline bar and the session list

## 10. Keeping the screen awake
- In the app: the Wake Lock API (`navigator.wakeLock.request('screen')`), requested again on `visibilitychange`.
- `scripts/start.sh` (app and kiosk modes, not `--browser`) wraps Chromium in `systemd-inhibit --what=idle:sleep`. On X11 it also runs
  `xset s off -dpms s noblank`; on GNOME it sets `idle-delay 0`. KDE/Wayland honors the inhibitor and Chromium's idle
  inhibit.

## 11. Non-goals (for now)
- multi-device sync
- server-side storage
