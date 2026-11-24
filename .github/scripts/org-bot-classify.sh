#!/usr/bin/env bash
# Org-Bot v2: Klasse bestimmen, Branch nachziehen, mergen.
# Vorlage: nimmsel23/vos cto/tools/org-bot-classify.sh (in jedes Repo nach
# .github/scripts/org-bot-classify.sh). Doku: vos cto/ORG-BOT.md und
# cto/wissen/merge-und-pin-automatik.md.
#
# Läuft nur mit dem Org-Bot-Token und nur gegen Code aus dem Default-Branch
# (pull_request_target checkt den PR nicht aus).
#
# Klassen (org/DECISIONS/2026-11-16-merge-klassen.md):
#   A  Modus docs, keine sensiblen Pfade      -> Squash, sobald kein Check rot/offen ist
#   B  Modus code oder sensible Pfade         -> erst mit Label peer-ok; dann Auto-Merge,
#                                                ohne Branch-Schutz Squash bei grünen Checks
#   owner-gate (Label)                        -> nie
#   Pin-Bump (nur wenn .github/scripts/pin-bump-policy.sh existiert, z. B. vitalos)
#                                             -> Klasse A ohne peer-ok
#
# Liegt der PR hinter der Basis oder hat er Konflikte, zieht der Bot die
# Basis per "Update branch" nach (Merge-Commit, kein Force-Push). Bleibt ein
# Konflikt, meldet ihn der Org-Sweep in vos in genau einem Issue.
set -euo pipefail

: "${REPO:?}" "${PR:?}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$HERE/pin-bump-policy.sh" ]; then
  # shellcheck source=/dev/null
  source "$HERE/pin-bump-policy.sh"
else
  pin_files_ok() { return 1; }
  pin_actor_ok() { return 1; }
fi
if [ -f "$HERE/shell-pin-issue.sh" ]; then
  # shellcheck source=/dev/null
  source "$HERE/shell-pin-issue.sh"
else
  pin_issue_upsert() { echo "::warning::$1"; }
fi

MODE="${MODE:-docs}"
EVENT="${EVENT:-pull_request_target}"
DRY_RUN="${DRY_RUN:-}"
PREFIXES="${ORG_BOT_PREFIXES:-codex/ claude/ cursor/ agent/ vibe/ orch/ dependabot/}"

ensure_label() {
  gh label create "$1" -R "$REPO" --color "$2" --description "$3" 2>/dev/null || true
}

meta_json="$(gh pr view "$PR" -R "$REPO" --json author,headRefName,baseRefOid,headRefOid,isDraft,state,title,isCrossRepository,mergeStateStatus,labels)"
j() { printf '%s' "$meta_json" | jq -r "$1"; }
[ "$(j .state)" = "OPEN" ] || { echo "PR #${PR} ist $(j .state)."; exit 0; }
[ "$(j .isDraft)" = "true" ] && { echo "PR #${PR} ist Draft."; exit 0; }
[ "$(j .isCrossRepository)" = "true" ] && { echo "PR #${PR} kommt aus einem Fork."; exit 0; }

login="$(j .author.login)"
branch="$(j .headRefName)"
base_sha="$(j .baseRefOid)"
head_sha="$(j .headRefOid)"
title="$(j .title)"
merge_state="$(j .mergeStateStatus)"
labels="$(j '.labels[].name')"

covered=0
for p in $PREFIXES; do [[ "$branch" == "$p"* ]] && covered=1; done
[ "$covered" = 1 ] || { echo "PR #${PR}: Branch ${branch} ist kein Agenten-Branch (${PREFIXES})."; exit 0; }

has_label() { printf '%s\n' "$labels" | grep -qx "$1"; }

if has_label owner-gate; then
  echo "PR #${PR}: Label owner-gate, kein Merge."
  exit 0
fi

# Basis nachziehen: BEHIND oder DIRTY -> GitHub "Update branch" (Merge-Commit).
# Bei echtem Konflikt lehnt GitHub ab; der Org-Sweep meldet das.
if [ "$merge_state" = "BEHIND" ] || [ "$merge_state" = "DIRTY" ]; then
  if [ "$DRY_RUN" = 1 ]; then
    echo "DRY-RUN: würde Basis in #${PR} nachziehen (${merge_state})."
  elif gh api -X PUT "repos/${REPO}/pulls/${PR}/update-branch" -f expected_head_sha="$head_sha" >/dev/null 2>&1; then
    echo "PR #${PR}: Basis nachgezogen (${merge_state}); neue Checks laufen."
    exit 0
  else
    echo "::warning::PR #${PR}: ${merge_state}, Basis nicht automatisch nachziehbar (Konflikt). Org-Sweep meldet."
    exit 0
  fi
fi

files="$(gh api --paginate "repos/${REPO}/pulls/${PR}/files" -q '.[].filename')"

gitlink_ok() {
  local path="$1" sha="$2" typ url
  typ="$(gh api "repos/${REPO}/contents/${path}?ref=${sha}" -q .type 2>/dev/null || echo missing)"
  [ "$typ" = "submodule" ] || return 1
  url="$(gh api "repos/${REPO}/contents/${path}?ref=${sha}" -q .submodule_git_url)"
  [[ "$url" == *nimmsel23/* ]]
}

pin_gitlinks_ok() {
  local f
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    [ "$f" = "pnpm-lock.yaml" ] && continue
    gitlink_ok "$f" "$base_sha" || return 1
    gitlink_ok "$f" "$head_sha" || return 1
  done <<< "$files"
}

# Neueste Conclusion je Check-Name; der Bot selbst zählt nicht.
# Ausgabe: green | pending | failure | none
checks_state() {
  local sha="$1" pending=0 failed=0 seen=0 names="" name status conclusion
  while IFS=$'\t' read -r name status conclusion; do
    [ -n "$name" ] || continue
    case " $names " in *" $name "*) continue ;; esac
    names="$names $name"
    case "$name" in classify-merge | open-pr | heal | sweep) continue ;; esac
    seen=1
    if [ "$status" != "completed" ]; then pending=1; continue; fi
    case "$conclusion" in
      success | skipped | neutral) ;;
      *) failed=1; printf 'rot: %s (%s)\n' "$name" "$conclusion" >&2 ;;
    esac
  done < <(gh api "repos/${REPO}/commits/${sha}/check-runs?per_page=100" \
    -q '.check_runs | sort_by(.started_at) | reverse | .[] | [.name, .status, (.conclusion // "")] | @tsv' 2>/dev/null || true)

  local commit_state count
  count="$(gh api "repos/${REPO}/commits/${sha}/status" -q .total_count 2>/dev/null || echo 0)"
  if [ "$count" != "0" ]; then
    seen=1
    commit_state="$(gh api "repos/${REPO}/commits/${sha}/status" -q .state)"
    case "$commit_state" in failure | error) failed=1 ;; pending) pending=1 ;; esac
  fi
  if [ "$failed" = 1 ]; then echo failure
  elif [ "$pending" = 1 ]; then echo pending
  elif [ "$seen" = 1 ]; then echo green
  else echo none
  fi
}

# Direkt nach dem Öffnen sind noch nicht alle Checks angemeldet: auf PR-Events
# kurz warten und "keine Checks" als "laufen noch" werten. Der Stunden-Sweep
# und die Check-Events mergen danach.
settled_checks() {
  local st
  st="$(checks_state "$head_sha" 2>/tmp/org-checks.txt || true)"
  if [ "$EVENT" = "pull_request_target" ]; then
    if [ "$st" = "green" ] || [ "$st" = "none" ]; then
      sleep "${PIN_CHECK_SETTLE_SECONDS:-25}"
      st="$(checks_state "$head_sha" 2>/tmp/org-checks.txt || true)"
    fi
    [ "$st" = "none" ] && st=pending
  fi
  echo "$st"
}

squash() {
  local cls="$1"
  if [ "$DRY_RUN" = 1 ]; then echo "DRY-RUN: würde #${PR} squash-mergen (Klasse ${cls})."; return 0; fi
  ensure_label "merge:$cls" C2E0C6 "Vom Org-Bot gemergt (Klasse $cls)"
  gh pr edit "$PR" -R "$REPO" --add-label "merge:$cls" >/dev/null 2>&1 || true
  gh pr merge "$PR" -R "$REPO" --squash --delete-branch && return 0
  [ "$(gh pr view "$PR" -R "$REPO" --json state -q .state)" = "MERGED" ]
}

# --- Pin-Bump (nur Repos mit pin-bump-policy.sh) ---------------------------
if pin_files_ok "$files" && pin_actor_ok "$login" "$branch" && pin_gitlinks_ok; then
  echo "PR #${PR}: Pin-Bump Klasse A (${login}, ${branch}). Kein peer-ok."
  state="$(settled_checks)"
  case "$state" in
    green|none) squash A || pin_issue_upsert "$(printf 'PR #%s konnte nicht gemergt werden (%s).\n%s' "$PR" "$title" "https://github.com/${REPO}/pull/${PR}")" ;;
    pending) echo "PR #${PR}: Checks laufen noch." ;;
    *) pin_issue_upsert "$(printf 'PR #%s (%s) hat rote Checks.\n%s\n%s\n' "$PR" "$title" "https://github.com/${REPO}/pull/${PR}" "$(cat /tmp/org-checks.txt 2>/dev/null || true)")" ;;
  esac
  exit 0
fi

# --- Klassen A/B -------------------------------------------------------------
class=A
[ "$MODE" = "code" ] && class=B
reason=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  case "$f" in
    .github/workflows/*|firebase.json|.firebaserc|*/firebase.json|*/.firebaserc|\
    *.env|*.env.*|*secret*|*Secret*|*credential*|*.pem|*.key|*keystore*|*.jks|\
    AGENTS.md|org/OWNER-CONTRACT.md|dashboard/publish.sh|*datenschutz*|*privacy*)
      class=B; reason="$reason $f" ;;
  esac
done <<< "$files"

if [ "$class" = "B" ] && ! has_label peer-ok; then
  ensure_label peer-ok 0E8A16 "Klasse B: von einem anderen Agenten als dem Autor geprüft"
  ensure_label needs-peer FBCA04 "Klasse B: braucht Prüfung durch einen anderen Agenten"
  if [ -n "$reason" ] && ! has_label needs-peer && [ "$DRY_RUN" != 1 ]; then
    gh pr edit "$PR" -R "$REPO" --add-label needs-peer >/dev/null || true
  fi
  echo "PR #${PR}: Klasse B, wartet auf peer-ok.${reason}"
  exit 0
fi

state="$(settled_checks)"
echo "PR #${PR}: Klasse ${class}, Checks ${state}."
case "$state" in
  pending) echo "Checks laufen noch; der nächste Check-Event oder der Stunden-Sweep merged."; exit 0 ;;
  failure) cat /tmp/org-checks.txt >&2 || true; echo "Checks rot: kein Merge."; exit 0 ;;
esac

if [ "$class" = "A" ]; then
  squash A
  exit 0
fi

# Klasse B mit peer-ok: zuerst Auto-Merge (wartet auf Pflicht-Checks, falls
# Branch-Schutz gesetzt). Ohne Branch-Schutz nur bei grünen Checks direkt.
if [ "$DRY_RUN" != 1 ] && gh pr merge "$PR" -R "$REPO" --squash --auto --delete-branch 2>/dev/null; then
  ensure_label "merge:B" C2E0C6 "Vom Org-Bot gemergt (Klasse B)"
  gh pr edit "$PR" -R "$REPO" --add-label "merge:B" >/dev/null 2>&1 || true
  echo "PR #${PR}: Auto-Merge eingereiht."
  exit 0
fi
if [ "$state" = "green" ]; then
  squash B
else
  echo "::warning::PR #${PR}: Klasse B ohne einen einzigen Check. Kein Merge; Repo braucht check.yml (Org-Sweep meldet)."
fi
