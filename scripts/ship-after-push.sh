#!/usr/bin/env bash
# ship-after-push.sh <git-push-pid> <dev-sha>
#
# Wird vom pre-push-Hook (Marker "[ship]" im letzten Commit-Betreff, oder VOS_SHIP=1) losgelöst gestartet.
# Wartet, bis der Push wirklich durch ist, und fährt dann den Release-Weg bis zum Ziel fitness-vos:
#
#   1. vos-ship fitness --yes      dev -> master (PR, Checks, Merge, Standalone-Deploy per CI)
#                                  -> vitalos (fitness-app, klassische App fitness-aos), Pointer-Bump im Meta-Repo
#   2. deploy-vos-fitness.yml      läuft durch den Pointer-Bump im Meta-Repo an -> fitness-vos.web.app (Pulse)
#                                  hier abwarten und Ergebnis melden (sonst bleibt ein roter Lauf unbemerkt)
#
# Log: ~/.cache/vos-ship/fitness-<zeitstempel>.log, Ergebnis zusätzlich als Desktop-Benachrichtigung.
# Die Mini-Apps vos-training/vos-atlas deployt deploy-miniapps.yml bei master-Push selbst.
set -uo pipefail

PUSH_PID="${1:-}"; SHA="${2:-}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
META="$HOME/vitalos"
LOGDIR="$HOME/.cache/vos-ship"; mkdir -p "$LOGDIR"
LOG="$LOGDIR/fitness-$(date +%Y%m%d-%H%M%S).log"
exec >>"$LOG" 2>&1

note() { command -v notify-send >/dev/null && notify-send -a vos-ship "$1" "$2" || true; }
fail() { echo "[ship-after-push] FEHLER: $*"; note "vos-ship fitness FEHLER" "$* — Log: $LOG"; exit 1; }

echo "[ship-after-push] $(date -Is) dev=$SHA push-pid=$PUSH_PID"

# 1. auf das Ende des Pushs warten (max. 10 Min), dann prüfen, dass dev wirklich auf origin liegt
for _ in $(seq 1 600); do
  [ -n "$PUSH_PID" ] && kill -0 "$PUSH_PID" 2>/dev/null || break
  sleep 1
done
remote_sha=$(git -C "$REPO" ls-remote origin refs/heads/dev | cut -f1)
[ "$remote_sha" = "$SHA" ] || { echo "[ship-after-push] Push nicht angekommen (origin/dev=$remote_sha) — abgebrochen."; exit 0; }

# 2. Release dev -> master -> vitalos
cd "$REPO" || fail "Repo nicht gefunden: $REPO"
vos-ship fitness --yes || fail "vos-ship fitness gescheitert"

# 3. fitness-vos: CI-Lauf zum Pointer-Bump abwarten
meta_sha=$(git -C "$META" rev-parse HEAD)
echo "[ship-after-push] Meta-Repo HEAD=$meta_sha — warte auf deploy-vos-fitness.yml"
run_id=""
for _ in $(seq 1 18); do   # bis ~3 Min auf den Start warten
  run_id=$(gh run list -R nimmsel23/vitalos --workflow deploy-vos-fitness.yml --branch master --limit 10 \
    --json databaseId,headSha --jq ".[] | select(.headSha==\"$meta_sha\") | .databaseId" | head -1)
  [ -n "$run_id" ] && break
  sleep 10
done
if [ -z "$run_id" ]; then
  echo "[ship-after-push] Kein deploy-vos-fitness-Lauf für $meta_sha (Pfadfilter greift nicht?)."
  note "vos-ship fitness fertig" "fitness-aos live; kein fitness-vos-Lauf gestartet (Pfadfilter). Log: $LOG"
  exit 0
fi
gh run watch "$run_id" -R nimmsel23/vitalos --exit-status >/dev/null \
  && { echo "[ship-after-push] fitness-vos deployt (Lauf $run_id)."; note "fitness-vos live" "Release fertig: fitness-aos + fitness-vos"; } \
  || fail "deploy-vos-fitness Lauf $run_id rot (gh run view $run_id -R nimmsel23/vitalos --log-failed)"
