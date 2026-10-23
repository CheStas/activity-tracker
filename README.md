# Activity Tracker

A touchscreen "chess clock" for the work day. Tap an activity to start it; tapping another one switches to it, and
tapping the active one stops everything. It tracks today's total, a total per activity and the current run, and you can
backdate a switch ("I actually started this at 14:30"). See [docs/SPEC.md](docs/SPEC.md) for the full spec and
[docs/SIMILAR-TOOLS.md](docs/SIMILAR-TOOLS.md) for comparable apps.

## Run
```sh
scripts/start.sh             # app window (resizable, closable) — the main way to run it
scripts/start.sh --kiosk     # locked full screen, no window controls
scripts/start.sh --browser   # normal browser window with tabs
```
`start.sh` is a bash script: run it directly (or with `bash`), not with `node`. The npm shortcuts do the same:
`npm start`, `npm run start:browser`, `npm run start:kiosk`, `npm run build:single`, `npm test`.

Closing the window (or the in-app ⏻ button) also stops the script and its local server.
To start it at login, copy `pomodoro-tracker.desktop` to `~/.config/autostart/` and fix the path in `Exec=`.

### Optional: plain HTML file
```sh
node scripts/build-single.mjs   # -> dist/activity-tracker.html, open it by double-click
```
This file does not keep the screen on, and its data is **separate** from `scripts/start.sh` (a different browser
origin). Use export/import to move data between them. Rebuild it after code changes.

### Optional: any static web server
Copy `index.html`, `css/` and `js/` to any static host. Each browser on each device keeps its own data; nothing
syncs, so use export/import to move data. Prefer HTTPS: on plain HTTP the screen isn't kept awake and storage
may be evicted.

## Use
- **Tap** to switch the activity; **tap the active row** to stop all.
- **Long-press** a row to see its sessions and to set "active since…" or "stop all since…".
- Header icons: summary, settings, reset day (archives the day), full screen, close.
- **Settings → Appearance:** theme (System/Dark/Light) and button layout (Rows/Tiles/Circles).
- Switches shorter than a minute are not counted (the time goes to the next or previous activity); change the
  threshold in **Settings → Day → Minimum switch**.
- The screen stays on while the app is open; turn this off in **Settings → Day → Keep the screen on**.
- **Esc** goes back (popup → screen → main). In full screen, hold Esc to leave full screen.

## Data
- Stored in IndexedDB in the Chromium profile `~/.local/share/activity-tracker/chromium`, for the origin
  `http://localhost:8765`. Always use the same port and profile, or you will see an empty database.
- Back up with **Settings → Export JSON**. Restore with **Import JSON**. You can also turn on auto-export on day close.

## Tests
```sh
node --test
```
