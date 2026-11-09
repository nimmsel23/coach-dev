# backend/ — Fitness-Backend (neu)

Schlankes Python-Backend für die Webapp und die Coach-Arbeit: FastAPI + Firestore-Sync + Desktop-Meldungen.
SOT: `~/dev/backend/fitness/backend`. Start vom Parent (`~/dev/backend/fitness`),
Ziel-Port **9150**, nur `127.0.0.1`. Coach-:9150 ist ein anderer Stack (`coach-dev`).

```
cd ~/dev/backend/fitness
python3 -m backend serve [--port N]       # API (JSON unter /api, Doku unter /docs)
python3 -m backend sync pull sessions     # Firestore → lokal (einmalig); --clients --notify --dry-run
python3 -m backend sync run               # Daemon (on_snapshot) mit Reconnect; --notify --dry-run --duration N
python3 -m backend sync push sessions     # lokal → Firestore; Standard = Dry-Run, schreiben nur mit --apply --uid
python3 -m pytest backend/tests -q -p no:cacheprovider
```

## Aufbau

| Paket | Inhalt |
|---|---|
| `core/` | Settings, Session-Store (atomar, Schreib-Lock, Papierkorb), Konfliktlogik `decide()`, Klienten-Registry, Tombstones |
| `services/` | Sessions (rev→409), Auswertung pro UID, Plan, Katalog-Fassade |
| `api/` | FastAPI-App-Fabrik, Router, Schemas; liefert optional `frontend/dist` mit SPA-Fallback aus |
| `sync/` | Pull, Push, Daemon, Runner, strukturierte Logs, Lock, Firestore-Quelle/-Ziel |
| `catalog/` | Übungskatalog: lokale Experten-KB + yuhonas direkt (kein Import), schneller Index |
| `notifier/` | Workout-Inbox, Actions, Scratchpad-TUI, Waybar-Badge (siehe `notifier/README.md`) |
| `deploy/` | systemd-Unit-**Vorschläge** (nicht aktiv) |

## Routen (`/openapi.json` ist verbindlich)

```
GET    /api/health, /api/clients
GET    /api/users/{uid}/sessions[?limit&since&full]     PUT/GET/DELETE .../sessions/{doc_id}
GET    /api/users/{uid}/analytics/weekly|coverage       GET /api/users/{uid}/plan/today
GET    /api/plan, /api/plan/templates
GET    /api/catalog/exercises[/{id}], /catalog/status, /catalog/images/{pfad}
POST   /api/sync/pull      GET /api/sync/log, /api/sync/status
```
`PUT` erwartet optional `rev` (Basis-Revision): Abweichung → **409** `{current_rev}`. rev und saved_at setzt der Server.
`DELETE` ist lokal (Papierkorb + Tombstone); Firestore bleibt unberührt.

## Konfiguration (Umgebung)

`FITNESS_DATA_ROOT` (`~/.aos/fitness`) · `FITNESS_KLIENTEN_DIR` (`~/Klienten`) · `FITNESS_HOST` (`127.0.0.1`) ·
`FITNESS_PYTHON_PORT` (`9150`) · `FITNESS_FRONTEND_DIST` (`frontend/dist`) ·
`FITNESS_YUHONAS_DIR` (yuhonas-Klon) · `FITNESS_FIREBASE_CREDENTIALS` (`~/.env/firebase-fitness.json`).

## Entscheidungen (bitte nicht rückgängig machen, ohne den Grund zu kennen)

- **Kein SQLite/Alembic.** `training_history` hat keine UID-Spalte; Zeilen mehrerer Klienten kollidieren auf
  `UNIQUE(date, session_id, exercise_id)`. Die Auswertung rechnet pro UID direkt aus den Session-JSONs.
- **JSON unter `~/.aos/fitness/users/<uid>/sessions/` ist die Quelle.** Eine Konfliktfunktion `decide()` für Pull, Daemon und
  (symmetrisch) Push: `rev` zuerst; bei gleichem rev gewinnt remote nur mit nachweislich neuerem `saved_at`
  (Lehre aus dem Datenverlust vom 2026-08-23).
- **Genau ein Schreiber.** Ein Ein-Instanz-Lock für Sync-Läufe plus kurzer Schreib-Lock im Store (API ↔ Pull).
- **Löschen ist lokal.** Tombstones verhindern das Wiederauftauchen durch den Pull; eine neuere Remote-rev stellt wieder her.
- **Keine Authentifizierung.** Nur Loopback. Vor einer Veröffentlichung (Funnel o.ä.) braucht es Firebase-Token-Prüfung.
- **Firebase bleibt**; Fuel ist komplett draußen.
- Logs: `<root>/logs/fitsync.jsonl` (strukturiert, rotierend), lesbar über `GET /api/sync/log`.

## Bekanntes

- Cardio-Sessions (`activity`) zählen nicht in die Muskel-Coverage (wie bisher).
- Die alte Pfadsemantik des Frontends (`/session`, `/fitness/...`) wird bewusst nicht nachgebaut; `frontend/` nutzt `/api/...`.

## Refactor-Invarianten

- Session-Datumswerte müssen echte Kalendertage im Format `YYYY-MM-DD` sein. UIDs und Sidecar-IDs bleiben einzelne,
  sichere Dateinamenbestandteile; dieselben Regeln gelten für das ältere `fitness/`-API.
- „Letzte Session“ richtet sich nach `saved_at`, danach nach Session-Datum und lokalem Datei-Zeitstempel. Die
  Sidecar-ID ist nur der letzte stabile Gleichstands-Fallback für die Planrotation.
- Der Coverage-Cache wird durch alle verwendeten KB-Quellen invalidiert: Übungen, Inbox, Muskeldateien,
  `muscle_index.yml` und `rules/muscle_coverage_rules.yml`.
- Der Plan-Generator baut den Exercise-Index einmal pro Plan und reicht ihn an die Coverage-Berechnung weiter.
  Die gemeinsamen Dateiregeln und Sortierlogik liegen im Root-Paket `fitness.runtime`; Planner und Coverage
  liegen in `fitness.catalog`.
