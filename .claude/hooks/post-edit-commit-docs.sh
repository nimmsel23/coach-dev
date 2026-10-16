#!/usr/bin/env bash
# PostToolUse hook (Edit|Write) — repo-lokal (identische Kopie in fitness-dev, coach-dev, plan-dev, 6pack-dev; REPO wird aus dem Skriptpfad abgeleitet). Committet
# automatisch, sobald eine der Session-Handoff-/Doku-Dateien geändert
# wurde: TODO.md, RESULTS.md, NEXT.md, docs/CLAUDE.md, docs/BACKEND.md.
# Zweck: diese Dateien sollen nie unkommittiert liegen bleiben — weder
# wenn der PreCompact-Hook sie nachfüllt, noch wenn Claude sie im
# laufenden Gespräch direkt editiert.
#
# Bewusst eng: kein `git add -A`, nur die exakt fünf Dateien unten. Kein
# `git push` — Commits bleiben lokal, das Pushen bleibt ein bewusster,
# separater Schritt (z.B. via fitness-release).
#
# Autorisierung: User hat diesen Hook 2026-08-31 explizit bestätigt
# (AskUserQuestion "Ja, genau so bauen"), nachdem der Auto-Mode-Classifier
# den ersten Versuch als nicht hinreichend autorisierte
# .claude/hooks/-Selbstmodifikation geblockt hatte.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"   # repo-agnostisch: Skript liegt in <repo>/.claude/hooks/
LOCK="$REPO/.claude/hooks/.commit-docs.lock"
DOC_FILES=("TODO.md" "RESULTS.md" "NEXT.md" "docs/CLAUDE.md" "docs/BACKEND.md")

input="$(cat)"
file_path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"
[ -n "$file_path" ] || exit 0

case "$file_path" in
  "$REPO"/*) rel="${file_path#"$REPO"/}" ;;
  *) exit 0 ;;
esac

is_doc=0
for f in "${DOC_FILES[@]}"; do
  [ "$rel" = "$f" ] && is_doc=1 && break
done
[ "$is_doc" -eq 1 ] || exit 0

# Parallele Sessions sind in diesem Repo der Normalfall — Lock verhindert
# ineinander verschränkte Commits, wenn zwei Sessions gleichzeitig an
# einer der fünf Dateien schreiben. Non-blocking: lieber kein Auto-Commit
# als eine hängende Session.
exec 9>"$LOCK"
flock -n 9 || exit 0

cd "$REPO"

git diff --quiet -- "$rel" 2>/dev/null && git diff --cached --quiet -- "$rel" 2>/dev/null && exit 0

git add -- "$rel"
git commit --quiet -m "$(cat <<EOF
docs: auto-update $rel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)" 2>/dev/null || true

exit 0
