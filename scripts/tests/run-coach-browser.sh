#!/usr/bin/env bash
# Launch through aos-kitty-launch; uses no real client data or login.
set -euo pipefail
cd "$(dirname "$0")/../.."
coach_test_dir=$(mktemp -d /tmp/coach-browser.XXXXXX)
coach_plan_root=$(node --input-type=module -e "import {sharedPlanRoot} from './scripts/shared-plan.mjs'; console.log(sharedPlanRoot())")
coach_test_browser=${PLAN_TEST_BROWSER:-/opt/thorium-browser-avx2/thorium}
printf 'Isolated Coach test logs: %s\n' "$coach_test_dir"
node scripts/tests/coach-browser-server.mjs > "$coach_test_dir/vite.log" 2>&1 &
coach_vite_pid=$!
python3 "$coach_plan_root/scripts/tests/browser_backend.py" > "$coach_test_dir/backend.log" 2>&1 &
coach_backend_pid=$!
"$coach_test_browser" --headless --no-sandbox --disable-gpu --remote-debugging-address=127.0.0.1 --remote-debugging-port=19222 --user-data-dir="$coach_test_dir/profile" about:blank > "$coach_test_dir/browser.log" 2>&1 &
coach_browser_pid=$!
cleanup() { kill "$coach_vite_pid" "$coach_backend_pid" "$coach_browser_pid" 2>/dev/null || true; }
trap cleanup EXIT
trap 'exit 130' INT TERM
coach_ready=false
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:19222/json/version >/dev/null 2>&1 && curl -fsS http://127.0.0.1:15915/routines >/dev/null 2>&1 && curl -fsS http://127.0.0.1:15903/scripts/tests/coach-browser.html >/dev/null 2>&1; then coach_ready=true; break; fi
  sleep 1
done
if [[ "$coach_ready" != true ]]; then cat "$coach_test_dir"/*.log; exit 1; fi
node scripts/tests/coach-browser.mjs | tee "$coach_test_dir/result.log"
