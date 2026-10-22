#!/usr/bin/env bash
# Serve the app on localhost and open it in Chromium with a dedicated profile (same data in every mode).
#
#   start.sh            app window: title bar, resizable, closable; screen kept awake (default)
#   start.sh --kiosk    locked full screen, no window controls; screen kept awake
#   start.sh --browser  normal browser window with tabs; screen NOT kept awake
#
# The script (and the local server) exits when the window is closed, e.g. with the in-app ⏻ button.
set -euo pipefail

MODE="app"
case "${1:-}" in
  --kiosk) MODE="kiosk" ;;
  --browser) MODE="browser" ;;
  --app|"") ;;
  -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
  *) echo "Unknown option: $1 (use --kiosk, --browser or --help)" >&2; exit 2 ;;
esac

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8765}"
URL="http://localhost:${PORT}"
PROFILE="${PROFILE:-$HOME/.local/share/activity-tracker/chromium}"

BROWSER="${BROWSER:-$(command -v chromium-browser || command -v chromium || command -v google-chrome || true)}"
[ -n "$BROWSER" ] || { echo "No Chromium/Chrome found; set BROWSER=..." >&2; exit 1; }

# Static server (reuse one that is already running on the port).
if ! curl -fsS -o /dev/null "$URL" 2>/dev/null; then
  python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$APP_DIR" >/dev/null 2>&1 &
  SERVER_PID=$!
  trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
  for _ in $(seq 20); do curl -fsS -o /dev/null "$URL" 2>/dev/null && break; sleep 0.2; done
fi

args=("$BROWSER" --user-data-dir="$PROFILE" --no-first-run --noerrdialogs --disable-session-crashed-bubble)
case "$MODE" in
  app) args+=(--app="$URL" --start-maximized) ;;
  kiosk) args+=(--kiosk --app="$URL" --disable-infobars --overscroll-history-navigation=0 --disable-pinch) ;;
  browser) args+=(--new-window "$URL") ;;
esac
mkdir -p "$PROFILE"

if [ "$MODE" = "browser" ]; then
  "${args[@]}"
  exit 0
fi

# Keep the screen on. X11: xset; GNOME: gsettings; KDE/Wayland honours the inhibitor below
# and Chromium's idle inhibit (Wake Lock API in the page).
if [ "${XDG_SESSION_TYPE:-}" = "x11" ] && command -v xset >/dev/null; then
  xset s off -dpms s noblank || true
fi
if [[ "${XDG_CURRENT_DESKTOP:-}" == *GNOME* ]] && command -v gsettings >/dev/null; then
  gsettings set org.gnome.desktop.session idle-delay 0 || true
fi

if command -v systemd-inhibit >/dev/null; then
  systemd-inhibit --what=idle:sleep --who="Activity Tracker" --why="Wall display" "${args[@]}"
else
  "${args[@]}"
fi
