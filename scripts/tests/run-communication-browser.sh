#!/usr/bin/env bash
# Run through aos-kitty-launch while the isolated demo Firestore emulator is active.
set -euo pipefail
cd "$(dirname "$0")/../.."
coach_communication_logs=$(mktemp -d /tmp/coach-communication-browser.XXXXXX)
printf '%s\n' "$coach_communication_logs" > /tmp/coach-communication-browser-latest
node scripts/tests/communication-server.mjs > "$coach_communication_logs/vite.log" 2>&1 &
coach_communication_vite=$!
/opt/thorium-browser-avx2/thorium --headless --no-sandbox --disable-gpu --remote-debugging-address=127.0.0.1 --remote-debugging-port=19224 --user-data-dir="$coach_communication_logs/profile" about:blank > "$coach_communication_logs/browser.log" 2>&1 &
coach_communication_browser=$!
trap 'kill "$coach_communication_vite" "$coach_communication_browser" 2>/dev/null || true' EXIT
for attempt in {1..30}; do
 if curl -fsS http://127.0.0.1:19224/json/version >/dev/null 2>&1 && curl -fsS http://127.0.0.1:15905/scripts/tests/communication-browser.html >/dev/null 2>&1; then
  node scripts/tests/communication-browser.mjs > "$coach_communication_logs/results.log" 2>&1
  cat "$coach_communication_logs/results.log"
  exit 0
 fi
 sleep 1
done
cat "$coach_communication_logs/vite.log"
exit 1
