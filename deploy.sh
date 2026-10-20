#!/usr/bin/env bash
# The inherited Fitness service deployment has no Coach target.
set -euo pipefail
printf '%s\n' 'Coach has no local staging/prod service deployment.' 'Use npm run dev locally or bin/coach-release --yes for Firebase Hosting.' >&2
exit 1
