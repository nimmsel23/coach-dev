#!/usr/bin/env bash
# Run through aos-kitty-launch. No authentication, cloud writes or real client data.
set -euo pipefail
cd "$(dirname "$0")/../.."
coach_editor_logs=$(mktemp -d /tmp/coach-shared-editor.XXXXXX)
printf 'Browser test logs: %s\n' "$coach_editor_logs"
node scripts/tests/shared-editor-server.mjs > "$coach_editor_logs/vite.log" 2>&1 &
coach_editor_vite=$!
/opt/thorium-browser-avx2/thorium --headless --no-sandbox --disable-gpu --remote-debugging-address=127.0.0.1 --remote-debugging-port=19222 --user-data-dir="$coach_editor_logs/profile" about:blank > "$coach_editor_logs/browser.log" 2>&1 &
coach_editor_browser=$!
trap 'kill "$coach_editor_vite" "$coach_editor_browser" 2>/dev/null || true' EXIT
for attempt in {1..30}; do
  if curl -fsS --max-time 3 http://127.0.0.1:19222/json/version >/dev/null && curl -fsS --max-time 3 http://127.0.0.1:15903/scripts/tests/shared-editor-browser.html >/dev/null; then
    node scripts/tests/shared-editor-browser.mjs
    exit $?
  fi
  sleep 1
done
cat "$coach_editor_logs"/*.log
exit 1
