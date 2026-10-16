#!/usr/bin/env bash
# PreCompact hook — repo-lokal (identische Kopie in fitness-dev, coach-dev, plan-dev, 6pack-dev; REPO wird aus dem Skriptpfad abgeleitet) (registriert in
# .claude/settings.json, NICHT in ~/.claude/settings.json). Zweck: ein
# Handoff-Mechanismus, damit ein ANDERER Agent (neue Session, nach einem
# Compact) nahtlos weiterarbeiten kann, ohne den wegkomprimierten Kontext
# zu brauchen. Modell: TODO.md sagt was zu tun ist -> Arbeit passiert ->
# RESULTS.md erklärt was tatsächlich gemacht wurde -> NEXT.md hält fest,
# was davon offen geblieben ist (baut auf RESULTS.md auf, kommt danach).
#
# Bewusst NICHT: ~/RESULTS.md, ~/NEXT.md, ~/TODO.md (globale, projekt-
# übergreifende Dateien — fasst dieser Hook nicht an).
#
# Autorisierung: User hat diesen Ansatz (headless claude -p mit
# --dangerously-skip-permissions, eng auf Read/Edit + drei feste Dateien
# beschränkt) 2026-08-31 explizit gewählt, nachdem der Auto-Mode-
# Classifier den ersten Versuch ohne diese Rückfrage blockiert hatte.
#
# Update 2026-10-13: Primärer `claude -p`-Pfad lief seit 2026-09-24
# stillschweigend nicht mehr durch (letzter "docs: auto-update"-Commit),
# vermutlich weil non-interaktive --dangerously-skip-permissions-Läufe
# zwischenzeitlich vom Auto-Mode-Classifier blockiert werden können — der
# alte Code hatte dafür `>/dev/null 2>&1 || true`, also NULL Sichtbarkeit.
# Jetzt: (1) Logging in pre-compact-fill-docs.log, (2) Gemini-REST-Fallback
# (~/.env/gemini.env, Pattern wie anatomy-kb/anatomy_kb/gemini.py — reines
# curl+jq, kein SDK nötig) falls claude -p nichts an den 3 Dateien ändert,
# (3) unabhängig davon ein kurzer Gemini-"Blinde-Flecken"-Review, der
# Claude-typische Selbstberichts-Lücken (Dinge, die die eigene Session
# übersieht, weil sie über sich selbst berichtet) separat markiert in
# NEXT.md ergänzt — auf User-Wunsch, da ein zweites Modell andere Lücken
# sieht als das, das gerade an der Sache gearbeitet hat.
# User-Bestätigung für diese Überarbeitung: 2026-10-13, "Ja, anlegen" +
# explizite Freigabe von .claude/hooks/*.sh als Write-Target, nachdem der
# Auto-Mode-Classifier zwei Schreibversuche zuvor blockiert hatte.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"   # repo-agnostisch: Skript liegt in <repo>/.claude/hooks/
LOCK="$REPO/.claude/hooks/.fill-docs.lock"
LOG="$REPO/.claude/hooks/pre-compact-fill-docs.log"
GEMINI_ENV="$HOME/.env/gemini.env"
GEMINI_MODELS=(gemini-2.5-flash gemini-flash-lite-latest) # 2.0-flash(-001) abgeschaltet (404), 2.5-flash-lite/2.5-pro nicht für neue Nutzer (Stand 2026-10-16)

log() { printf '%s [%s] %s\n' "$(date -Is)" "$$" "$1" >> "$LOG" 2>/dev/null || true; }

input="$(cat)"
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null || true)"

[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0

exec 9>"$LOCK"
flock -n 9 || { log "skip: lock busy"; exit 0; }

cd "$REPO" || exit 0

# Nichts zu dokumentieren, wenn weder das Arbeitsverzeichnis dirty ist noch
# kürzlich (letzte 2h) etwas committet wurde — vermeidet leere/erfundene
# Einträge bei reinen Rechercheseinen ohne Code-/Doku-Änderung.
dirty="$(git status --porcelain 2>/dev/null || true)"
recent_commit="$(git log -1 --since="2 hours ago" --format=%H 2>/dev/null || true)"
if [ -z "$dirty" ] && [ -z "$recent_commit" ]; then
  log "skip: nothing dirty/recent"
  exit 0
fi

snapshot() { md5sum RESULTS.md TODO.md NEXT.md 2>/dev/null; }
before="$(snapshot)"

claude_ok=0
if command -v claude >/dev/null 2>&1; then
  claude -p "Lies das vollständige Transcript dieser Claude-Code-Session: $transcript
(JSONL-Format, ein Eintrag pro Zeile).

Kontext/Zweck: RESULTS.md, TODO.md und NEXT.md in $REPO sind der Handoff
zwischen Sessions — ein anderer Agent soll nach einem Compact allein
daraus weiterarbeiten können, ohne dieses Transcript gesehen zu haben.
Denkmodell: TODO.md sagt was insgesamt zu tun ist -> hier ist Arbeit
passiert -> RESULTS.md erklärt was davon tatsächlich gemacht wurde ->
NEXT.md hält danach fest, was offen geblieben ist. Bearbeite die drei
Dateien in GENAU dieser Reihenfolge:

1. RESULTS.md: Füge GANZ OBEN (vor der ersten bestehenden '# '-Überschrift)
   einen neuen Eintrag ein, im exakt selben Format wie die bestehenden
   Einträge (# Titel (Datum), kurzer Prolog-Absatz, danach eine
   Bullet-Liste mit **Datei/Komponente**-Fettung für die konkreten
   Änderungen, danach eine '---'-Trennzeile). Fasse zusammen was
   TATSÄCHLICH an Code/Doku/System geändert wurde — nicht was diskutiert,
   sondern was umgesetzt wurde. Heutiges Datum. Gibt es schon einen
   Eintrag zum selben Thema mit selbem Datum (z.B. weil eine parallele
   Session das schon geschrieben hat) — nicht doppeln, überspringen.

2. TODO.md: NUR ergänzen, wenn im Transcript ein echter neuer Makro-Punkt
   auftaucht (grundlegend neues Vorhaben/Feature-Idee, keine Detail-
   Aufgabe, keine bloße Bugfix-Randnotiz) — im bestehenden Stil
   ('# [ ] Titel' + kurze Beschreibung). Im Zweifel NICHTS ändern, das ist
   kuratierter User-Content, kein Auto-Log.

3. NEXT.md: erst NACHDEM RESULTS.md geschrieben ist, daraus ableiten was
   aus dieser Session offen/unfertig geblieben ist (explizit genannte
   offene Punkte, vertagte Entscheidungen, bekannte Lücken) und als
   Bullet(s) im bestehenden Stil der Datei ergänzen. Erledigte, bereits in
   RESULTS.md abgeschlossene Punkte NICHT hier duplizieren.

Regeln: Nur diese drei Dateien in $REPO anfassen (RESULTS.md, TODO.md,
NEXT.md), sonst nichts. Kein git add/commit. Keine Rückfragen — triff die
Entscheidung selbst, im Zweifel weniger/vorsichtiger schreiben statt mehr.
Gib am Ende nur eine einzige Zeile 'done' aus, keine weitere Erklärung." \
    --allowedTools "Read,Edit" \
    --dangerously-skip-permissions \
    >>"$LOG" 2>&1
  claude_exit=$?
  after="$(snapshot)"
  if [ "$claude_exit" -eq 0 ] && [ "$before" != "$after" ]; then
    claude_ok=1
    log "claude -p: ok, docs changed"
  else
    log "claude -p: exit=$claude_exit, docs unchanged -> gemini fallback"
  fi
else
  log "claude binary not found -> gemini fallback"
fi

# --- Gemini-Helfer -----------------------------------------------------
# Reines REST (curl+jq), kein SDK nötig — gleiches Prinzip wie
# anatomy-kb/anatomy_kb/gemini.py (call_with_fallback über FALLBACK_MODELS).
gemini_available() {
  [ -f "$GEMINI_ENV" ] && command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1
}

gemini_call() {
  # $1 = prompt text; Ausgabe: generierter Text auf stdout, leer bei Fehler.
  # Der Prompt geht über stdin->Datei, NIE als argv (jq --arg / curl -d "$body"): Linux begrenzt ein
  # einzelnes Argument auf 131072 Bytes, große Transcript-Ausschnitte sprengten das still
  # ("Argument list too long", vom alten 2>/dev/null verschluckt) -> alle Modelle "fehlgeschlagen".
  # Fix 2026-10-16. Fehlerursache je Modell landet jetzt im Log.
  local prompt="$1"
  ( set -a; . "$GEMINI_ENV"; set +a
    [ -n "${GEMINI_API_KEY:-}" ] || exit 1
    local models=("${GEMINI_MODEL:-gemini-2.5-flash}" "${GEMINI_MODELS[@]}")
    local bodyf resp text model
    bodyf="$(mktemp)" || exit 1
    trap 'rm -f "$bodyf"' EXIT
    printf '%s' "$prompt" | jq -Rs '{contents:[{parts:[{text:.}]}], generationConfig:{temperature:0.3,maxOutputTokens:4096}}' > "$bodyf" 2>/dev/null \
      || { log "gemini: Request-Body konnte nicht gebaut werden"; exit 1; }
    for model in "${models[@]}"; do
      resp="$(curl -sS --max-time 90 \
        "https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}" \
        -H "Content-Type: application/json" --data-binary @"$bodyf" 2>&1 || true)"
      text="$(printf '%s' "$resp" | jq -r '.candidates[0].content.parts[0].text // empty' 2>/dev/null || true)"
      if [ -n "$text" ]; then
        printf '%s' "$text"
        exit 0
      fi
      log "gemini $model: kein Text ($(printf '%s' "$resp" | jq -r '(.error.status // .candidates[0].finishReason // "unbekannt") + " " + ((.error.message // "")[0:100])' 2>/dev/null || printf '%s' "$resp" | head -c 100))"
    done
    exit 1
  )
}

extract_block() {
  # $1 = text, $2 = marker name -> Inhalt zwischen ===NAME_START=== / ===NAME_END===
  printf '%s' "$1" | awk -v m="$2" '
    $0 ~ "===" m "_START===" { capture=1; next }
    $0 ~ "===" m "_END===" { capture=0 }
    capture { print }
  '
}

# --- Schritt 1: Voller Gemini-Fallback, wenn claude -p nicht gegriffen hat
if [ "$claude_ok" -eq 0 ] && gemini_available; then
  transcript_tail="$(tail -c 200000 "$transcript" 2>/dev/null || true)"
  results_head="$(head -n 60 RESULTS.md 2>/dev/null || true)"
  todo_full="$(cat TODO.md 2>/dev/null || true)"
  next_full="$(cat NEXT.md 2>/dev/null || true)"

  fallback_prompt="Du übernimmst einen fehlgeschlagenen Doku-Update-Job (das primäre Tool war blockiert/nicht verfügbar).
Lies den folgenden Ausschnitt eines Claude-Code-Session-Transcripts (JSONL, ggf. am Anfang abgeschnitten) und pflege daraus die Session-Handoff-Dateien eines Repos.

TRANSCRIPT (Ausschnitt, ggf. gekürzt):
$transcript_tail

AKTUELLER RESULTS.md-KOPF (Stil-Vorlage, erste 60 Zeilen):
$results_head

AKTUELLE TODO.md (voll):
$todo_full

AKTUELLE NEXT.md (voll):
$next_full

Aufgabe: Gib GENAU drei Blöcke aus, exakt in diesem Format (leerer Block
wenn nichts Sinnvolles zu ergänzen ist — lieber leer als erfunden):

===RESULTS_START===
(neuer RESULTS.md-Eintrag im Stil der Vorlage oben: '# Titel (Datum)' +
Prolog-Absatz + Bullet-Liste mit **Fettung** für Datei/Komponente + '---'
am Ende. Nur was TATSÄCHLICH umgesetzt wurde, nicht was diskutiert wurde.
Heutiges Datum. Leer lassen, wenn aus dem Transcript keine konkrete
Code-/Doku-Änderung hervorgeht.)
===RESULTS_END===
===TODO_START===
(nur bei echtem neuen Makro-Punkt, Stil '# [ ] Titel' + kurze
Beschreibung. Im Zweifel leer lassen.)
===TODO_END===
===NEXT_START===
(Bullet(s) im bestehenden Stil von NEXT.md für offen gebliebene Punkte
dieser Session. Keine bereits erledigten Punkte duplizieren.)
===NEXT_END===

Keine weitere Erklärung, kein Text außerhalb der drei Blöcke."

  gemini_out="$(gemini_call "$fallback_prompt" || true)"
  if [ -n "$gemini_out" ]; then
    results_block="$(extract_block "$gemini_out" RESULTS)"
    todo_block="$(extract_block "$gemini_out" TODO)"
    next_block="$(extract_block "$gemini_out" NEXT)"

    if printf '%s' "$results_block" | grep -q '[^[:space:]]'; then
      { printf '%s\n\n' "$results_block"; cat RESULTS.md 2>/dev/null; } > RESULTS.md.tmp && mv RESULTS.md.tmp RESULTS.md
      log "gemini fallback: RESULTS.md ergänzt"
    fi
    if printf '%s' "$todo_block" | grep -q '[^[:space:]]'; then
      printf '\n%s\n' "$todo_block" >> TODO.md && log "gemini fallback: TODO.md ergänzt"
    fi
    if printf '%s' "$next_block" | grep -q '[^[:space:]]'; then
      printf '\n%s\n' "$next_block" >> NEXT.md && log "gemini fallback: NEXT.md ergänzt"
    fi
  else
    log "gemini fallback: kein Ergebnis (API-Key fehlt oder alle Modelle fehlgeschlagen)"
  fi
fi

# --- Schritt 2: Unabhängig vom Ergebnis oben — kurzer Gemini-Review auf
# Claude-typische blinde Flecken (Selbstbericht-Bias). Max 1x pro Tag.
today="$(date +%Y-%m-%d)"
if gemini_available && ! grep -q "Gemini-Review.*($today)" NEXT.md 2>/dev/null; then
  transcript_tail="$(tail -c 120000 "$transcript" 2>/dev/null || true)"
  results_top="$(awk '/^---$/{exit} {print}' RESULTS.md 2>/dev/null || true)"

  review_prompt="Du bist ein zweites, unabhängiges Modell (Gemini), das einen Claude-Code-Session-Verlauf
UND dessen eigene Selbstzusammenfassung gegenliest — gezielt um Dinge zu finden, die eine
Session über sich selbst typischerweise NICHT berichtet (Selbstbericht-Bias): übersehene
Edge-Cases, ungeprüfte Annahmen, nicht wirklich verifizierte Behauptungen ('sollte
funktionieren' ohne Test), Stellen wo nur ein Teil des Problems angefasst wurde.

TRANSCRIPT-AUSSCHNITT:
$transcript_tail

CLAUDE'S EIGENE ZUSAMMENFASSUNG (aktueller RESULTS.md-Kopf):
$results_top

Gib NUR aus (keine weitere Erklärung):
===REVIEW_START===
(maximal 3 kurze Bullet-Punkte mit konkreten blinden Flecken/Lücken, die du siehst.
Leer lassen, wenn du wirklich nichts Substanzielles findest — nicht erfinden,
keine generischen Plattitüden.)
===REVIEW_END==="

  gemini_review="$(gemini_call "$review_prompt" || true)"
  if [ -n "$gemini_review" ]; then
    review_block="$(extract_block "$gemini_review" REVIEW)"
    if printf '%s' "$review_block" | grep -q '[^[:space:]]'; then
      {
        printf '\n**Gemini-Review (potenzielle blinde Flecken, %s):**\n' "$today"
        printf '%s\n' "$review_block"
      } >> NEXT.md
      log "gemini review: NEXT.md ergänzt"
    else
      log "gemini review: nichts Substanzielles gefunden"
    fi
  else
    log "gemini review: kein Ergebnis"
  fi
fi

# Log-Datei klein halten (letzte 500 Zeilen)
if [ -f "$LOG" ]; then
  tail -n 500 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
fi

exit 0
