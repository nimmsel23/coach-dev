# catalog — Architektur

## Überblick

Python-Paket unter `catalog/`. Läuft als FastAPI HTTP-Server (:9150) und CLI.
Node-Server (`server.mjs`, :9100) ruft via HTTP auf — fällt der Agent aus, gibt der Node-Server Fallback-Daten zurück.

```
catalog (:9150)
    ├── HTTP API      → FastAPI (api.py)
    ├── CLI           → direkte Catalog-Pflege (cli.py)
    └── Watcher       → Inbox-Verzeichnis, Gemini-Enrichment on-the-fly (watcher.py)
```

---

## Module

| Modul | Aufgabe |
|-------|---------|
| `api.py` | FastAPI HTTP-Server, alle Endpoints |
| `cli.py` | typer CLI-Dispatcher |
| `gemini.py` | Gemini API + Claude/Codex Fallback (AI-Enrichment) |
| `watcher.py` | Filesystem-Watcher, Inbox-Processing |
| `resolver.py` | Exercise-Auflösung (Alias → canonical_id) |
| `loader.py` | YAML-Lade-Helfer, `catalog_path()`, `iter_catalog_yaml_files()` |
| `paths.py` | `DATA_DIR` (= `catalog/kb/`), `runtime_root()` |
| `coverage.py` | Muskel-Coverage-Berechnung |
| `planner.py` | Trainingsplan-Generator |
| `teaching.py` | Anatomy-Lesson-Renderer |
| `audit.py` / `auditor.py` | Katalog-Qualitätsprüfung |
| `history.py` | SQLite Training History |
| `obsidian.py` | Markdown-Export |
| `wger.py` | wger-Integration |
| `kb_sync.py` | KB → Firestore Sync |
| `enricher.py` | GIF/Media-Enrichment |
| `ingestor.py` | Session-JSON → SQLite |
| `yaml_utils.py` | YAML load/dump Helfer |
| `rich_utils.py` | Console + Logging Setup |

---

## KB-Struktur (`catalog/kb/`)

```
catalog/kb/
├── exercises/
│   ├── 020.yml … 701.yml     — Exercise-Definitionen (canonical IDs)
│   ├── inbox_*.yml            — AI-generierte Drafts (pending review)
│   ├── chest.yml, back.yml … — Region-Sammlungen (legacy, werden abgelöst)
│   ├── unreviewed_wger.yml    — wger Bulk-Import (unreviewed)
│   └── unreviewed_yuhonas.yml — yuhonas Bulk-Import (unreviewed)
├── anatomy_teaching/
│   └── 020.yaml … 701.yaml   — Anatomie-Layer pro Exercise (Ursprung, Ansatz, Innervation)
├── muscles/
│   ├── muscle_index.yml       — Haupt-Index (canonical IDs → wger_id, wger_groups)
│   ├── muscle_coverage_rules.yml — Coverage-Gewichtungen (primary/secondary/stabilizer)
│   ├── _groups.yml            — Multi-Muskel Gruppen-Aliases (shoulders, glutes, quads…)
│   ├── chest.yml              — Region-Index (100_chest, listet Muskel-IDs)
│   ├── back.yml               — Region-Index (200_back)
│   ├── shoulders.yml          — Region-Index (300_shoulders)
│   ├── arms.yml               — Region-Index (400_arms)
│   ├── core.yml               — Region-Index (500_core)
│   ├── legs.yml               — Region-Index (600_legs)
│   ├── calves.yml             — Region-Index (700_calves)
│   ├── chest/                 — 4 individuelle Muskel-YAMLs
│   ├── back/                  — 8 individuelle Muskel-YAMLs
│   ├── shoulders/             — 8 individuelle Muskel-YAMLs
│   ├── arms/                  — 7 individuelle Muskel-YAMLs
│   ├── core/                  — 4 individuelle Muskel-YAMLs
│   ├── legs/                  — 12 individuelle Muskel-YAMLs
│   └── calves/                — 3 individuelle Muskel-YAMLs
├── maps/
│   ├── aliases.yml            — Freitext → canonical exercise_id
│   ├── wger_mapping.yml       — exercise_id ↔ wger_id
│   └── external_db_mapping.yml — exercise_id ↔ yuhonas_id
└── rules/
    ├── program_rules.yml
    ├── progression_rules.yml
    └── safety_rules.yml
```

### Muskel-YAML Schema (`muscles/<region>/<id>.yml`)

```yaml
id: 301_anterior_deltoid
display_name: Anterior Deltoid
label_de: Vordere Schulter
label_en: Front Delts
label_lat: M. deltoideus (pars clavicularis)
region: shoulders
body_region: shoulders_front
wger_id: 2
aliases: [front-deltoids]
viz:
  rbh: front-deltoids           # react-muscle-highlighter slug
  body_muscles:
    view: FRONT                  # body-muscles library
    ids: [shoulder-front-left, shoulder-front-right]
```

---

## HTTP Endpoints (:9120)

| Endpoint | Methode | Beschreibung |
|----------|---------|-------------|
| `/` | GET | Index + verfügbare Endpoints |
| `/exercises` | GET | Alle Exercise-Records |
| `/exercise/{id}` | GET | Detail + Anatomy-Lesson |
| `/search?q=...&sources=...` | GET | Suche (coach/wger/yuhonas) |
| `/resolve?q=...` | GET | Alias → canonical_id |
| `/muscles` | GET | muscle_index.yml |
| `/muscles/viz` | GET | Viz-Map aus Muskel-YAMLs (rbh, body_muscles, body_muscles_slugs) |
| `/taxonomy` | GET | muscle_index + coverage_rules |
| `/snapshot` | GET | Exercises + Lessons + Config (gecacht, TTL 30s) |
| `/plan` | GET/POST | Trainingsplan generieren |
| `/weekly` | GET | Wochenreport |
| `/export/{kind}` | POST | Obsidian/PDF/Sheet Export |
| `/inbox` | GET | Pending Inbox-Drafts |
| `/inbox/{id}/approve` | POST | Draft in KB übernehmen |
| `/inbox/{id}` | DELETE | Draft verwerfen |

---

## Datenfluss: Exercise Resolution

```
User-Input (Freitext)
    ↓
aliases.yml            → exakte Alias-Matches
    ↓
resolver.py            → fuzzy + Token-Matching über alle Exercise-YAMLs
    ↓
canonical exercise_id  → z.B. "301"
    ↓
catalog/kb/exercises/301.yml
```

## Datenfluss: Viz-Mapping (Frontend)

```
Exercise YAML          → primary_muscles: [301_anterior_deltoid]
    ↓
/muscles/viz           → liest muscles/<region>/*.yml + _groups.yml
    ↓
{ rbh: {...}, body_muscles: {...} }
    ↓
src/lib/muscleMap.js   → useMuscleMap() Hook (gecacht, einmal geladen)
    ↓
DetailedMuscleMap      → react-muscle-highlighter (rbh slugs)
MuscleHighlightMap     → body-muscles library (ids + view)
BodyMusclesMap         → body-muscles library (body_muscles_slugs)
```

## Datenfluss: AI Enrichment

```
Neue Übung (Inbox JSON / CLI)
    ↓
gemini.py: load_gemini_key()
    ├── Gemini API          → Primär
    ├── codex exec          → Fallback 1
    ├── claude -p           → Fallback 2
    └── manuelle Eingabe    → Fallback 3 (immer verfügbar)
    ↓
Exercise YAML Draft (inbox_*.yml)
    ↓
Manual Review → /inbox/{id}/approve → catalog/kb/exercises/<id>.yml
```

---

## CLI-Befehle

```bash
python3 -m catalog.catalog <command>

alias-add <id> [aliases…]   # Aliases in Exercise-YAML schreiben (Gemini/Codex/Claude/manuell)
audit [--topic anatomy|…]   # Katalog-Qualität prüfen
resolve <query>             # Übung auflösen
teach <id>                  # Anatomie-Lesson rendern
plan [--template ppl]       # Trainingsplan generieren
log --exercise <id> …       # Training loggen
history                     # Letzte Trainings
coverage [--days 7]         # Muskelabdeckung
coach-sheet --exercise <id> # Coaching-Daten
map-wger --exercise <id>    # wger-ID zuordnen
watch                       # Inbox-Watcher starten
kb-sync                     # KB → Firestore
```

---

## Datenquellen-Priorität

| Quelle | Rolle |
|--------|-------|
| `catalog/kb/exercises/*.yml` | Semantic SOT — Coaching, Muskellogik, IDs |
| `wger` (:8000 lokal) | Tracking-Backend, App-Integration |
| `yuhonas/free-exercise-db` | Bilder, alternative Namen, Roh-Muskel-Tags |
| Gemini / Claude / Codex | AI-Enrichment (Drafts, Aliases, Anatomie) |

Bei Konflikten gewinnt immer `custom_yaml`.

## Backend-Refactor und gemeinsame Datenregeln

`backend/` nutzt die Root-Pakete `fitness.runtime` und `fitness.catalog` weiter. Session-Datumswerte werden dort
als echte ISO-Kalendertage validiert; UIDs und Sidecar-IDs bleiben sichere einzelne Dateinamenbestandteile. Die Auswahl der
letzten Einheit sortiert nach `saved_at`, ersatzweise Session-Datum und Datei-Zeitstempel; die Sidecar-ID ist nur
der letzte stabile Gleichstands-Fallback.

Der Backend-Coverage-Cache muss alle tatsächlich geladenen KB-Quellen fingerprinten: Exercises, Inbox, Muskel-
YAMLs, `muscle_index.yml` und `rules/muscle_coverage_rules.yml`. Beim Planbau wird der Exercise-Index aus diesem
Root-Katalog einmal erstellt und für alle ausgewählten Übungen wiederverwendet.

---

## Frontend-Integration

`src/lib/muscleMap.js` — lädt `/muscles/viz` einmal beim App-Start, cached im Modul-Scope.

```js
import { useMuscleMap } from '../lib/muscleMap';

const muscleMap = useMuscleMap();
const rbhSlug = muscleMap?.rbh['301_anterior_deltoid'];
```

`muscleMapping.js` (hardcoded) wurde entfernt. Die Muskel-YAMLs sind jetzt SOT für alle Viz-Daten.
