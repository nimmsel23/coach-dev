# fitness/ — Fitness Domain unter Coach

```
~/dev/coach-dev/backend/fitness/   # Python-Paket `fitness` (API + CLIs + Catalog)
```

Trainings-Domain: Exercise-KB, Sessions, Coaching, Coverage, Firestore-Sync,
FastAPI. Pendant zu `fuel`. Gebaut aus `~/dev/coach-dev/pyproject.toml`.

## Kann

| Bereich | Was |
|---|---|
| Catalog / KB | Übungen enrich/inbox/teaching/graveyard (`catalog/kb` Submodule) |
| Sessions | Kraft/Cardio loggen, History SQLite, Woche/Stats |
| Coaching | Plans, Macrocycles, Routines/Workouts/Sets, Feedback/Drafts |
| Coverage | Muskelabdeckung & Gaps |
| Sync | Firestore ↔ lokal (Catalog-Watcher in API; Userdata separat) |
| Ops | Inbox/Waybar, Push, Fitbit-Mail, Anatomy, TUIs |

**Nicht hier:** Frontend (`fitness-dev`/VitalOS), Nutrition (`backend/fuel`).  
Server-Control: `fitnessctl` (Hub reicht nur durch).

## Layout

```
api/  catalog/  sync/  log/  tui/  notifier/  pusher/
activity/  mail/  coach/  runtime/  firestore/  anatomy/  cli.py
```

## CLI

| Binary | Fokus |
|---|---|
| `fitness` | Hub: catalog-TUI, coverage/gaps/search, session/journal, Passthrough |
| `fitness-catalog` | Agent-CLI (audit/teach/enrich/import/push/inbox) |
| `fitness-log` | Sessions ls/show/week/add/wizard/clients/console |
| `fitness-tui` | Session-Dashboard ohne Server |
| `fitness-sync` / `firestore-sync` | pull/push/watch |
| `fitness-inbox` / `fitness-push` | Inbox/Waybar · Push an Nutzer |
| `fitness-activity` / `fitness-mail` | Cardio · Fitbit-Gmail |
| `fitness-api` | FastAPI starten |
| `anatomy-agent` | Anatomy-KB (Nachbarpaket im selben uv-Tool) |

```bash
fitness catalog          # Catalog-TUI
fitness log week         # ohne Server
fitness-api              # :9150
```

## API (Kurz)

Default-Port `FITNESS_PYTHON_PORT`/`FITNESS_PORT` → **9150**. App: `fitness.api.main:app`.

Gruppen: Catalog/Exercises/Inbox/Muscles · Sessions/Journal · Workouts/Routines ·
Macrocycles · Coaching/Plans/Coverage · Sync/Firestore · Body/Config/Theme ·
Clients/Analytics · Sixpack Photos.

`PYTHONPATH` muss `backend/` enthalten (`import fitness`), nicht `backend/fitness`
(sonst schattet `fitness/http.py` Stdlib `http`).

## Daten & Sync

| Was | Default |
|---|---|
| Active UID | `~/.aos/users/.active-uid` / `FITNESS_UID` |
| Sessions | `~/.aos/users/<uid>/fitness/sessions/` (+ SQLite History) |
| Runtime (API) | `~/.aos/fitness` (`users/{uid}/sessions/`, body, journal) |
| Klienten | `~/.local/Klienten` (`CLIENTS_ROOT` / `KLIENTEN_DIR`) |
| KB | `catalog/kb/exercises` + `muscles` + `inbox` |

Catalog-Firestore-Watcher läuft im API-Prozess; Userdata-Sync separat (Daemon/CLI).  
Catalog = eine coach-approved Wahrheit; Rohimporte nur über Inbox/Expert-Gate.

## Install

```bash
PY313="$HOME/.local/share/uv/python/cpython-3.13-linux-x86_64-gnu/bin/python3.13"
cd ~/dev/coach-dev
poetry env use "$PY313" && poetry install
uv tool install -e . --python "$PY313" --force
```

Packages im Root-pyproject: `fitness` from `backend`, plus `db`, `anatomy_kb`.  
`backend/fuel` ist excluded (eigenes Package).

Agent-Kontext: `CLAUDE.md`. Catalog-Tiefe bei Bedarf: `catalog/ARCHITECTURE.md`.
