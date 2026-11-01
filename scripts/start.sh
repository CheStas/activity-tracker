#!/usr/bin/env bash
# Build the app if needed, serve dist/ on localhost and open it in Chromium with a dedicated profile (same data in every mode).
#
#   start.sh            app window: title bar, resizable, closable (default)
#   start.sh --kiosk    locked full screen, no window controls
#   start.sh --browser  normal browser window with tabs
#
# The screen is kept on by the page itself (Settings → Keep the screen on, via the Wake Lock API).
# The script (and the local server) exits when the window is closed, e.g. with the in-app close button.
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
URL="http://localhost:${PORT}/app/" # the site's root is the landing page; the app lives under app/
PROFILE="${PROFILE:-$HOME/.local/share/time-tracker/chromium}"

BROWSER="${BROWSER:-$(command -v chromium-browser || command -v chromium || command -v google-chrome || true)}"
[ -n "$BROWSER" ] || { echo "No Chromium/Chrome found; set BROWSER=..." >&2; exit 1; }

# Build dist/ when it is missing or older than the sources. Without npm, serve whatever build exists.
DIST="$APP_DIR/dist"
BUILT="$DIST/app/index.html"
if [ ! -f "$BUILT" ] || [ -n "$(find "$APP_DIR/src" "$APP_DIR/config" "$APP_DIR/public" "$APP_DIR/app" "$APP_DIR/index.html" "$APP_DIR/privacy" "$APP_DIR/terms" "$APP_DIR/package.json" "$APP_DIR/vite.config.ts" -newer "$BUILT" -print -quit)" ]; then
  if command -v npm >/dev/null; then
    (cd "$APP_DIR" && { [ -d node_modules ] || npm ci; } && npm run build)
  elif [ -f "$BUILT" ]; then
    echo "npm not found; serving the existing (outdated) build" >&2
  else
    echo "No build in $DIST and npm not found; run 'npm install && npm run build' first" >&2
    exit 1
  fi
fi

# Static server (reuse one that is already running on the port).
if ! curl -fsS -o /dev/null "$URL" 2>/dev/null; then
  python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$DIST" >/dev/null 2>&1 &
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

"${args[@]}"
