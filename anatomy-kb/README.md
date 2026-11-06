# anatomy-kb

**Anatomy Knowledge Layer — Vitaltrainer Ausbildung (Dipl. Präventiver Vitaltrainer, FlexyFit Wien)**

Der Anatomy-Layer hinter fitness-dev. Befüllt den Muskel-Katalog mit Ursprung, Ansatz, Innervation
und didaktischen Inhalten — aus Vault-Notizen destilliert und via Gemini strukturiert.
Nebentools (Flashcard, Quiz) entstanden während der Ausbildung, sind aber nicht der Kernzweck.

Kein weiteres Exercise-DB. Ein didaktischer Layer der beantwortet:
*Was bewegt sich? Welche Muskeln erzeugen Kraft? Ursprung, Ansatz, Innervation — warum?*

---

## Rolle im Ecosystem

```
wger (:8000) + yuhonas
        ↓
fitness-dev/catalog/kb/exercises/       Base-Layer: name, category, wger_id, muscle_roles
        ↓
fitness-dev/catalog/kb/anatomy_teaching/ Teaching-Layer: joint_actions, errors, feel_cues, quiz
        ↑ push_to_teaching()
anatomy-kb/muscles/                     Muscle-Layer: origin, insertion, innervation (pro Muskel)
        ↑ ingest / enrich
Vault-Notizen + Gemini
        ↓ Firestore sync
fitness-aos (PWA)                       exercises + muscles + anatomy_teaching
```

- **fitness-dev** besitzt: Exercise-Definitionen, Session-Tracking, Body-Highlights, PWA
- **anatomy-kb** besitzt: Muskel-Anatomie (wger-gematcht), Vault-Integration, Gemini-Enrichment

---

## Daten-Architektur

### muscle-index.json
Kanonischer Muskel-Registry — 16 Muskeln direkt aus wger `/api/v2/muscle/`:
```json
{
  "latissimus_dorsi": {
    "muscle_id": "latissimus_dorsi",
    "wger_id": 12,
    "latin": "Latissimus dorsi",
    "name_en": "Lats",
    "file": "muscles/latissimus_dorsi.yml"
  }
}
```

### muscles/{muscle_id}.yml
Ein File pro Muskel — wger_id als Anker, Anatomy-Tiefe von Gemini:
```yaml
muscle_id: latissimus_dorsi
wger_id: 12
latin: Latissimus dorsi
origin: "Dornfortsätze Th7–Th12, Fascia thoracolumbalis, Crista iliaca..."
insertion: "Crista tuberculi minoris humeri"
innervation: "N. thoracodorsalis (C6–C8)"
function: "Adduktion, Extension und Innenrotation des Humerus"
exercises:
  pull_up:
    function_in_exercise: "Hauptmotor der Adduktion und Extension"
```

### fitness-dev/catalog/kb/anatomy_teaching/{exercise_id}.yml
Erweitert durch `push_to_teaching()` — muscle_anatomy wird eingebettet:
```yaml
# (vom fitness-dev Agent gebaut, von anatomy-kb ergänzt)
lessons:
  - exercise_id: pull_up
    joint_actions: ...
    muscle_anatomy:          # ← anatomy-kb fügt das ein
      latissimus_dorsi:
        origin: "..."
        insertion: "..."
    common_errors_explained: # ← anatomy-kb via ingest
      shoulder_elevation: ...
```

### exercises/ (Stub-Files)
Nur `exercise_id` als Referenz — alle Inhalte sind in `muscles/` oder `anatomy_teaching/`.

---

## Starten

```bash
kbctl start       # Server :9200 im Hintergrund
kbctl status      # PID + Uptime
kbctl health      # /health prüfen
kbctl stop        # Server runter
kbctl logs        # live log
```

---

## CLI — anatomy-agent

### Katalog erweitern

**Aus Ausbildungsnotizen (Obsidian Vault):**
```bash
anatomy ingest Klimmzug
anatomy ingest "Vorgebeugtes Rudern" --exercise barbell_row
anatomy ingest /pfad/zur/datei.md --dry-run
```

Liest Vault-MD → Gemini extrahiert muscle_anatomy + common_errors:
- `muscle_anatomy` → `muscles/{muscle_id}.yml` + `push_to_teaching()` → `anatomy_teaching/`
- `common_errors_explained` → direkt in `anatomy_teaching/{exercise_id}.yml`
- MD-Frontmatter wird mit `anatomy_kb: {exercise_id, ingested, fields}` aktualisiert

**Muskeln via Gemini enrichen:**
```bash
anatomy enrich bench_press           # Muskeln einer Übung → muscles/*.yml
anatomy enrich pull_up --force       # überschreibt bestehende Daten
anatomy enrich squat --dry-run
```

### Lernen (Nebentools)

```bash
anatomy teach bench_press            # Erklärung, Gelenke, Muskeln, Cues
anatomy errors pull_up               # Fehlerbilder mit anatomischer Begründung
anatomy quiz squat                   # Quiz — Enter zum Aufdecken
anatomy flashcard                    # alle Muskeln: Ursprung & Ansatz
anatomy flashcard --weak             # nur Muskeln unter 60% Trefferquote
anatomy flashcard --limit 10
```

Flashcard-Flow pro Karte:
1. Muskelname + lateinisch sehen
2. `Enter` → Ursprung aufdecken
3. `Enter` → Ansatz aufdecken
4. `1` Gewusst / `2` Unsicher / `3` Falsch / `q` Beenden

Scores werden in `~/.aos/fitness/anatomy-scores.json` gespeichert.
`--weak` filtert Muskeln mit unter 60% Trefferquote — Spaced Repetition ohne Overhead.

### Übungen & System

```bash
anatomy-agent list                       # alle Übungen als Tabelle
anatomy-agent pick                       # fzf-Auswahl → teach
anatomy-agent show bench_press           # YAML-Rohdaten
anatomy-agent audit                      # anatomy + exercises
anatomy-agent audit anatomy              # nur Teaching-Layer
anatomy-agent audit exercises            # nur Exercise-Definitionen
anatomy-agent serve                      # API-Server starten (alternativ zu kbctl)
anatomy-agent doctor                     # Health-Check aller Komponenten
anatomy-agent reload                     # YAML-Cache leeren (kein Restart nötig)
```

---

## anatomy — Top-Level Dispatcher

```bash
anatomy start / stop / restart / status / health / logs
anatomy teach <id>
anatomy flashcard
anatomy ingest <notiz>
anatomy enrich <id>
anatomy audit
# ... alle anatomy-agent Befehle
```

---

## API (:9200)

### Exercises
| Endpoint | Beschreibung |
|----------|-------------|
| `GET /health` | Server-Status |
| `GET /api/exercises` | Alle Übungen |
| `GET /api/exercise/{id}` | Eine Übung |
| `GET /api/exercise/{id}/teaching` | Anatomy-Teaching (`?mode=trainer\|client`) |
| `GET /api/exercise/{id}/coverage` | Muscle-Coverage (`?sets=3&rpe=7`) |
| `GET /api/exercise/{id}/bodymap` | BodyMap-Regionen |
| `GET /api/resolve?q=...` | Alias/Fuzzy-Resolver |
| `POST /api/plan/generate` | Trainingsplan |

### Muscles
| Endpoint | Beschreibung |
|----------|-------------|
| `GET /api/muscles` | Alle 16 Muskeln mit Status |
| `GET /api/muscles/{muscle_id}` | Einzelner Muskel |
| `POST /api/muscles/enrich` | Leere Muskeln via Gemini befüllen |
| `POST /api/muscles/enrich?muscle_id=X` | Einzelner Muskel |
| `POST /api/muscles/enrich?force=1` | Alle überschreiben |
| `POST /api/muscles/push` | muscles/ → anatomy_teaching/ einbetten |

### Firestore Sync
| Endpoint | Beschreibung |
|----------|-------------|
| `POST /api/firestore/sync` | Alles synchen |
| `POST /api/firestore/sync/exercises` | fitness-dev catalog → `fitness/kb/exercises/` |
| `POST /api/firestore/sync/muscles` | muscles/ → `fitness/kb/muscles/` |
| `POST /api/firestore/sync/anatomy` | anatomy_teaching/ → `fitness/kb/anatomy/` |
| `GET /api/firestore/status` | Letzter Sync-Status |

`?dry=1` für Dry-Run bei allen Sync-Endpoints.

---

## Vault-Integration

Vault-Root: `~/Dokumente/Vitaltrainer/Dipl.HealthPersonalTrainer/Übungen/`
Oder: `ANATOMY_KB_VAULT=/pfad anatomy ingest ...`

`anatomy ingest` liest:
- YAML-Frontmatter Tags (`tags: [#PULL, #RÜCKEN]`)
- Inline-Hashtags (`#compound-movement #prüfungsrelevant`)
- Obsidian-Wikilinks werden automatisch aufgelöst

Nach dem Speichern wird das Frontmatter der MD-Datei ergänzt:
```yaml
anatomy_kb:
  exercise_id: pull_up
  ingested: 2026-05-21
  fields: [muscle_anatomy, common_errors_explained, vault_tags]
```

---

## YAML-Schema

### muscles/{muscle_id}.yml

```yaml
muscle_id: latissimus_dorsi       # wger-kompatibler snake_case Key
wger_id: 12                       # ID aus wger /api/v2/muscle/
latin: Latissimus dorsi
name_en: Lats
is_front: false
origin: "Dornfortsätze Th7–Th12, Fascia thoracolumbalis, Crista iliaca, untere 3-4 Rippen"
insertion: "Crista tuberculi minoris humeri"
innervation: "N. thoracodorsalis (C6–C8)"
function: "Adduktion, Extension und Innenrotation des Humerus"
exercises:
  pull_up:
    function_in_exercise: "Hauptmotor der Adduktion und Extension des Humerus"
  lat_pulldown:
    function_in_exercise: "..."
```

### fitness-dev/catalog/kb/anatomy_teaching/{exercise_id}.yml (via push_to_teaching)

```yaml
# Seed vom fitness-dev Agent, ergänzt von anatomy-kb:
lessons:
  - exercise_id: pull_up
    title: "Klimmzug — Lat-Mechanik und Scapula-Kontrolle"
    joint_actions:
      shoulder:
        concentric: [adduction, extension]
        eccentric: [abduction_control]
    muscle_anatomy:                          # ← anatomy-kb fügt das ein
      latissimus_dorsi:
        latin: "Latissimus dorsi"
        origin: "Dornfortsätze Th7–Th12, Fascia thoracolumbalis, Crista iliaca..."
        insertion: "Crista tuberculi minoris humeri"
        innervation: "N. thoracodorsalis (C6–C8)"
        function_in_exercise: "Hauptmotor der Adduktion und Extension"
    common_errors_explained:                 # ← anatomy-kb via ingest
      shoulder_elevation:
        description: "Schultern hochziehen statt Depression"
        anatomical_reason: "..."
        correction: "..."
        teaches: [scapular_depression, trapezius_lower]
    vault_tags: [pull, rücken, compound-movement, prüfungsrelevant]
    feel_cues: [...]
    coaching_cues:
      setup: [...]
      execution: [...]
    quiz_prompts:
      - question: "Wo ist der Ursprung des Latissimus dorsi?"
        answer: "Dornfortsätze Th7–Th12, Fascia thoracolumbalis, Crista iliaca"
```

---

## Gemini-Integration

Config: `~/.env/gemini.env` — `GEMINI_API_KEY` + `GEMINI_MODEL=gemini-2.5-flash`

Fallback-Chain bei 503/429: `gemini-2.5-flash` → `gemini-2.0-flash` → `gemini-2.0-flash-001` → `gemini-flash-lite-latest`

Offline-Script für Bulk-Enrichment:
```bash
python3 scripts/enrich_muscles.py            # alle leeren Muskeln
python3 scripts/enrich_muscles.py --muscle latissimus_dorsi
python3 scripts/enrich_muscles.py --dry-run
```

---

## Struktur

```
anatomy-kb/
├── anatomy                      # Top-Level Bash-Dispatcher
├── anatomy-agent                # Python Typer CLI
├── kbctl                        # Server-Kontrolle
├── server.py                    # aiohttp HTTP-Server :9200
├── muscle-index.json            # Kanonische Muskel-Registry (16 Muskeln, wger-gematcht)
├── muscles/                     # Pro-Muskel Anatomy-Daten
│   ├── latissimus_dorsi.yml     # origin, insertion, innervation, function, exercises
│   └── ...
├── exercises/                   # Stub-Files (nur exercise_id als Referenz)
├── scripts/
│   └── enrich_muscles.py        # Bulk-Enrichment ohne Server
└── anatomy_kb/
    ├── loader.py                # Merged Loader: fitness-dev catalog + anatomy-kb
    ├── muscle_store.py          # Interface zu muscles/ + muscle-index.json
    ├── muscle_handler.py        # HTTP-Handler /api/muscles/*
    ├── firestore_handler.py     # HTTP-Handler /api/firestore/*
    ├── gemini.py                # Gemini REST API + Fallback-Chain + Prompts
    ├── vault.py                 # Obsidian: Wikilinks, Tags, Frontmatter
    ├── display.py               # Rich-Ausgabe
    ├── handlers.py              # HTTP-Handler /api/exercises/*
    ├── models.py                # Exercise + MuscleRoles Dataclasses
    └── commands/
        ├── _helpers.py          # Shared: Pfade, init_loader(), fzf_pick()
        ├── browse.py            # list, pick, show
        ├── teach.py             # teach
        ├── learn.py             # errors, quiz
        ├── flashcard.py         # flashcard
        ├── enrich.py            # enrich
        ├── ingest.py            # ingest
        ├── audit.py             # audit
        ├── serve.py             # serve
        └── system.py            # reload, doctor
```

---

## Git Hooks

**pre-commit** (anatomy-kb): Blockiert Commit bei YAML-FAILs im Anatomy-Audit.
Läuft nur wenn `*.yml`-Dateien staged sind.

**post-commit** (anatomy-kb): Auto-committet `fitness-dev/catalog/kb/` Änderungen
mit Message `auto: kb sync von anatomy-kb — <letzter commit>`.

---

## Philosophie

> Open Exercise DBs = Rohmaterial
> anatomy-kb = didaktischer Layer + Knowledge API

Jede Übung beantwortet:
1. Was bewegt sich?
2. Welche Gelenke agieren (konzentrisch / exzentrisch / statisch)?
3. Welche Muskeln erzeugen Kraft — und wo setzen sie an?
4. Welche Muskeln stabilisieren?
5. Was sollte der Trainierende spüren?
6. Welche Fehler passieren — und warum anatomisch?
7. Was lernt der Mensch über seinen Körper?

---

## Workflow

```bash
# 1. Vault-Notiz einlesen (eigene Ausbildungsnotizen als Quelle)
anatomy ingest Klimmzug --exercise pull_up

# 2. Bestätigen → muscles/*.yml + anatomy_teaching/ + MD-Frontmatter aktualisiert

# 3. Oder: Gemini direkt enrichen (ohne Vault-Notiz)
anatomy enrich bench_press

# 4. muscles/ → anatomy_teaching/ pushen (nach manuellem muscles/-Edit)
http POST :9200/api/muscles/push

# 5. Flashcard-Session
anatomy flashcard --exercise pull_up

# 6. Nach mehreren Sessions: nur schwache Muskeln
anatomy flashcard --weak

# 7. Qualität prüfen
anatomy audit

# 8. Firestore sync (fitness-aos PWA bekommt alles)
http POST :9200/api/firestore/sync
```
