#!/usr/bin/env bash
# Pull full FMA OWL (Git LFS) into vendor/fma — optional, ~200MB.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/vendor/fma"
if ! command -v git-lfs >/dev/null 2>&1; then
  echo "git-lfs missing — install then re-run" >&2
  exit 1
fi
git lfs install --local
git lfs pull
ls -lh fma.owl pun_fma.owl
