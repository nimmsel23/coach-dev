# CLAUDE.md — anatomy-kb

Dieses Projekt ist der Anatomie-Wissensspeicher der Diplom Präventiver Vitaltrainer Ausbildung.

---

## Überblick

**anatomy-kb** (`~/anatomy-kb`, Port 9200) ist ein eigenständiger aiohttp-Server + Python-Paket.
Kein Teil von AlphaOS, aber direkt mit `fitness-dev` verknüpft.

```
anatomy-kb/
├── server.py                  — aiohttp Server :9200 (Routing-Layer)
├── daemon.py                  — Hintergrunddienst (refine + firestore sync)
├── anatomy_kb/
│   ├── handlers.py            — HTTP-Handler (zustandslos, ruft catalog auf)
│   ├── loader.py              — YAML-Loader (merged catalog/kb + anatomy-kb/exercises)
│   ├── models.py              — Dataclasses (Exercise, MuscleRoles)
│   ├── db.py                  — anatomy.sqlite Schema + Sync-Logik
│   ├── db_handler.py          — /api/db/* HTTP-Handler
│   ├── gemini.py              — Gemini API Thin Wrapper (call_with_fallback, FALLBACK_MODELS)
│   ├── muscle_store.py        — muscles/*.yml Interface (CRUD + push_to_teaching)
│   ├── muscle_handler.py      — /api/muscles/* HTTP-Handler
│   ├── firestore_handler.py   — /api/firestore/* HTTP-Handler
│   ├── vault.py               — Obsidian Vault Utils (Frontmatter, Tags, find_file)
│   ├── display.py             — Rich-basierte Ausgabe (gum_log, console)
│   └── commands/              — Typer CLI-Commands (enrich, ingest, audit, learn, ...)
├── muscles/                   — Ein YAML pro Muskel (origin, insertion, innervation)
├── exercises/                 — Anatomy-Layer YAMLs (überschreiben fitness-dev Catalog)
├── muscle-index.json          — wger muscle_id Metadaten (SOT für IDs)
└── catalog-index.json         — Exercise Registry
```

---

## Integration mit fitness-dev

`server.py` injiziert `catalog`-Module via `sys.path.insert` und `app["modules"]`:
- `catalog.resolver` — Exercise-Index + Fuzzy-Resolver
- `catalog.coverage` — Coverage-Berechnung
- `catalog.teaching` — Anatomy Lessons
- `catalog.planner` — Plan-Generator

**Pfad:** Wird via `anatomy_kb/config.py` aufgelöst — erkennt automatisch Subtree-Layout
(`fitness-dev/anatomy-kb/`) und Legacy-Sibling-Layout (`~/anatomy-kb/` neben `~/fitness-dev/`).
Override via `ANATOMY_KB_FITNESS_DEV=/pfad/zu/fitness-dev`.

---

## Architektur-Besonderheiten

**db.py vs db_handler.py:** `db.py` enthält Schema + Sync-Logik (pure Python), `db_handler.py` ist der HTTP-Layer darüber. Klare Trennung, kein Overhead.

**muscle_store.py vs muscle_handler.py:** `muscle_store.py` = CRUD für `muscles/*.yml` (File-Layer), `muscle_handler.py` = HTTP-Handler darüber. Konsistentes Muster.

**push_to_teaching()** in `muscle_store.py`: Bettet Muskel-Anatomie in `fitness-dev/catalog/kb/anatomy_teaching/*.yml` ein. Unterstützt beide YAML-Formate (flach + `lessons`-Array).

**Gemini-Wrapper** (`gemini.py`): Kein direkter SDK-Import — nur `httpx` gegen REST-API. `call_with_fallback()` iteriert durch `FALLBACK_MODELS` bei 503/429.

**Vault** (`vault.py`): Liest Obsidian-Notizen aus `ANATOMY_KB_VAULT` (env-Override). `fzf` für interaktive Datei-Auswahl (commands/ingest, commands/learn).

---

## HTTP-Endpoints (:9200)

| Endpoint | Beschreibung |
|----------|-------------|
| `GET /health` | Status + exercise/lesson count |
| `GET /api/exercises` | Alle Übungen (kompakt) |
| `GET /api/exercise/{id}` | Vollständige Exercise-Daten |
| `GET /api/exercise/{id}/teaching` | Anatomy-Lesson (`?mode=trainer\|client`) |
| `GET /api/exercise/{id}/coverage` | Coverage-Score (`?sets=3&rpe=7`) |
| `GET /api/exercise/{id}/bodymap` | BodyMap-Regions (primary/secondary/light) |
| `GET /api/resolve?q=...` | Alias + Fuzzy-Resolver |
| `POST /api/plan/generate` | Plan generieren |
| `GET /api/muscles` | Alle Muskeln (Index) |
| `GET /api/muscles/{muscle_id}` | Ein Muskel |
| `POST /api/muscles/enrich` | Muskeln via Gemini befüllen |
| `POST /api/muscles/push` | muscles/*.yml → anatomy_teaching/ |
| `POST /api/db/sync` | anatomy.sqlite neu befüllen |
| `GET /api/db/status` | Tabellen-Zählstände |
| `GET /api/db/query?sql=...` | Read-only SQL (SELECT only) |
| `POST /api/firestore/sync` | Alles zu Firestore |
| `GET /api/firestore/status` | Verbindungsstatus |

---

## CLI (anatomy-agent)

```bash
anatomy-agent enrich <exercise_id>    # Gemini → muscles/*.yml
anatomy-agent ingest <exercise_id>    # Obsidian-Notiz → anatomy_teaching/
anatomy-agent audit                   # Coverage-Report
anatomy-agent learn <exercise_id>     # Interaktive Anatomie-Lektion
anatomy-agent refine                  # Top unreviewed Übungen aufräumen
anatomy-agent firestore sync          # Firestore pushen
anatomy-agent db sync                 # SQLite befüllen
```

---

## Daten-Pfade

- `anatomy-kb/muscles/*.yml` — Muskel-Anatomie (SOT)
- `anatomy-kb/exercises/*.yml` — Anatomy-Enrichment pro Übung
- `fitness-dev/catalog/kb/anatomy_teaching/*.yml` — Teaching-Layer (beide Projekte schreiben hier)
- `~/.aos/fitness/anatomy.sqlite` — SQLite Mirror
- `~/.aos/fitness/anatomy-scores.json` — Flashcard-Scores

---

## Code-Review 2026-06-07

### Architektur-Befund

Architektur ist konsistent und sauber. `server.py` als reiner Routing-Layer, Business-Logik in `handlers.py` / `catalog`-Modulen via Dependency-Injection — testbar. Modul-Trennung (`db.py` vs `db_handler.py`, `muscle_store.py` vs `muscle_handler.py`) ist korrekt.

### Potenzielle Probleme

**server.py Zeile 24–28: Fragiler `sys.path.insert`-Hack**
`server.py` fügt `fitness-dev/catalog` via `sys.path.insert` ein. Bricht wenn `anatomy-kb` und `fitness-dev` nicht Geschwister-Verzeichnisse sind. Kein `try/except` falls `catalog` fehlt → Import-Fehler beim Start ohne hilfreiche Meldung.

**`handlers.py` ruft `build_exercise_index()` mehrfach auf**
`/health`, `GET /api/exercises`, `GET /api/exercise/{id}` bauen je einen frischen Index. `resolver.build_exercise_index()` hat kein Cache. Bei vielen Übungen messbar. Fix: Cache in `resolver.py` oder Index einmalig beim App-Start bauen.

**`db.py: sync_exercises()` Tier-Priorisierung ist invertiert**
Zeilen 236–240: `bulk + inbox + expert` — Expert-Dateien werden zuletzt verarbeitet und überschreiben via `ON CONFLICT DO UPDATE`. Das ist die richtige Reihenfolge (stärkster gewinnt), aber der Kommentar sagt "Tier-Priorisierung (Expert gewinnt)" — korrekt, aber intuitiv verwirrend.

**`daemon.py` kennt nur `anatomy-agent`-Binary per Pfad**
`AGENT = ROOT / "anatomy-agent"` — bricht wenn `anatomy-agent` nicht ausführbar ist oder nicht als Python-Script vorliegt. Kein Fehler beim Daemon-Start, erst beim ersten Lauf.

**`vault.py: VAULT_ROOT`-Fallback**
Hardcodierter Pfad `~/Dokumente/Vitaltrainer/Dipl.HealthPersonalTrainer/Übungen` als Fallback — kann bei verschiedenen Systemen fehlen. Nur `ingest`- und `learn`-Commands betroffen (die brauchen Vault-Zugriff).

**`muscle_store.py: list_muscles()` scannt immer alle `.yml`**
Bei ~40 Muskeln kein Problem. Kein Cache — bei `enrich_muscles` (alle Muskeln) wird pro Muskel `load_muscle()` + `list_muscles()` aufgerufen → O(n²) I/O. Bei aktuellem Scale irrelevant.

### Tote/Veraltete Files

- `*.bak`-Dateien in `anatomy_kb/commands/` (enrich.py.bak, ingest.py.bak, etc.) — können gelöscht werden.
- `anatomy-agent.bak` im Root — veraltet.
- `README.md.bak` — veraltet.
- `DAEMON_REFINEMENT.md`, `GEMINI.md`, `NLP.md` — Doku-Artefakte, nicht referenziert.

### Was fehlt

- Kein `/api/exercise/{id}/bodymap`-Endpoint-Test vorhanden.
- `anatomy-kb` hat keine eigene Pytest-Suite (nur `fitness-dev/catalog/tests/`).
- `db_handler.py: query()` erlaubt beliebige SELECT-Queries ohne Rate-Limit oder Auth.
