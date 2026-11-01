#!/usr/bin/env bash
# deploy.sh — Fitness deployment (staging/prod FastAPI server)
set -euo pipefail

# Default to staging target
TARGET="${1:-staging}"
BUILD_BEFORE_DEPLOY=false
DRY_RUN=false

shift_count=0
if [[ $# -gt 0 ]]; then
  shift_count=1
fi
if [[ $shift_count -gt 0 ]]; then
  shift
fi

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      ;;
    --build-yes)
      BUILD_BEFORE_DEPLOY=true
      ;;
    *)
      printf '\033[1;31m%s\033[0m\n' "Invalid argument '$arg'. Supported: --build-yes | --dry-run" >&2
      exit 1
      ;;
  esac
done

if [[ "$TARGET" == "prod" ]]; then
  DEST="/opt/fitness"
  SERVICE="fitness.service"
  USE_SUDO=true
  PORT=6100
elif [[ "$TARGET" == "staging" ]]; then
  DEST="$HOME/.local/fitness"
  SERVICE="fitness-preview.service"
  USE_SUDO=false
  PORT=8100
else
  printf '\033[1;31m%s\033[0m\n' "Invalid target '$TARGET'. Use: staging | prod" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"
DEV_SOURCE="${HOME}/dev/fitness-dev"
STAGING_SOURCE="${HOME}/.local/fitness"

msg() { printf '\033[1;32m%s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*" >&2; }
die() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

require_file() {
  local path="$1"
  local label="${2:-$1}"
  [[ -f "$path" ]] || die "❌ Missing $label at $path"
  msg "✅ $label present: $path"
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-20}"
  local sleep_s="${4:-1}"
  local body=""
  local i

  for ((i = 1; i <= attempts; i++)); do
    if body="$(curl -fsS --max-time 2 "$url" 2>/dev/null)"; then
      msg "✅ $label healthy: $url"
      printf '%s\n' "$body"
      return 0
    fi
    sleep "$sleep_s"
  done

  die "❌ $label did not become healthy: $url"
}

systemd_status() {
  local action="$1"
  shift
  if $USE_SUDO; then
    sudo systemctl "$action" "$@"
  else
    systemctl --user "$action" "$@"
  fi
}

systemd_list_unit_files() {
  local unit="$1"
  if $USE_SUDO; then
    systemctl list-unit-files "$unit"
  else
    systemctl --user list-unit-files "$unit"
  fi
}

print_systemd_failure_context() {
  local unit="$1"
  warn "⚠️ systemd status for $unit"
  if $USE_SUDO; then
    sudo systemctl status "$unit" --no-pager || true
    warn "⚠️ recent journal for $unit"
    sudo journalctl -u "$unit" -n 40 --no-pager || true
  else
    systemctl --user status "$unit" --no-pager || true
    warn "⚠️ recent journal for $unit"
    journalctl --user -u "$unit" -n 40 --no-pager || true
  fi
}

if [[ "$TARGET" == "staging" ]]; then
  SOURCE="$SCRIPT_DIR"
  if [[ "$SCRIPT_DIR" != "$DEV_SOURCE" && -f "$DEV_SOURCE/package.json" ]]; then
    SOURCE="$DEV_SOURCE"
  fi
elif [[ "$TARGET" == "prod" ]]; then
  SOURCE="$SCRIPT_DIR"
  if [[ "$SCRIPT_DIR" != "$STAGING_SOURCE" && -f "$STAGING_SOURCE/pyproject.toml" ]]; then
    SOURCE="$STAGING_SOURCE"
  fi
fi

[[ -f "$SOURCE/pyproject.toml" ]] || die "Deployment source '$SOURCE' is not a fitness checkout"

run_cmd() {
  if $USE_SUDO; then
    sudo "$@"
  else
    "$@"
  fi
}

msg "🚀 Starting Fitness Deployment to $TARGET ($DEST)"
msg "📍 Using source checkout $SOURCE"

# Build-Strategie: --build-yes erzwingt einen frischen Build. Ohne Flag gilt
# beim Prod-Deploy aus dem Staging-Checkout (SOURCE == STAGING_SOURCE) die
# Ausnahme — $SOURCE/dist wurde bereits beim vorherigen staging-Deploy gebaut,
# kein doppelter Build nötig, nur übernehmen und weiterreichen an prod. In
# allen anderen Fällen ohne Flag wird das vorhandene dist/ unverändert
# übernommen (mit Warnung, damit ein veraltetes dist/ nicht unbemerkt bleibt).
if $BUILD_BEFORE_DEPLOY && ! $DRY_RUN; then
  require_file "$SOURCE/package.json" "build checkout (build in dev, then deploy staging → prod)"
  msg "🔨 Building UI in $SOURCE"
  (
    cd "$SOURCE"
    pnpm run build > /dev/null
  )
elif [[ "$TARGET" == "prod" && "$SOURCE" == "$STAGING_SOURCE" && -d "$SOURCE/dist" ]]; then
  msg "⏭️  Build übersprungen — nutze bereits vorhandenes $SOURCE/dist (aus dem staging-Deploy)"
elif [[ ! -d "$SOURCE/dist" ]]; then
  warn "⚠️ No dist/ directory found in $SOURCE. Deploy will use the current checkout state without building."
else
  dist_mtime=$(stat -c '%y' "$SOURCE/dist" 2>/dev/null | cut -d'.' -f1 || true)
  if [[ -n "$dist_mtime" ]]; then
    warn "⚠️ Deploying existing dist/ from $dist_mtime (no build was run)."
  else
    warn "⚠️ Deploying existing dist/ without rebuild (timestamp unavailable)."
  fi
fi

# Runtime payload only. Build in the source checkout; never copy its toolchains.
# Keep this allowlist explicit so new frontend/modules/media directories cannot
# silently become part of the installed product.
RSYNC_RUNTIME=(
  --exclude '*.bak*' --exclude '*.map' --exclude '.claude' --exclude '.codex'
  --filter 'P /.git/***'
  --filter 'P /.venv/***'
  --filter 'P /.env*'
  --filter 'P /data/***'
  --filter 'P /fitness/catalog/kb/***'
  --filter 'P /fitness/catalog/state/***'
  --exclude '__pycache__' --exclude '*.pyc' --exclude 'tests'
  --exclude '.git' --exclude 'node_modules' --exclude '.venv'
  --exclude '/fitness/catalog/kb' --exclude '/fitness/catalog/state'
  --include '/dist/***'
  --include '/fitness/catalog/dist/***'
  --include '/fitness/catalog/config.yml'
  --include '/fitness/catalog/data_source_priority.yml'
  --include '/fitness/catalog/py.typed'
  --include '/fitness/' --include '/fitness/**/' --include '/fitness/**.py'
  --include '/backend/sync/assets/logo.png'
  --include '/backend/' --include '/backend/**/' --include '/backend/**.py'
  --include '/db/' --include '/db/**/' --include '/db/**.py'
  --include '/anatomy-kb/' --include '/anatomy-kb/anatomy_kb/'
  --include '/anatomy-kb/anatomy_kb/**/' --include '/anatomy-kb/anatomy_kb/**.py'
  --include '/scripts/' --include '/scripts/build-catalog.py'
  --include '/pyproject.toml' --include '/README.md'
  --exclude '*'
)
require_file "$SOURCE/dist/index.html" "built frontend dist (build in dev first)"
require_file "$SOURCE/pyproject.toml" "Python runtime manifest"

if $DRY_RUN; then
  msg "🧪 Runtime payload (no writes, installs or restarts)"
  rsync -ani --delete --delete-excluded "${RSYNC_RUNTIME[@]}" "$SOURCE/" "$DEST/"
  exit 0
fi

if [[ ! -d "$DEST" ]]; then
  run_cmd mkdir -p "$DEST"
  run_cmd chown "$(id -u):$(id -g)" "$DEST"
fi
msg "📦 Syncing runtime files from $SOURCE → $DEST"
# --delete-excluded removes old source/build-tool leftovers; P rules above
# explicitly protect installed environments, configuration and runtime links.
run_cmd rsync -aL --delete --delete-excluded "${RSYNC_RUNTIME[@]}" "$SOURCE/" "$DEST/"

# Central laptop-owned data survives deployments and removal of source repos.
# Seed only missing files; never overwrite local approvals/enrichment.
KB_SOURCE="$HOME/.aos/fitness/kb"
STATE_SOURCE="$HOME/.aos/fitness/agent-state"
KB_LINK="$DEST/fitness/catalog/kb"
STATE_LINK="$DEST/fitness/catalog/state"
mkdir -p "$KB_SOURCE" "$STATE_SOURCE"
SEED_KB="$SOURCE/fitness/catalog/kb"
[[ -d "$SEED_KB" ]] || SEED_KB="$DEV_SOURCE/fitness/catalog/kb"
if [[ -d "$SEED_KB" && "$(realpath "$SEED_KB")" != "$(realpath "$KB_SOURCE")" ]]; then
  rsync -aL --ignore-existing --exclude '.git' --exclude '__pycache__' "$SEED_KB/" "$KB_SOURCE/"
fi

# Detach only old links before wheel packaging; refuse to erase real data.
for link in "$KB_LINK" "$STATE_LINK"; do
  if [[ -L "$link" ]]; then
    run_cmd rm "$link"
  elif [[ -e "$link" ]]; then
    die "Existing data directory $link must be migrated to ~/.aos/fitness before deployment"
  fi
done

msg "📦 Installing Python runtime (no Node/Vite installation)"
(
  cd "$DEST"
  if command -v uv &> /dev/null; then
    [[ -x .venv/bin/python ]] || uv venv --quiet
    uv pip install . --quiet
  else
    [[ -x .venv/bin/python ]] || python3 -m venv .venv
    ./.venv/bin/python -m pip install . --quiet
  fi
)
run_cmd ln -s "$KB_SOURCE" "$KB_LINK"
run_cmd ln -s "$STATE_SOURCE" "$STATE_LINK"
require_file "$DEST/dist/index.html" "installed frontend"

# 3b. Systemd-Unit sicherstellen (staging + prod, beide inline hier statt
# extern getrackt — staging lag vorher via ~/.dotfiles-Symlink, prod-Inhalt
# war dupliziert in fitness-prodctl). Diff-Check vor dem Schreiben, damit
# ein unveraendertes deploy.sh-staging/-prod nicht bei jedem Lauf einen
# unnoetigen daemon-reload ausloest.
if [[ "$TARGET" == "staging" ]]; then
  UNIT_PATH="$HOME/.config/systemd/user/$SERVICE"
  UNIT_CONTENT="[Unit]
Description=Fitness Centre Preview Service (FastAPI :$PORT)
After=network.target

[Service]
Type=simple
WorkingDirectory=$DEST
ExecStart=$DEST/.venv/bin/python3 -m uvicorn fitness.api.main:app --host 127.0.0.1 --port $PORT --no-access-log
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=FITNESS_ENV=staging
Environment=FITNESS_PYTHON_PORT=$PORT
Environment=FITNESS_DATA_DIR=$HOME/.aos/fitness
Environment=FITNESS_AGENT_KB=$HOME/.aos/fitness/kb
Environment=FITNESS_SKIP_WATCHERS=1
Environment=FITNESS_SYNC_OWNER=1

[Install]
WantedBy=default.target
"
elif [[ "$TARGET" == "prod" ]]; then
  UNIT_PATH="/etc/systemd/system/$SERVICE"
  UNIT_CONTENT="[Unit]
Description=Fitness Prod App (Python/FastAPI, serves API + built frontend from /opt/fitness)
After=network.target

[Service]
Type=simple
User=alpha
WorkingDirectory=$DEST
ExecStart=$DEST/.venv/bin/python -m uvicorn fitness.api.main:app --host 0.0.0.0 --port $PORT --no-access-log
Restart=on-failure
RestartSec=2
Environment=FITNESS_ENV=prod
Environment=FITNESS_PYTHON_PORT=$PORT
Environment=FITNESS_AGENT_KB=$HOME/.aos/fitness/kb
Environment=FITNESS_SKIP_WATCHERS=1
EnvironmentFile=-/etc/aos/fitness.env

[Install]
WantedBy=multi-user.target
"
fi

if [[ "$(cat "$UNIT_PATH" 2>/dev/null || true)" == "$(printf '%s' "$UNIT_CONTENT")" ]]; then
  msg "🧩 Unit $SERVICE bereits aktuell"
else
  msg "🧩 Schreibe/aktualisiere systemd Unit $SERVICE"
  if $USE_SUDO; then
    printf '%s\n' "$UNIT_CONTENT" | sudo tee "$UNIT_PATH" >/dev/null
  else
    mkdir -p "$(dirname "$UNIT_PATH")"
    printf '%s\n' "$UNIT_CONTENT" > "$UNIT_PATH"
  fi
fi

# 4. Restart Service
if $USE_SUDO; then
  if systemctl list-unit-files "$SERVICE" >/dev/null 2>&1; then
    msg "🔄 Restarting system-scope $SERVICE (sudo)"
    sudo systemctl daemon-reload
    sudo systemctl restart "$SERVICE"
  else
    warn "⚠️ System-scope $SERVICE not found. Skipping restart."
  fi
else
  if systemd_list_unit_files "$SERVICE" >/dev/null 2>&1; then
    msg "🔄 Restarting user-scope $SERVICE"
    systemctl --user daemon-reload
    systemctl --user restart "$SERVICE"
  else
    warn "⚠️ User-scope $SERVICE not found. Skipping restart."
  fi
fi

msg "🩺 Verifying runtime on :$PORT"
if systemd_list_unit_files "$SERVICE" >/dev/null 2>&1; then
  if ! systemd_status is-active --quiet "$SERVICE"; then
    print_systemd_failure_context "$SERVICE"
    die "❌ $SERVICE is not active after deploy"
  fi
fi

wait_for_http "http://127.0.0.1:$PORT/health" "Fitness $TARGET health" >/dev/null

msg "✅ Deployment to $DEST complete on port $PORT."
