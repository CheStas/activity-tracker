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
| Serving | `python3 -m http.server 8765 --bind 127.0.0.1 --directory dist` (localhost is a secure context, needed for Wake Lock); the app is at `http://localhost:8765/app/`. The origin `http://localhost:8765` is unchanged (IndexedDB is per origin, not per path), so data from earlier versions is kept. |
| Site | `dist/` is a small static site (§19): the landing page at the root, the app under `app/`, plain pages next to it. |
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
- **Color = a theme slot.** An activity stores a slot number `colorSlot` (0–15), not a color; the theme (§16) gives
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
- When a day closes, each activity's name and target are copied into the day's snapshot, so a later rename does not
  change history. The **color always follows the activity's current slot**, also for days closed before this rule
  (their stored slot or hex color is no longer used).
- An activity can have one option per category dimension (`categories`, §17); they only matter in the Summary.
- **Upgrade:** an activity from before slots gets the nearest **Paper** slot (1–8) to its old `color` (RGB distance,
  ties to the lower slot).

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
2. **Header** (surface color, bottom border; the same header on every page, §6.3):
   - **Profile button**: the profile's initial in a square, its name and a chevron; opens the profile picker (§12).
     Shown only with more than one profile. On other pages this place holds the back button and the page name.
   - "Today · Wed, Oct 28" (uppercase, muted), the day total `h:mm:ss` in mono, then "since 10:03" (start of the day's
     first activity) muted; nothing before the first activity.
   - "Now": a color dot, the active activity's name and its current run (`m:ss` under an hour, `h:mm:ss` after).
     While idle: a neutral dot and "Idle", no duration (one timer only: a separate "since switch" timer would always
     show the same value).
   - Right: "Clock" + `HH:MM`, then round 44 px icon buttons on the `chip` background: Summary, Settings, Reset day,
     Full screen toggle (the icon reflects the state), Close app.
3. **Buttons area** (`flex: 1`) in one of three layouts (Settings → Main screen → Buttons). Every layout shows the
   same elements: color square, name (one line, ellipsis), share of today in %, a running chip (pulsing dot + run)
   while active, the total in mono, and the progress with its text.
   - Progress = toward the target when the activity has one ("8m left of 2h 00m target" / "5m over target"),
     otherwise the share of today ("31% of today").
   - **Tiles** (default): side-by-side columns that wrap. Square top-left 12 px, name 19 px, % top-right, total 52 px,
     a 6 px bar full width.
   - **Rows**: a centered column, max 860 px: square, name 20 px, % after it, running chip and total 32 px on the
     right; underneath a 6 px bar with the progress text on its right.
   - **Circles**: square and name 17 px above the total 32 px, running chip under it, the short progress text
     ("8m left" / "31% of today") at the bottom, and a 2.5 px progress ring around the circle, from 12 o'clock
     clockwise.
   - The active button is filled with its slot color; its text, square, bar and ring are `onAccent` (tracks at 28 %
     `onAccent`). Inactive buttons use the surface color with a 1 px border.
   - **Size by usage** (toggle, **off** by default): relative to the most-used activity today, tiles get flex-grow
     1–3×, rows 92 px × 1–2.2 high, circles 210 px × 1–1.6 wide.
   - **Empty day** (nothing tracked yet today): one line "**Ready to start the day** · Tap an activity to start
     tracking · hold one to set an earlier start" above the buttons. The unused strip is suspended (every activity is
     a button), size by usage is ignored, and the timeline, group totals and "since" are hidden.
4. **Unused strip** (toggle, **off** by default; suspended on an empty day): "Not used today" and a chip (color dot + name, min height 44 px) per
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
- **Phone (below 760 px wide):** the header wraps; the profile button shows only the initial and the clock is hidden.
  Summary and Settings stay; Reset day, Full screen and Close app move into a **⋯ More** button that opens a
  bottom-sheet menu (56 px rows, then Cancel; each item opens its own flow). Tiles: two per row (basis 150 px), min
  height 140 px, padding 16 px, total 32 px. Rows: padding 12 × 16 px, total 24 px. Circles: 62 % of the desktop
  diameter, total 22 px. The buttons area scrolls inside the viewport; header, timeline and totals stay put. The
  timeline labels only every second hour; the "Tap to switch" hint is hidden. The page never scrolls sideways.

### 6.1 Footer and welcome strip
- **Footer** (below the fold, toggle *Show the footer*, **on** by default):
  - **Privacy note** first, full width (a `chip` box, radius 12 px): "**Privacy first: all your data stays in this
    browser. No account and no internet connection needed. You are responsible for your data, so export a backup
    regularly.**" and, on the right, an "Export in Settings" link (opens Settings → Backup), styled like "More in
    Settings". The same note, without the link (the Export button is right below), heads Settings → Backup (§8).
  - Then three columns that wrap on narrow screens:
  1. "Activity Tracker", "A chess clock for your work day.", the version.
  2. Links: What is it? (the site's landing page, §19), Similar apps, Send feedback. Until the other pages exist they
     open a placeholder popup; in the single-file build What is it? does too.
  3. **Quick settings** (the same settings as in Settings, changed for the open profile immediately):
     - **Theme:** one round swatch per installed theme (its background and two activity colors), the current one
       ringed, "Theme · <name>" and a "More in Settings" link (opens Settings → Appearance). A tap applies the theme,
       the same as picking it in Settings (§16).
     - **Main screen:** "Buttons · <layout>" and the Tiles / Rows / Circles segmented control (with the layout icons;
       icons only below 760 px), then two
       44 px icon toggles (`aria-pressed`, tooltip and label = the Settings label): *Size buttons by today's usage*
       and *Move unused activities to a strip*; a pressed toggle is filled `text` with a `surface` icon. A "More in
       Settings" link opens Settings → Appearance → Main screen.
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
- **Hash routes:** each view has an address: `#/` (Main), `#/summary`, `#/settings`, `#/settings/<section id>`
  (scrolls to that section), `#/day-editor`. Opening a view adds a history entry, so the browser's back button works
  too; opening Settings from Settings (another section) replaces the entry. Esc and the back button go up the
  hierarchy above: when the view was opened from its parent that is a browser back, otherwise (a deep link, or the
  header's Settings from the day editor) the entry is replaced by the parent, so Esc never leaves the app. A reload
  keeps the view; the day editor then goes back to Settings. Unknown addresses open Main.
- **Full screen is optional.** The ⛶ button toggles document full screen. The "Start in full screen" setting enters it
  on the first tap, because browsers require a user gesture. While in full screen, Esc is captured (Keyboard Lock) so
  it keeps meaning "back"; **hold Esc** (about 2 s) to leave full screen.
- **⏻ Close app:** asks first ("Close Activity Tracker?" · "Task keeps counting while the app is closed. Open the app
  again to stop it or switch." / idle: "Nothing is running." · Cancel / **Close app**), then closes the window, which
  also stops `start.sh` and its server. A running activity keeps counting while the app is closed (time is derived
  from the start timestamp). When the browser refuses to let the page close the window (a normal tab or a `file://`
  page), the dialog "Close the window yourself" says to use Alt+F4 / Ctrl+W.
- **Reset day** asks first: "Reset the day?" · "Task stops now. Wed, Oct 28 closes with 8h 43m tracked and a new day
  starts. You can still edit the closed day from Summary." (without a running activity the first sentence is
  dropped) · Cancel / **Reset day** (danger).

### 6.3 One header on every page
Every page (Main, Summary, Settings, the day editor and any later page) has the main screen's header (§6), so the
day total, "Now" and the clock stay in view and the app buttons stay in the same place:
- **Left:** on Main the profile button; on every other page a round 44 px **back** button and the page name, 20 px
  semibold, with "· <profile>" muted (the profile name hidden below 760 px). Back = Esc (§6.2).
- **Middle:** "Today" and "Now" exactly as on Main, ticking live.
- **Right:** the clock and the same icon buttons (Summary, Settings, Reset day, Full screen, Close app; ⋯ More on a
  phone). The button of the page that is open is marked (`aria-current="page"`, filled `text` with a `surface`
  icon) and does nothing.
- Controls that used to sit in a page's own header move to the top of its content: the Summary's period switcher
  (§9), the day editor's ‹ day › stepper (§8).

### 6.4 Back to top
A round 56 px floating button (accent fill, `onAccent` up arrow, a soft shadow, 20 px from the bottom-right corner,
above the safe area) appears on every page once it has scrolled down by half a screen, or half the way down when the
page scrolls less than a screen; on Main that is when the footer comes into view. A tap scrolls smoothly back to the top (instantly with reduced motion). On a touch screen the
buttons area can fill the whole screen and catch every swipe, so this is the way back up. It fades in and out and is
hidden under open dialogs. Label "Back to top".

## 7. Activity popup (long-press)
- Header: color square, name, "Today 3h 38m in 5 sessions · running" (and the target delta when set).
- Today's sessions of the activity **in time order**, the running one last ("21:13 – now ● 0:03" in the activity
  color), each with Edit and Delete (danger color). **Delete asks first:** "Delete this session?" · "Task · 15:23 –
  15:37 (13m 52s). This time becomes idle. You can add it back in the day editor." · Cancel / **Delete**. The day
  editor's Delete asks the same.
- **Correct the timeline:** −15 −5 −1 [time] +1 +5 +15 (±1 hidden on a phone), quick chips now / 5m / 10m / 15m / 30m /
  60m ago (the matching one is marked), then "▶ Task active since 21:05" (activity color fill, `assign(X, t, null)`)
  and "■ Stop all since 21:05" (`assign(null, t, null)`).
- **Edit sessions…:** closes the popup and opens the day editor (§8) on today.

## 8. Settings
A two-column page: a section list on the left (stacked above the content on narrow screens) and the content on the
right, max 1240 px wide. Header: the shared header (§6.3) with "Settings · <profile>". The page uses the open profile's
theme, so theme changes preview live. All controls are native (`button`, `input type=checkbox` inside a `label`), at
least 44 px tall, with a visible focus ring.
- **Section list:** Profiles, Groups, Categories, Activities, Appearance, Day, Device, Backup, About. A tap scrolls to
  the section; the section in view is highlighted.
- **Every setting belongs to the open profile** (§12), appearance included; imported themes are shared (§16).
- **Profiles:** open (switch to), rename, add, delete (§12)
- **Groups:** add, rename, on/off, reorder, delete (§13)
- **Categories** (§17): an intro line, then one card per dimension: a header with the name field, "5 of 7 activities
  set", ↑ ↓ and Delete; one row per option with a 44 px color button (opens the 16 swatches in place), name field,
  "3 activities", ↑ ↓, Delete; an "Add an option" field + Add. Then a "New dimension" field + **Add dimension**.
  Empty state: "No categories yet", an example, **Add "Focus" example** and **Add an empty dimension**.
- **Activities:** add, rename (names unique, §3), group, daily target, reorder, hide for today, remove (soft),
  restore removed, delete removed from the list. The color swatch is read-only and links to Activity colors. Under
  each activity, one picker per dimension, labelled with its name: 2–3 options → a segmented control (the options +
  "Not set", each with its color dot); 4 or more → a chip that opens a list.
- **Appearance:**
  - **Theme:** Fixed / Follow system, a grid of theme cards (a mini preview of background, surface, a filled tile and
    the 16 slots; name; light/dark), the selected card ringed, and an *Import theme* card last. Imported themes can be
    renamed, exported and deleted (§16).
  - **Activity colors:** one row per activity (live and removed-but-listed): its name in its current color and the 16
    slot swatches (44 px targets; two rows of 8 below 760 px); a tap sets the slot.
  - **Main screen:** Buttons Tiles / Rows / Circles (segmented, with small layout icons), and toggles, each with a
    one-line hint: Size buttons by today's usage; Move unused activities to a strip; Show today's timeline; Show group
    totals; Show the footer (§6).
- **Day:** automatic reset hour (0–23); **Week starts on** System (from the locale, Monday when it says nothing) /
  Monday / Sunday / Saturday, used by the Week period, the calendar and the heatmap; minimum switch Off / 15 s / 30 s
  / 1 min (default) / 2 min / 3 min / 5 min (§4.2); auto-export a JSON file when a day closes; Edit timeline…
- **Device:** start in full screen; keep the screen on (**on** by default; §10)
- **Backup:** first the privacy note from the footer (§6.1, bold, in a `chip` box), then export the open profile to
  JSON, import JSON into the open profile (replaces that profile's data and settings, after a confirmation; other
  profiles are untouched)
- **About:** What is it?, Similar apps, Send feedback (same targets as the footer), the version.
- Link to the **day editor** (also reachable from the activity popup, §7, and from each summary day, §9): a timeline of one day's segments,
  editing and deleting segments, adding a range (activity + from + to/now), and clearing the whole day. Its bar runs
  from the first activity's start to the last activity's end (or now while one is running); idle rows appear only for
  gaps between activities.
  - Header: the shared header (§6.3) with "Day editor · <profile>". The first line of the page is a stepper:
    ‹, the day ("Today · Thu, Oct 29" / "Wed, Oct 28"), ›.
  - It opens on today (from the summary: on that day); ‹ › step through the profile's earlier days (any closed day can be edited).
  - A closed day is edited within its own start and end: no "now", no running session, and the "x min ago" shortcuts
    are hidden. Its snapshot total is updated, so the summary shows the edited day. Clearing a closed day keeps it
    (empty) so it can be rebuilt; the summary skips empty days.
  - Leaving the editor always returns it to today. The summary has no edit controls of its own, only the link.

## 9. Summary
One scrolling page for a **period** of the open profile, every block a full-width card (max 1240 px), in this order.
The period (Day, Week, Month, Custom) changes what each block shows, not the order. Durations read "8h 43m".
1. **Header:** the shared header (§6.3) with "Summary · Work".
2. **Period card:**
   - First line: the period switcher Day · Week · Month · Custom (full width below 600 px). The last used period is
     remembered (`summaryPeriod`).
   - ‹ [period label ▾] ›, a jump chip when not on the current period ("Today", "This week", "This month", "Last 7
     days" for custom), and **Group by** on the right (Activity · each dimension; hidden without dimensions; scrolls
     sideways in its own box on a phone). ‹ › step by a day, week or month; a custom range by its own length.
   - Labels: "Wed, Oct 28", "Today · Thu, Oct 29", "Oct 26 – Nov 1", "October 2026", "Oct 22 – Oct 28" + "7 days ·
     Last 7 days" (the sub-line hides on a phone).
   - **Folded calendar:** Day and Week show the 7-day strip of the week (the day ringed); Custom up to 14 days one cell
     per day; Month and longer (up to 62 days) a compact month grid (30 px cells). Cells show the day and its hours
     ("9h14") or "—"; a tap opens that day. Cells are shaded: accent at 18–100 % by the day's total relative to
     max(longest day in view, 8h), text in `onAccent` above 55 %.
   - **Picker** (tap the label): the card expands in place to a month calendar (44 px cells, week start from
     Settings) and the quick ranges Today, Yesterday, This week, Last week, Last 7 days, This month, Last month, Last
     30 days, then Cancel / Apply. First tap sets the start, second the end (both included); the hint says which tap
     is next and the label shows the range being picked ("Oct 12 – …", "pick the last day"). Tracked days are shaded.
     A picked single day becomes a Day, an exact calendar week or month that period, anything else Custom.
3. **Figure tiles** (min 150 px, two per row on a phone): Day: Total tracked · First – last ("09:48 – now") · Idle ·
   Switches (sessions − 1; sub: sessions). Week, Month, Custom: Total tracked · Avg per tracked day (sub: "5 tracked
   days") · vs previous period ("+41h 51m", sub "previous: 2h 46m"; "—" and "no data in September" when it is empty).
4. **Timeline** (Day): 44 px blocks from the first start to the last end (or now), idle gaps as `track` blocks,
   durations inside blocks of 40 min or more, hour labels with the start and end at the edges. Tap a block: it gets
   a ring and the card shows "Task · 12:14 – 13:29 · 1h 15m"; tap again to clear. The running block pulses.
5. **Per day** (Week, Month, Custom): a row per day: day name and date, a bar on a shared clock axis (08:00–20:00
   widened to the earliest start and latest end, full hours, 4 labels), blocks at their real times colored by Group
   by, durations inside blocks of 70 min or more (not in Month), the total. Dashed lines mark the average start and
   end (explained in the card hint; hidden with fewer than 2 tracked days). Two or more empty days in a row collapse
   into one dashed line "Sat 24 – Sun 25 · nothing tracked". A tap opens a detail strip (each group's time that day
   and "Open day ›"); one at a time. Rows are 44 px (bar 28 px), in Month 36 px (bar 20 px). Ranges longer than 45 days
   show one row per week (stacked totals by group, no time axis).
6. **Share:** a 160 px donut (total in the middle) and a table Name · Total · Share · *Avg / day* (Week, Month,
   Custom) or *Target* (Day: "11m left" / "5m over" in the danger color, with a thin bar). By activity: one row per
   activity, largest first, "(removed)" after removed ones, and for activities with a target "target 2h 00m · met on 3
   of 5 days". By a dimension: one row per option plus "Not set", each expandable to its activities. On a phone the
   4th column is hidden and the donut sits above the table.
7. **Sessions** (Day): "Sessions · 20 sessions", the checkbox "Group by <dimension>" (when Group by is a dimension; on
   by default, remembered as `summaryGroupLog`), and **Edit sessions…** (opens the day editor on that day; back returns
   to the summary). Rows: color square, name, "12:14 – 13:29", duration; idle rows have a dashed empty square. Grouped:
   a header per option with its subtotal, idle last.
- **Empty period:** the tiles show 0h 00m / — / —; per day, share and sessions are replaced by one dashed card
  "Nothing tracked from Oct 1 to Oct 7" with **Last 7 days** and **Main screen**.
- **Computing:** a day runs from reset hour to reset hour; a session over it counts partly to each day, and a day is
  labelled with the date it starts on, so changing the reset hour recomputes every period. A tracked day has any
  time; averages divide by tracked days. Idle = gaps between the first start and the last end. Past sessions use the
  activity's **current** color and **current** categories; names on a Day come from that day's snapshot. While an
  activity runs, a period containing today ticks live every second. Group by is remembered per profile
  (`summaryGroupBy`; back to Activity when the dimension is deleted).

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
timeline, group totals, footer, welcome strip dismissed, full screen, keep the screen on, reset hour, week start,
minimum switch, auto-export, and the Summary's period, Group by and log grouping) and its own categories (§17).
Imported themes are shared by all profiles (§16).
- **Exactly one profile is open** at a time. The open profile is remembered across restarts.
- **Switching** (header Profiles button, or Settings → Profiles → Open) loads the other profile. Nothing is stopped:
  a running activity in the profile you leave keeps counting, exactly as when the app is closed, and that profile's
  day rolls over (§5) when it is opened again.
- **Profile switcher** (header button): "Switch profile"; when an activity runs in the open profile, a notice "**Task
  is running in Work.** It keeps counting while another profile is open."; one 64 px row per profile: initial square,
  name, a status line with a dot ("Task running · 3h 38m today" / "Idle · last used Tue, Oct 27" / "Nothing tracked
  yet") and "Open" (the current one, ringed) or "Switch"; then the link "Add, rename or delete profiles in Settings".
- **Add:** creates a profile with no activities, groups or days, and a **copy of the open profile's settings**
  (appearance included, welcome strip dismissed); change them afterwards in that profile.
- **Rename:** any profile.
- **Delete:** only a profile that is not open; after a confirmation it permanently deletes that profile's
  activities, groups, days and segments. The last profile cannot be deleted.
- **Upgrade from a version without profiles:** all existing activities and days move into a profile named
  "Default", which also takes over the old settings.
- **Export/import is per profile.** Export writes the open profile (name, settings, groups, categories, activities
  with their options, days, segments) to `activity-tracker-<profile>-<date>.json`; when the profile uses imported themes, they are embedded
  (`themes`) and installed on import. Import replaces the open profile's data and settings with the
  file's (its name is kept) and never touches other profiles. All ids are renewed on import, so a file exported from
  one profile can be imported into another, or into a copy of the app elsewhere, without clashes. Exports from the
  version without profiles import the same way. Older files import with defaults for newer settings (their `theme`
  and activity colors are mapped as on upgrade, §16), no categories, and 8-slot themes completed to 16.

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
- `palette`: the order in which new activities get color slots, as slot numbers 1–16 or hex colors (a hex color
  means its nearest Paper slot); new activities take the next slot in this order and wrap around
- `settings`: the settings of every seeded profile (`themeMode`, `themeId`, `lightThemeId`, `darkThemeId`, `layout`,
  `popularity`, `unusedStrip`, `showTimeline`, `showGroups`, `showFooter`, `startFullscreen`, `keepAwake`,
  `resetHour`, `minSwitchSec`, `autoExport`, `weekStart` (`"system"` or 0–6, 0 = Sunday), `summaryGroupBy`
  (`"activity"` or a dimension id), `summaryGroupLog`, `summaryPeriod` (`day` / `week` / `month` / `custom`)); a
  profile may override some with its own `settings`
- `profiles`: the profiles to create, the first one is opened (and shows the welcome strip). Each has a `name`,
  optional `settings`, optional `groups` (`name`, `on` (default true), `activities`) and optional ungrouped
  `activities`. An activity is a name, or an object `{ "name", "slot"?, "color"?, "targetMin"? }`: `slot` is 1–16;
  `color` (hex) is still accepted and mapped to the nearest Paper slot.
- `config/themes/*.json`: the built-in themes (§16), bundled at build time the same way.

## 15. Non-goals (for now)
- multi-device sync
- server-side storage

## 16. Themes
A theme is one JSON object of color tokens plus 16 activity color slots. It is applied as CSS custom properties on
`:root` (`--bg`, `--surface`, `--chip`, `--line`, `--track`, `--text`, `--muted`, `--on-accent`, `--slot-1` …
`--slot-16`); no component hard-codes a color.

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
| `slots[8..15]` | activity and category option colors | `#B8336A #0F7A6E #4F7A12 #7A4E2D #4338CA #6B6A1F #7D1F3A #5B6472` |

The slot order is fixed by meaning so imported palettes line up: 1 blue, 2 green, 3 orange, 4 purple, 5 red, 6 cyan,
7 yellow, 8 neutral, 9 pink, 10 teal, 11 lime, 12 brown, 13 indigo, 14 olive, 15 wine, 16 slate. Slot 1 doubles as
the accent (primary buttons, checkboxes, focus ring), slot 5 as danger. With more activities than slots, colors
repeat; names are always shown next to colors.

Slots 9–16 of the built-in themes:

| Theme | 9 pink | 10 teal | 11 lime | 12 brown | 13 indigo | 14 olive | 15 wine | 16 slate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Paper | `#B8336A` | `#0F7A6E` | `#4F7A12` | `#7A4E2D` | `#4338CA` | `#6B6A1F` | `#7D1F3A` | `#5B6472` |
| Graphite | `#FF8AC0` | `#45D0BE` | `#B6E36B` | `#D9A57C` | `#A7A9FF` | `#C9C46E` | `#C98A95` | `#9AA3B2` |
| Dune | `#9B3C62` | `#2E6E66` | `#5A7020` | `#6B4428` | `#4B4A9A` | `#6E6A2A` | `#6E2236` | `#5A6170` |
| Tokyo Night | `#f7a1c9` | `#73daca` | `#c3e88d` | `#d6a57c` | `#9aa5ff` | `#cfc97a` | `#c78a99` | `#8f99c7` |
| Gruvbox Dark | `#e8a0c0` | `#7ec4b0` | `#c6d66a` | `#c49a6c` | `#a3a8e0` | `#c8b860` | `#c48a90` | `#a89984` |
| Nord | `#e5a6c4` | `#8fbcbb` | `#c5d89a` | `#c8a582` | `#a3aee0` | `#cdc58a` | `#c4919a` | `#9aa5b8` |
| Solarized Light | `#b0306a` | `#1b6e66` | `#4d6a00` | `#7a4a1e` | `#3f46a8` | `#6a6400` | `#7a1f3a` | `#4e5f66` |

All of them reach 4.5:1 against their theme's `onAccent`.

**File format** (also what Export writes):
```json
{
  "name": "Paper",
  "kind": "light",
  "colors": { "bg": "#F5F5F2", "surface": "#FFFFFF", "chip": "#EFEFEB", "line": "#E3E3DE",
              "track": "#ECECE7", "text": "#1B1B1A", "muted": "#62625D", "onAccent": "#FFFFFF" },
  "slots": ["#2F5FCC", "#17804F", "#B5561A", "#8A47C4", "#C03636", "#1F7799", "#8C6A0A", "#4D4D49",
            "#B8336A", "#0F7A6E", "#4F7A12", "#7A4E2D", "#4338CA", "#6B6A1F", "#7D1F3A", "#5B6472"]
}
```
A file with only 8 slots is accepted; 9–16 are derived (below).
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
  - `onAccent` = white or `bg`, whichever has the better worst-case contrast against slots 1–8.
  - **Slots 9–16:** Alacritty, iTerm and VS Code terminal colors fill them from the bright ANSI colors (BrightMagenta
    → pink, BrightCyan → teal, BrightGreen → lime, BrightBlue → indigo, BrightYellow → olive, BrightBlack / BrightWhite
    → slate) when one differs from every other slot by ΔE (CIE76) 15 or more. Otherwise, and for base16 and 8-slot
    files, they are derived from slots 1–8: pink = red turned toward magenta, teal = green + cyan, lime = green +
    yellow, brown = orange darkened 25 %, indigo = blue + purple, olive = yellow mixed 30 % toward neutral, wine = red +
    purple darkened 20 %, slate = neutral mixed 15 % toward blue. Derived and picked ones are moved in lightness (not
    hue) until they reach 4.5:1 against `onAccent`.
  - Stored imported themes and themes embedded in old exports with 8 slots get 9–16 derived on load.
  - After import a warning lists every slot under 3:1 against `bg`; the theme still installs and is applied.
  - Imported themes are stored per app (IndexedDB store `themes`, shared by all profiles) and can be renamed,
    exported and deleted. Deleting one that profiles use makes them fall back as above.

## 17. Categories
A **dimension** is one way to split time (Focus, Company, Billing); it has **options** (Productive /
Non-productive). Stored per profile in the IndexedDB store `categories`:
`{id, profileId, name, order, options: [{id, name, colorSlot, order}]}`.
- An activity has at most one option per dimension (`activity.categories`: dimension id → option id; a missing key is
  "Not set"), so each dimension adds up to 100 % with an automatic **Not set** share (`muted` at 35 %).
- Categories are only for the Summary (§9): "Group by <dimension>" colors blocks, rows, the donut and the share by
  option. Groups stay as they are (one per activity, main screen show/hide, §13).
- Stats follow the activity's **current** options: changing an option changes history, as groups do.
- Each option has a color slot (1–16); new options take the first slot the dimension does not use yet.
- Deleting a dimension (after a confirmation) removes it from every activity; deleting an option moves its activities
  to Not set. Nothing else changes.

## 18. Dialogs
Every popup uses one dialog component.
- A centered card: `surface`, 1 px `line`, radius 22 px, padding 22 × 24 px, 16 px gaps, on a black scrim at 45 %; max
  width 460 px (confirms), 520 px (profiles), 600 px (activity, session editor, add range), 380 px (menu). It scrolls
  inside when taller than the screen.
- Below 600 px wide it is a full-width **bottom sheet**: top corners 22 px, a 40 × 4 px grab handle, max 90 % of the
  screen height.
- Esc, the round × (popups with content) and a tap on the scrim close it; confirms and the menu have Cancel instead.
- Confirms are Cancel (secondary, `chip`) + the action (primary = accent, or danger = slot 5 for destructive actions),
  right-aligned, 140–220 px wide, 48 px high; they stretch side by side on a phone. Messages have one OK.
- Used for: profile switcher (§12), activity popup and delete session (§7), reset day and close app (§6.2), the
  placeholder of Similar apps / Send feedback ("This page is coming in a later version." · OK), the
  phone More menu (§6), and the confirmations in Settings and the day editor.

## 19. Website
`npm run build` produces a static site; every page is a Vite input (`vite.config.ts`), styled by
`src/site/site.css` with the app's tokens and font (`src/tokens.css`):

| Path | Source | Content |
|---|---|---|
| `/` | `index.html` | Landing page (below). No redirect for returning users. |
| `/app/` | `app/index.html` | The app (the PWA). |
| `/app/?demo` | `app/index.html` | The demo: the app on sample data in a throwaway database (below). |
| `/privacy/` | `privacy/index.html` | Privacy: no account, no server, data stays in the browser. |
| `/terms/` | `terms/index.html` | Terms of use: free, as is, backups are the user's job. |

- Every site page has the same header (logo + name → `/`, **Open the app**) and a footer with the other pages.
- The pages are plain HTML with no script, so they load fast and can be indexed.
- **Landing page:** hand-written copy (not spec wording), in this order: hero (headline, a lead that ends on privacy:
  no account, nothing leaves the device; **Try the live demo** → `app/?demo`, **Open the app**, a line saying the demo
  is sandboxed, the main-screen GIF); five feature rows that alternate text and image (one-tap switching, backdating
  via hold, privacy with a card of four promises instead of a screenshot, the Summary GIF, the phone GIF); a privacy
  panel that repeats the promise; a grid of smaller features; a closing call to action. Privacy is a main selling
  point, so it appears in all three places. Images are `docs/screenshots/` (`npm run screenshots`), bundled
  by Vite from the `<img src>`; all but the hero load lazily. Below 760 px the rows stack, text first.
- **Demo (`?demo`):** the app opens the IndexedDB database `activity-tracker-demo` instead of `activity-tracker`,
  deletes it on every load and fills it with the sample (`src/sample.ts`, the same data the run skill seeds): one
  "Work" profile, three weeks of weekdays, today running until now, theme following the system. The real database is
  never opened, the theme mirror in localStorage is neither read nor written, and persistent storage is not requested.
  A strip above the header on every page says it is a demo with sample data that a reload starts over, with **Start
  your own** → `app/` (no `?demo`). A demo open in another tab gives way when a new one wipes the database.
- **PWA:** `public/app/manifest.webmanifest` with `scope` and `start_url` = `app/`, so the installed app opens straight
  in the app and never shows the site pages. Icons: `public/favicon.svg` (also the site's favicon) and PNGs rendered
  from it (`public/app/icon-192.png`, `icon-512.png`). There is no service worker yet, so the app needs the network
  to load.
- `public/` is copied as is. The single-file build (`--mode single`) builds only the app and drops the favicon and
  manifest links.
