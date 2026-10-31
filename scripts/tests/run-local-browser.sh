#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
coach_local_logs=$(mktemp -d /tmp/coach-local-browser.XXXXXX)
printf 'Local browser logs: %s\n' "$coach_local_logs"
python3 scripts/tests/local-browser-backend.py > "$coach_local_logs/backend.log" 2>&1 &
coach_local_backend=$!
/opt/thorium-browser-avx2/thorium --headless --no-sandbox --disable-gpu --remote-debugging-address=127.0.0.1 --remote-debugging-port=19222 --user-data-dir="$coach_local_logs/profile" about:blank > "$coach_local_logs/browser.log" 2>&1 &
coach_local_browser=$!
trap 'kill "$coach_local_backend" "$coach_local_browser" 2>/dev/null || true' EXIT
for attempt in {1..30}; do
  if curl -fsS --max-time 2 http://127.0.0.1:19222/json/version >/dev/null 2>&1 && curl -fsS --max-time 2 http://127.0.0.1:15904/api/coach/local/clients >/dev/null 2>&1; then
    node scripts/tests/local-browser.mjs
    exit $?
  fi
  sleep 1
done
cat "$coach_local_logs"/*.log
exit 1
