# CLAUDE.md — fuel-backend

> **Pointer (2026-11-09):** Nicht Coach-:9150-SOT. Coach → Fuel via VitalOS
> `:8000/api/fuel`. Coach-Server: `~/dev/coach-dev/server.py`. Siehe
> [README.md](README.md).

Backend (Node), aus `~/dev/fuel-dev/CLAUDE.md` ausgelagert (Stand 2026-11-04). Das Modul-Repo `~/dev/fuel-dev` liefert Daten/Frontend; dieser Code läuft nur hier. Layout und Pfad-Auflösung: siehe `package.json`/`server.mjs`.

### Backend (`server.mjs` → `src/app.mjs`)

**Fastify** mit `@fastify/cors`. Routes als Plugins in `src/routes/`.
Path-Normalisierung per `preHandler`-Hook: `/c/<clientId>/nutrition/…` → `/nutrition/…`.

**Endpoints:**
```
GET  /health
GET  /nutrition/search?q=&limit=      Open Food Facts proxy
GET  /nutrition/log?date=             Tages-Mahlzeiten
POST /nutrition/log                   Mahlzeit loggen {description, catalog_id?, kcal, protein, carbs, fat}
GET  /nutrition/catalog               Alle Meals (aus catalogs/nutrition/meals/)
POST /nutrition/catalog               Meal speichern
GET  /nutrition/daily/:date           Tages-Makros + Mikros aggregiert
GET  /nutrition/weekly/:year/:week    Wochen-Mikros vs. DACH-Referenz
POST /nutrition/compose               Gericht via wger + Gemini komponieren
POST /nutrition/estimate              Gemini Makro-Schätzung (kein Save)
GET  /nutrition/journal?date=
POST /nutrition/journal
GET  /supplements/catalog
POST /supplements/catalog
GET  /supplements/log?date=
POST /supplements/log
GET  /supplements/stats?days=&anchor=
GET  /fuel/log, POST /fuel/log        legacy
```

**Datenpfade (runtime, auto-created):**
```
~/.aos/fuel/
├── nutrition/
│   ├── YYYY-MM-DD.json     tägliche Mahlzeit-Logs
│   └── nutrition.db        SQLite: ingredients + meal_micros
├── nutrition_journal/
│   └── YYYY-MM-DD.md
└── supplements/
    ├── logs/YYYY-MM-DD.json
    └── (catalog in Repo)
```

**Catalogs (repo-basiert, git-tracked):**
```
catalogs/
├── nutrition/
│   └── meals/
│       └── {id}.json       ein File pro Gericht
└── supplements/
    └── catalog.yaml
```

### SQLite (`nutrition.db`)

Zwei Tabellen:

**`ingredients`** — wger-Ingredient-Cache, per 100g:
- `wger_id`, `name`, `brand`, Makros (`kcal`, `protein`, `carbs`, `fat`, `fiber`, `sodium_mg`)
- Befüllt beim Compose via `/nutrition/compose`

**`meal_micros`** — Gemini-geschätztes Mikronährstoffprofil pro Mahlzeit:
- `meal_name` (Mahlzeit-Bezeichnung), alle DACH-Mikros als absolute Werte für die Portion wie gegessen
- `source`: `gemini`
- Lookup per Name (case-insensitive)

### Micros / DACH

Referenzwerte: `src/config/dach.mjs` — DGE/ÖGE Werte für D/A/CH.
Mikronährstoffe werden **nicht** täglich eingetragen — Gemini schätzt sie beim Compose für die ganze Mahlzeit.
Wochenheatmap (Mikros-Tab) aggregiert meal_micros-Werte pro Woche vs. DACH.

### Firestore-Sync — was TATSÄCHLICH läuft (Stand 2026-09-07, verifiziert)

Es gibt **zwei parallele, überlappende Sync-Engines**. Beide schreiben `~/.aos/fuel/users/<uid>/` ↔ Firestore:

| Engine | Läuft in | Tut | Aktiv |
|---|---|---|---|
| **`src/server/lib/firestore-admin.mjs`** | **`fuel-sync.service`** (user-scope, `scripts/sync-daemon.mjs`, ohne Fastify: stündlicher Pull + Realtime-Katalog-Listener; Push beim Schreiben bleibt in den Server-Routen; der Staging-Server `fuel-preview.service` :8700 startet den Sync nur noch mit `FUEL_ENABLE_FIRESTORE_SYNC=1`; seit 2026-10-29 einziger Sync-Besitzer — Dev und Prod synchronisieren nie, `fuel.service` :7000 hat keinen Auto-Sync mehr) | **Stündlich** bidirektional Pull **und** Push über **alle** Klienten-UIDs (`discoverSyncUids()` = `FUEL_CLOUD_UID` + `FUEL_CLOUD_UIDS` + `getAllClientUids()` aus `~/vital/Klienten/*/client.json` + Ordner unter `~/.aos/fuel/users/`). Zusätzlich Fire-and-forget-Push bei jedem Log-Write (`log.mjs`/`daily.mjs`/`nutrition-weekly.mjs`). Realtime `onSnapshot` nur für den Katalog. Per-UID → `~/.aos/fuel/users/<uid>/`; Operator läuft als `uid="default"` → **Push wird geskippt**, nur der Katalog geht raus. | **JA — der Haupt-Sync** |
| **`fitness-firestore-daemon.service`** | eigener user-Service (`python -m fitness.firestore.mirror`, Repo `~/fitness-dev`) | Realtime `on_snapshot` von `nutrition/<operator-uid>/logs` + `supplements/<operator-uid>/logs`+`meta/catalog` → `~/.aos/fuel/users/<operator-uid>/`. Bulk via `fitness sync` (`fitness/firestore/fuel.py` `push_fuel`/`pull_fuel`). **Nur die Operator-UID**, keine Klienten. | **JA — überlappt Zeile 1 für die Operator-UID** |
| `scripts/firestore-sync.mjs` (`pnpm run cloud:push`/`cloud:pull`/`cloud:watch`) | fuel-dev CLI, **kein Service** | manueller Bulk-Push/Pull/Watchdog. `PRIMARY_UID=FUEL_CLOUD_UID` → flacher Default-Store, jede andere UID → `users/<uid>/`. | nur wenn manuell gestartet |
| Fuel FastAPI via VitalOS :8000 | `/home/alpha/fuel-dev/backend` | Fuel-owned SQLite; API-Router in-process | **JA** |
| Cloud-PWA | Browser | schreibt Firestore direkt via Client-SDK — das ist die App, kein „Sync" | — |

**Cross-User-Schutz (`owner_uid`):** jeder Firestore-Write stempelt `owner_uid=<uid>`; jeder Pull/Mirror
verwirft Dokumente mit fremdem `owner_uid` (`OWNER MISMATCH`-Log). fuel-dev: Commits `e36c315` + `0c27fbc`.
fitness-dev: Commit `70175ce`. Fehlendes `owner_uid` (Alt-Doc) wird toleriert und beim nächsten Push
nachgestempelt — Backfill auf Bestandsdaten steht noch aus.

**Warum Sync-Bugs hier immer wieder auftauchen:** zwei Engines auf demselben Pfad + die stündliche
Multi-UID-Schleife in `fuel.service` zieht jeden Klienten durch dieselbe Pull/Push-Logik — jeder
UID-Isolierungsfehler propagiert sofort über alle Klienten (z.B. 2026-08: Jakobs Logs landeten in
Daniels Store).
**Build output local:** `/opt/fuel` (via `FUEL_BUILD_DIR`)
**Build output cloud:** `./dist-firebase/` → Firebase Hosting

## Org-Taskwarrior (global) — gilt fuer alle Agenten der VitalOS-Org

Verbindlich fuer alle Agenten (Vibe, Claude, Codex, Gemini) in Org-Kontexten
(Owner-Weisung 2026-11-07):

1. EINE globale Org-Task-DB — KEINE eigenen Rollen- oder Repo-DBs mehr:
   `TASKRC=~/.local/state/vitalos-org/taskrc` (DB liegt daneben in `task/`).
   Alte Repo-DBs sind archiviert unter `~/.local/state/vitalos-org/archive-repodb/`.
2. Daniels private Taskwarrior-DB (`~/.task`, u. a. Hotlist `+hot`) bleibt
   TABU fuer Schreibzugriffe — nur lesend (CEO-Runde: Task `status:pending +hot`).
3. Rolle = Tag: Jeder Agent taggt seine eigenen Aufgaben mit seiner Rolle:
   `+ceo`, `+cto`, `+al`, `+pm`, `+alpha`, `+betta` …
4. Abteilung/Repo = project: `project:fitness-dev`, `project:journal-dev`,
   `project:vitalos-prod`, `project:dotfiles`, `project:aos` …
5. Prio-Encoder (in der Org-taskrc verankert):
   - `+hit` und `+br` sind EIN Tier (Hits = Big Rocks, Koeffizient 8.0) —
     hoechste Dringlichkeit, `+hit` = `+br`.
   - `+lr` 2.0 (Little Rocks).
   - `+hot` 1.0 — NUR Potential/Sichtbarkeit, wird NIE automatisch ausgefuehrt;
     ob ein Potential jetzt anfaellt, entscheidet der Door War (Sonntagsrunde).
   - `+s` -1.0 (Sand, Zeitverschwendungsroutine).
   - `+go` ist KEINE Prioritaet und bewirkt nichts — Freigaben laufen ueber
     die Rollen (CTO-Freigabeprozess), nicht ueber Urgency.
6. Aufgaben IMMER per UUID anfassen (`task <uuid> modify|done|info`), NIE per
   ID — IDs renummerieren sich nach jedem `done` (Fehltreffer-Gefahr).
7. Guard: orgsh und die Runner verweigern den Lauf, wenn die Org-taskrc fehlt —
   kein stiller Rueckfall auf die Privat-DB.
8. Uebersicht/Rang: `TASKRC=~/.local/state/vitalos-org/taskrc \
   ~/.org/venv/bin/python ~/aos/bin/aos door plan quadrants --json`
   (Eisenhower-Sicht Q1–Q4).
