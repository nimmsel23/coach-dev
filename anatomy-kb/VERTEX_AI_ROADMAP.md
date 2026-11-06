# Roadmap: Vertex AI als Ergänzung zum lokalen Gemini-Enrichment

Analog zu `fuel-dev/src/client/views/Log/VERTEX_AI_ROADMAP.md` (dort bereits
Phase 1+2 umgesetzt, Projekt `fitness-aos`). Kein Ersatz für den bestehenden
Pfad — Ergänzung, weil localhost nur dem Coach dient und nicht durchgehend
online ist.

## Ausgangslage

- `anatomy_kb/gemini.py`: reiner `httpx`-Wrapper gegen die öffentliche
  Gemini-REST-API (`generativelanguage.googleapis.com`), Auth via
  `GEMINI_API_KEY` aus `~/.env/gemini.env`. Läuft nur, wenn der lokale
  Python-Prozess (CLI/Daemon) auf diesem Rechner aktiv ist.
- `anatomy-kb` hat aktuell **kein eigenes Frontend** — Enrichment läuft nur
  über CLI-Commands (`anatomy-agent enrich <id>`) bzw. den (aktuell
  inaktiven) Daemon. Kein Browser-Trigger-Punkt vorhanden.
- Vertex AI ist im gemeinsamen Firebase-Projekt `fitness-aos` laut fuel's
  Roadmap **bereits aktiviert** (Phase 1 dort abgehakt) — kein neues
  GCP-Setup nötig, nur SDK-Integration + App Check (Phase steht bei fuel
  selbst noch offen).

## Ziel

Ein zweiter Enrichment-Pfad, der **im Browser** läuft (Firebase Vertex AI
Web SDK, `firebase/vertexai`) und unabhängig davon funktioniert, ob der
lokale `anatomy-kb`-Prozess/Server läuft. Sinnvoller Trigger-Punkt: Coach-Tab
in fitness-dev (Inbox-Review, siehe Task "Coach-Tab Gesamtaufräumung") — beim
Öffnen einer unreviewten Übung ohne Lesson (das "Rohdaten"-Popup aus
`ExerciseInsightModal.jsx`) einen "Per Vertex anreichern"-Button anbieten,
der direkt im Client gegen Vertex AI läuft und das Ergebnis in
`kb/anatomy_teaching/` bzw. Firestore `fitness/kb/exercises` schreibt (analog
zum bestehenden Coach-Approval-Rückkanal, siehe `fitness/catalog/CLAUDE.md`).

## Schritte (Vorbild fuel Phase 2+3)

1. **Firebase-Init erweitern**: in `fitness-dev/src/lib/db/firestore/*`
   (bzw. wo `firebase.js`-Äquivalent liegt) `getVertexAI(app)` analog zu
   `fuel-dev/src/client/lib/firebase.js` ergänzen.
2. **App Check**: bei fuel noch offen (Checkbox nicht abgehakt) — falls fuel
   das inzwischen nachgezogen hat, dort das Muster kopieren, sonst
   gemeinsam für beide Repos nachziehen.
3. **UI-Trigger**: neue Aktion im Coach-Inbox-Review (`InboxCard.jsx` o.ä.),
   die `getGenerativeModel(vertexAI, { model: "gemini-2.5-flash" })` mit dem
   `ENRICH_PROMPT`-Äquivalent aus `anatomy_kb/gemini.py` aufruft (Prompt
   1:1 wiederverwenden, nur Transport wechselt).
4. **Schema-Konsistenz**: Ergebnis muss dasselbe YAML/Dict-Format liefern
   wie der lokale Pfad (`origin`, `insertion`, `innervation`,
   `function_in_exercise` pro Muskel) — sonst divergieren die beiden
   Enrichment-Quellen.
5. **Schreibziel**: Cloud-Ergebnis geht nach Firestore
   (`fitness/kb/exercises`, `source: approved`), der bestehende
   `on_kb_exercises`-Listener in `firestore/mirror.py` übernimmt den Rest
   (merge nach `kb/exercises/approved_from_firebase.yml`) — kein neuer
   Schreibpfad nötig, nur ein neuer Producer.

## Nicht in Scope (bewusst)

- Kein Ersatz des lokalen `gemini.py`-Pfads — bleibt für CLI/Daemon-Batch-
  Arbeit (Bulk-Enrichment, `anatomy-agent refine`) bestehen.
- Kein eigenständiges anatomy-kb-Frontend — Trigger hängt sich an
  fitness-dev's Coach-Tab an, kein neues UI-Projekt.

## Status: Teilweise umgesetzt (2026-08-15)

**Umgesetzt** (in `fitness-dev`, nicht in `anatomy-kb` selbst): der
Exercise-Draft-Reenrich in der Coach-Inbox hat den Browser-Vertex-Fallback
jetzt. Siehe `fitness-dev/src/lib/exerciseAiEnrich.js` +
`fitness-dev/src/lib/db/firestore/inbox.js::reenrichInbox()` — fällt bei
nicht erreichbarem lokalen Backend automatisch auf
`getAI(app, { backend: new VertexAIBackend() })` (aktuelle, nicht-deprecated
Firebase-API) zurück, Prompts 1:1 aus `fitness/catalog/agent/gemini.py`
portiert, `responseSchema` statt Markdown-Fence-Parsing. Details:
`fitness-dev/src/CLAUDE.md` (Abschnitt "Vertex-AI-Enrichment-Fallback").

**Nicht umgesetzt** (weiterhin offen, anatomy-kb-spezifisch): die
Muskel-Anatomie-Anreicherung selbst (`anatomy_kb/gemini.py`,
Ursprung/Ansatz/Innervation/Funktion pro Muskel, `ENRICH_PROMPT` in dieser
Datei) hat weiterhin nur den lokalen `httpx`+`GEMINI_API_KEY`-Pfad. Kein
Browser-Trigger-Punkt vorhanden, da anatomy-kb kein eigenes Frontend hat —
würde einen UI-Anknüpfungspunkt brauchen (z.B. im Muskel-Detail des Coach-
Tabs, sobald der aufgeräumt ist, siehe `fitness-dev`s offene Coach-Tab-
Aufgabe). Bis dahin: `anatomy-agent enrich <exercise_id>` bleibt
CLI/Daemon-only, läuft nur wenn der lokale Rechner an ist — das
ursprüngliche Problem für diesen konkreten Teil besteht fort.
