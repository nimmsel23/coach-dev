#!/usr/bin/env bash
# Coach has no local staging/prod service deployment.
# Formal KB seed for ~/.aos/fitness/kb comes from this repo's catalog pin.
set -euo pipefail

ROOT="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"

usage() {
  printf '%s\n' \
    'Coach has no local staging/prod service deployment.' \
    'Use: ./deploy.sh seed-kb [--dry-run]  # seed ~/.aos/fitness/kb from fitness/catalog/kb' \
    'Or:  npm run dev locally / bin/coach-release --yes for Firebase Hosting.' >&2
}

if [[ "${1:-}" == "seed-kb" ]]; then
  shift
  DRY_RUN=false
  for arg in "$@"; do
    case "$arg" in
      --dry-run) DRY_RUN=true ;;
      *)
        printf 'Invalid argument %q. Supported: --dry-run\n' "$arg" >&2
        exit 1
        ;;
    esac
  done

  SEED_KB="$ROOT/fitness/catalog/kb"
  KB_DEST="${FITNESS_AGENT_KB:-$HOME/.aos/fitness/kb}"
  [[ -d "$SEED_KB" ]] || {
    printf 'Missing KB seed source: %s\n' "$SEED_KB" >&2
    exit 1
  }
  mkdir -p "$KB_DEST"

  if [[ "$(realpath "$SEED_KB")" == "$(realpath "$KB_DEST")" ]]; then
    printf 'Seed source equals runtime KB (%s); nothing to do.\n' "$KB_DEST"
    exit 0
  fi

  RSYNC=(rsync -aL --ignore-existing --exclude '.git' --exclude '__pycache__')
  if $DRY_RUN; then
    "${RSYNC[@]}" --dry-run -i "$SEED_KB/" "$KB_DEST/"
    printf 'Dry-run: would seed missing files into %s from %s\n' "$KB_DEST" "$SEED_KB"
  else
    "${RSYNC[@]}" "$SEED_KB/" "$KB_DEST/"
    printf 'Seeded missing files into %s from %s\n' "$KB_DEST" "$SEED_KB"
  fi
  exit 0
fi

usage
exit 1
