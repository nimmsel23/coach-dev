# Coach — Architektur (Backend-Breakthrough)

Stand: 2026-11-09

## Backend-Breakthrough (2026-11-09)

Fitness und Fuel wuchsen aus Python-„Agent“-Modulen (`fitness-agent` /
`fuel-agent`) organisch zu Firebase-nativen Apps. Catalog, Workout-Ableitung
und Local-API sind kein zweites Fitness-Backend mehr, sondern klar getrennt:

| Rolle | Repo | Verantwortung |
|---|---|---|
| **KB-Daten** (YAML only) | `~/dev/fitness` (`nimmsel23/fitness`) | Exercises, Inbox, Muscles, Rules — Daten-SOT |
| **Coach-Server (SOT)** | `~/dev/coach-dev/server.py` | Ein Prozess `:9150` — Keepers + SPA; siehe FOCUS / COACH-SERVER |
| **Python/API** | `~/dev/coach-dev/fitness/` | `coach catalog` (+ Alias `agent`), `fitness.api` in-process, Enrichment |
| **Plan-Brücke** | `~/dev/plan-dev` | Geteilter Editor-/Vertrags-Code („Fitness-Code für Coach“) |
| **Klient** | `~/dev/fitness-dev` | PWA: loggen, lesen, ausführen — **kein** Coach-Code, **kein** Catalog-Python pflegen |
| **Node/Functions** | `~/dev/backend` | Hono/Functions — **kein** Coach-:9150-SOT (Pointer dort) |

**Laufzeit-Fluss**

```
~/dev/fitness  (YAML-SOT)
      ↓ Submodul / Spiegel
coach-dev/fitness/catalog + api :9150
      ↓ Firestore / Funnel
fitness-dev PWA  ←→  Coach hostet Plan (modules/plan Pin)
```

- Plan bleibt **frei von Local-Backend**; Schmiede + Laptop-Backdoor = Coach.
- Fitness berührt Coach-Code nicht; Coach konsumiert Plan als Submodul-Pin.
- **Catalog = KB:** eine Expert-DB in `kb/exercises` (+ muscles). Gate = Coach-Inbox
  (Bulk aus wger+yuhonas erst nach Enhance/Approve). Apps verbauen freigegebene KB
  beim Build als JS — Catalog ist Coach-Werkzeug, nicht App-Kern.
- **Yuhonas jetzt:** Original-DB wie auf Git (Pin + CDN) = Atlas-Verbandspflaster für
  stabilen Betrieb; zu grob fürs volle Expert-Brain (z. B. keine vorderen/hinteren
  Schultern). wger+yuhonas-Summe war zu viel at once.
- Kopien (`fitness-cli`, `fitness-backend`, kaputte plan-dev-Catalog-Links) → Archiv.
  Karte: `~/dev/coach-dev/docs/OWNERSHIP-MAP.md`.


### Coach-Sicht

Coach besitzt Schmiede, Zuweisung, Local-Backdoor und die Python-Schicht
(`fitness/api`, `fitness/catalog`). YAML-KB-SOT bleibt `~/dev/fitness`
(als `fitness/catalog/kb` anbinden). Einstieg Catalog: `coach catalog`.
Ownership-Karte: `docs/OWNERSHIP-MAP.md`.

---

# fitness-dev — Architektur

Stand: 2026-06-12

---

## Stack

```
React + Vite        :5902 (dev)     ~/fitness-dev/src/
Node.js Server      :9100           ~/fitness-dev/server.mjs
Fitness Agent API   :9150           ~/fitness-dev/fitness/api/main.py (fitness-api.service)
YAML Katalog        —               ~/fitness-dev/catalog/
Session-Daten       —               ~/.aos/fitness/
```

---

## Exercise KB Server (Python/aiohttp :9120)

Der `fitness-agent` stellt einen dedizierten Server für die semantische Exercise Library bereit. Er dient als "Coach Brain" API.

| Endpoint | Methode | Beschreibung |
|----------|---------|-------------|
| `/exercises` | GET | Liste aller Übungen aus den YAML-Files |
| `/exercise/{id}` | GET | Detaildaten (Muskeln, Equipment, Notes) |
| `/resolve?q=` | GET | Löst Freitext/Aliase auf canonical IDs auf |
| `/muscles` | GET | Muskel-Taxonomie aus muscles.yml |
| `/taxonomy` | GET | Kombiniertes Schema (Muskeln, Rules, Bridge) |
| `/inbox` | GET | Liste der KI-angereicherten Neuanfragen |
| `/inbox/{id}/approve` | POST | Freigabe einer Übung in die KB |
| `/inbox/{id}` | DELETE | Ablehnen/Löschen einer Inbox-Anfrage |

CORS ist für alle Origins aktiviert, um die Integration in die PWA und lokale Tools zu ermöglichen.

---

## Server (server.mjs)

Node.js HTTP-Server, kein Framework.

| Endpoint | Methode | Beschreibung |
|----------|---------|-------------|
| `/health` | GET | Status |
| `/session?date=` | GET/POST | Tages-Session (Übungen, Block, Ort, Dauer, Notes) |
| `/session/history?limit=` | GET | Letzte N Sessions |
| `/session/latest` | GET | Neueste Session |
| `/exercises/search?q=` | GET | Suche lokal + wger + yuhonas |
| `/coverage/detailed?days=` | GET | Muscle-Coverage mit Gewichtung |
| `/coverage/gaps?days=` | GET | Untertrainierte Muskelgruppen |
| `/blocks` | GET | Split-Labels (Push/Pull/Legs etc.) |
| `/plan/today?date=` | GET | Plan-Hint für heute |
| `/export/csv?days=` | GET | CSV pro Übung (detailliert) |
| `/export/pflichtaufgabe` | GET | CSV pro Einheit (Datum, Block, Ort, Dauer) |
| `/fitness/export` | POST | Markdown-Export (Obsidian, Coach Sheet, Plan) |
| `/theme` | GET/POST | UI-Theme |

---

## Navigation-Architektur (Hub & Sheet System)

Seit 2026-06-15 unterstützt die App zwei Navigationsmodi, konfiguriert über `navMode` (localStorage: `fitness-navMode`).

### 1. Tabs-Modus (Klassisch)
Standard-Tab-Navigation mit Bottom-Navbar auf Mobile. Einfacher Austausch der Views (Content Swap).

### 2. Hub-Modus (Native Feel)
Ein hierarchisches System, das für ein immersives App-Erlebnis optimiert ist.

- **Background Hub (Dashboard)**: Das Dashboard bleibt permanent im Hintergrund gemountet. Beim Öffnen einer Sub-View wird es herangezoomt (`scale-98`), leicht unscharf (`blur-2px`) und transparent.
- **Foreground Sheets**: Alle anderen Views (Session, Learn, etc.) öffnen sich als **Full-Screen Slide-up Sheets** von unten über das Dashboard.
- **UX-Vorteile**: Kein Neuladen beim Rücksprung zum Dashboard (Instant State), mehr Platz durch Wegfall der Navbar, klare Fokusführung.
- **Implementation**: Realisiert in `App.jsx` mittels CSS-Transitions (`cubic-bezier(0.32, 0.72, 0, 1)`) und bedingter Render-Logik.

---

## UI & Theme System

### Modularisierung (src/styles/themes/)
Die UI-Themes sind vollständig modularisiert. Jedes der 36+ Themes verfügt über eine eigene Datei im Verzeichnis `src/styles/themes/`.

- **Engine**: `src/styles.css` importiert die Themes mittels `@import` am Dateianfang.
- **Variablen-Struktur**: Alle Themes nutzen ein konsistentes Set an CSS-Variablen:
  - `--bg`, `--bg2`, `--panel`: Tiefen-Ebenen der App.
  - `--card`, `--card-hover`: Interaktive Elemente.
  - `--accent`, `--accent-glow`: Branding und visuelle Highlights.
  - `--glass`: Transparenz-Layer für Overlays.

### AlphaOS Design Language
- **Glassmorphism**: Starker Einsatz von Backdrop-Blur und subtilen Borders (`.alpha-glass`).
- **High Density**: Fokus auf Informationsdichte ohne visuelle Überladung (JetBrains Mono für Daten).
- **Native Motion**: Animationen folgen biologischen Beschleunigungskurven für ein wertiges Haptik-Gefühl.

---

## Frontend (src/)

Zwei Navigationsmodi: `tabs` (Bottom-Nav) und `home` (Hub & Sheet System, Hub im Hintergrund).

```
src/views/                  — Jeder Tab ist ein Unterverzeichnis mit index.jsx
├─ Dashboard/               — Überblick, heutiger Plan, Activity-Heatmap, Coverage
├─ Session/                 — Workout-Logging (Block, Ort, Dauer, Übungen, BodyMap)
├─ Habits/                  — Habit-Tracking (HabitSync-Integration)
├─ Journal/                 — Text-Notizen mit Datum
├─ WeeklyReview/            — Wochenreport, Charts, Muscle-Impact
├─ Learn/                   — Anatomy Teaching + Exercise Library (catalog/kb)
├─ Settings/                — Themes, Split, Nav-Modus, Layout, Sprache
├─ Coach/                   — AI-Coach (nicht in NAV_ITEMS, via #coach)
├─ AppGate.jsx              — Hub-Homescreen (nur navMode=home als #gate)
├─ Inbox/                   — Exercise-Inbox (nicht in NAV_ITEMS, kein aktiver Tab)
└─ Muscles/                 — Body-Map + Coverage (nicht in NAV_ITEMS, kein aktiver Tab)

src/components/
├─ layout/                  — Sidebar (Desktop-Pinned), MobileNav (Bottom-Bar)
├─ common/                  — ErrorBoundary, UserProfile
├─ dashboard/               — ActivityHeatmap, DashboardWidget, MuscleCoverage, etc.
├─ BodyMap.jsx              — react-body-highlighter (Session, Dashboard)
├─ MuscleHighlightMap.jsx   — react-muscle-highlighter (Muscles Tab)
├─ ExerciseSearchOverlay.jsx — Suche lokal + wger + yuhonas
├─ PlanBuilder.jsx          — Trainingsplanung
├─ HabitWidget.jsx          — HabitSync-Integration
└─ ExerciseInsightModal.jsx — Anatomy Teaching Modal (globaler State in App.jsx)
```

**NAV_ITEMS** (Reihenfolge entspricht Swipe-Reihenfolge auf Mobile):
`session` → `review` → `learn` → `settings`

**@db Alias (vite.config.js):**
- Default: `src/db.js` (Barrel für `src/lib/db/*.js`, alle Calls → Node-Server :9100, `isLocalMode() = true`)
- `--mode firebase`: `src/db.firestore.js` (Firestore SDK direkt, Auth-Gate, `isLocalMode() = false`)

---

## Datenschichten

Drei Quellen, eine Hierarchie:

```
custom_yaml (Semantic Truth)     ~/fitness-dev/catalog/
  ↑ überschreibt bei Konflikt
wger (:8000, lokal)              Exercise Master Data, Tracking Backend
  ↑ ergänzt
yuhonas/free-exercise-db         Bilder, alternative Namen, Varianten
```

**Was jede Schicht liefert:**

| Schicht | Liefert | Fehlt |
|---------|---------|-------|
| wger + yuhonas | Namen, Muskel-Tags, Bilder, IDs | Gelenkaktionen, Fehlerbilder, Feel Cues, didaktischer Layer |
| custom_yaml | Anatomy Teaching, Bewegungsmuster, Coaching Notes | — das ist der Wert |

---

## Katalog (~/fitness-dev/catalog/)

```
catalog/
├─ config.yml
├─ data_source_priority.yml
├─ exercises/                    — Exercise-Definitionen (canonical IDs)
├─ anatomy_teaching/             — Didaktischer Layer pro Übung
├─ maps/
│  ├─ aliases.yml                — Freie Eingabe → canonical_id
│  ├─ wger_mapping.yml           — wger Muscle-ID (1–16) → interne catalog Muscle-ID ✓ befüllt
│  └─ external_db_mapping.yml    — custom_id ↔ yuhonas_id (Placeholder)
├─ muscles/
│  ├─ muscles.yml                — Muskel-Taxonomie (22 granulare IDs)
│  ├─ muscle_coverage_rules.yml  — primary 1.0 / secondary 0.5 / stabilizer 0.2 + RPE-Faktoren
│  └─ body_highlighter_bridge.yml — Muskeln → visuelle Body-Regionen (enabled: false)
└─ rules/
   ├─ program_rules.yml          — PPL, Sätze/Wdh, Periodisierung
   ├─ progression_rules.yml      — Double Progression, Deload
   └─ safety_rules.yml           — Kontraindikationen, Joint-Schutz
```

Build: `npm run build:catalog` → `~/.aos/fitness/workouts/catalog.json`

**Muscle-Mapping Hierarchie:**
Session-JSONs speichern Muscle-Namen als Strings (wger `name_en`: `"Chest"`, `"Lats"`, `"Lower back"` etc.).
`muscleToGroupId()` in server.mjs mappt diese auf interne Gruppen-IDs für Coverage-Berechnung.
`wger_mapping.yml` mappt numerische wger IDs → granulare catalog-IDs (für zukünftigen wger-Sync).

---

## Anatomy Teaching Schema

```yaml
anatomy_teaching:
  exercise_id: string
  title: string

  main_lesson:
    - string

  joint_actions:
    joint_name:
      - flexion_concentric
      - extension_eccentric
      - stabilization

  muscle_roles:
    primary: [muscle]
    secondary: [muscle]
    stabilizers: [muscle]

  feel_map:
    muscle_name:
      cue: string

  simple_explanation: string
  detailed_explanation: string
  coaching_cues: [string]

  common_errors_explained:
    error_name:
      reason: string
      muscles_to_teach: [muscle]
      correction: string

  variations_teach:
    variation_name:
      teaches: string

  quiz_prompts:
    - question: string
      answer: string
```

---

## BodyMap (Visualisierung) — Zwei Bibliotheken

**Stufe 1: Dashboard & Session (react-body-highlighter)**

`BodyMap.jsx` nutzt `react-body-highlighter` und rendert anterior + posterior Körpermodell für eine schnelle Übersicht.
Datenfluss:

```
Session-Exercises (done: true)
  ↓ exercisesToModelData()    [BodyMap.jsx]
  ├─ Pfad A (präzise):  wger_muscle_ids.primary/secondary → WGER_TO_RBH → RBH-Muskelname
  └─ Pfad B (Fallback): primaryMuscles/secondaryMuscles (Strings) → LABEL_TO_GROUP → GROUP_TO_RBH → RBH-Muskelname
  ↓
react-body-highlighter <Model>  (anterior oder posterior)
```

`WGER_TO_RBH` mappt wger-Muscle-IDs 1–16 direkt auf RBH-Muskelregionen.
Primary-Muscles zählen doppelt (`score +2`), Secondary einfach (`+1`). `frequency` steuert die Einfärbungsintensität.

---

**Stufe 2: Muscles View (react-muscle-highlighter)**

`DetailedMuscleMap.jsx` nutzt `react-muscle-highlighter` für eine interaktive, hochauflösende Ansicht im Muscles-Tab.
Vorteil: Klickbare Regionen, bessere Intensitätsstufen, front/back/side Ansichten.
Datenfluss: Exercises → `muscleMapping.js` → RBH Slugs → Intensity Scale (1-4).

---

**Zukunft: Granulare Muskel-Visualisierung (Stufe 3)**

`catalog/kb/muscles/body_highlighter_bridge.yml` (`enabled: false`) ist die Konfiguration für eine
zukünftige Erweiterung: Mapping von granularen Katalog-Muskel-IDs (aus `muscles.yml`, 22 IDs wie
`pectoralis_major`, `anterior_deltoid`) auf RBH-Regionen.

---

## Session-Format (data/sessions/YYYY-MM-DD.json)

```json
{
  "date": "2026-05-17",
  "block": "Push",
  "location": "Gym",
  "duration": 60,
  "session_id": null,
  "rev": 3,
  "exercises": [
    {
      "name": "Bankdrücken",
      "exercise_id": "barbell_bench",
      "setsArray": [
        { "reps": 8, "weight": 80 },
        { "reps": 8, "weight": 80 }
      ],
      "primaryMuscles": ["chest"],
      "secondaryMuscles": ["triceps", "shoulders"],
      "done": true,
      "rpe": 8
    }
  ],
  "effort": 8,
  "notes": "",
  "saved_at": "2026-05-17T18:30:00Z",
  "snapshot_version": 1
}
```

`setsArray` ist die alleinige Quelle pro Übung (Reps/Gewicht pro Satz) — ein
älteres, paralleles `sets`/`reps`/`weight`-Scalar-Feld existiert nur noch als
Backward-Compat-Lesefeld in `ExerciseItem` (`db/schemas.py`) für Sessions von
vor diesem Fix, wird bei neuen Writes nicht mehr befüllt. `rev` ist eine
serverseitig hochgezählte Revision (siehe nächste Sektion).

---

## Session-Storage: Schichten & Konfliktmodell

Vier Schichten, klare Rollenverteilung (Stand: 2026-08-23-Fix, vorher hatte
Node einen eigenen, unkoordinierten SQLite-Writer parallel zu Python — siehe
Git-Historie "Session-Storage-Redesign" für den vollen Befund):

```
JSON-Datei (~/.aos/fitness/users/<uid>/sessions/*.json)
  = Source of Truth. Node (server.mjs) UND Python (fitness/api/routers/
    sessions.py) können hier direkt schreiben — beides sind vollwertige,
    unabhängige Session-Write-Pfade (Node: Dev-Proxy :9100, Python: Prod-API
    :9150 direkt, z.B. über Tailscale-Funnel).
      ↓ awaited Notify (POST /internal/sync/session)
SQLite (training_history.sqlite)
  = Abgeleiteter Index, EIN Schreiber: fitness/catalog/api/sync_gateway.py
    (SQLAlchemy). INSERT ... ON CONFLICT DO UPDATE auf
    UNIQUE(date, session_id, exercise_id) — kein Delete-before-Insert mehr,
    dadurch kein Zwischenzustand ganz ohne Rows für eine Session. Aus der
    Session entfernte Übungen werden gezielt per Differenzmenge gelöscht.
    session_id wird als "" (nicht NULL) gespeichert — SQLite behandelt NULL
    in UNIQUE-Indizes als paarweise verschieden, ein NULL-Wert hätte den
    Conflict-Check für Default-Sessions nie greifen lassen.
      ↓ fire-and-forget (Remote)
Firestore (fitness/{uid}/sessions/{date__sessionId})
  = Remote-Mirror, rev-basiertes Last-Write-Wins (fitness/firestore/
    mirror.py::on_session, läuft eingebettet in fitness-api.service).
    Ersetzt den früheren saved_at-String-Vergleich, der bei Client-Uhr-Drift
    den falschen Stand gewinnen lassen konnte — rev ist ein serverseitig
    (nie clientseitig) hochgezählter Zähler pro Save, monoton pro Gerät.
    Bei echtem rev-Gleichstand: saved_at als Tie-Breaker (kein Feld-Merge/
    CRDT, ganzes Dokument gewinnt).
      ↕ awaited Push-Fehler → .pending-firestore-retries.json
        (abarbeitbar über POST /firestore/sync, kein eigener Scheduler)
Frontend-State (useSession.js)
  = sessionId wird einmalig bei "Neues Workout" per crypto.randomUUID()
    vergeben (vorher Date.now(), kollisionsanfällig bei zwei Geräten im
    selben Millisekunden-Fenster) und danach für die gesamte Session-
    Lebensdauer unverändert mitgeschickt.
      ↕ Runtime-Draft (localStorage, Backstop, siehe unten)
```

**Vierte Schicht — Frontend-Runtime-Draft (2026-08-30, `sessionRuntimeStore.js`,
Dokumentationslücke geschlossen 2026-09-05):** zusätzlich zu den drei
Server-/DB-Schichten oben hält der Client während des Editierens einen
eigenen Zwischenstand in `localStorage`
(`fitness-session-runtime-v1`, `src/lib/sessionRuntimeStore.js`) —
unabhängig davon, ob ein Save gerade lokal, queued (offline) oder bereits
serverseitig bestätigt ist. **Konfliktregel: der Draft gewinnt beim nächsten
Laden immer über den zuletzt bekannten Server-/Firestore-Stand** (Merge in
`useSession.js`), so lange er existiert — das ist bewusst so und kein
Firestore-rev-Vergleich wie bei Schicht 3, sondern reiner Zeit-Vorrang für
den lokalen Client. Zweck: ein Reload, Tab-Kill oder eine kurze Offline-
Phase soll niemals wie "Workout nicht gespeichert" aussehen, selbst wenn der
eigentliche Sync (Node→SQLite, Node/Firestore-Mirror, oder direkt Firestore
bei der PWA) noch nicht durchgelaufen ist. Der Draft wird erst nach
bestätigtem Save wieder geräumt. Betrifft **beide** `@db`-Implementierungen
gleichermaßen (lokal wie Firebase-Build) — die drei DB-Schichten oben
unterscheiden sich je nach Build, dieser Draft-Layer nicht.

**Was bewusst NICHT gemacht wurde** (Scope-Grenze): kein CRDT/Feld-Merge bei
echtem rev-Gleichstand, keine rückwirkende Korrektur historischer Zero-Value-
Zeilen in `training_history` (nur neue Writes profitieren), kein `set_index`
für Per-Satz-Rows in SQLite (die Tabelle bleibt aggregiert pro Exercise, wie
zuvor — eine echte Per-Satz-Granularität wäre eine Schema-Erweiterung), kein
dauerhaft "führender" Layer zwischen `local/*.js` und `firestore/*.js`
(beide bleiben architektonisch eigenständig, siehe `src/views/Session/
AUDIT.md` "Auffälligkeiten 2026-09-05" für den vollen Befund inkl. Firestore-
KB-Fallback-Fix).

---

## Firestore (Firebase PWA + Bisync)

Details → [FIRESTORE.md](FIRESTORE.md)

```
fitness-dev/
├── firestore/                    Python-Modul (sync-Logik)
│   ├── _db.py                    Firebase-Init, shared
│   ├── sync.py                   pull/push one-shot
│   ├── sync_cli.py               CLI entry (python -m firestore.sync_cli)
│   └── mirror.py                 on_snapshot Daemon
├── firestore-mirror.mjs          Node: lokal → Firestore (server.mjs import)
├── firestore-sync.mjs            Node: spawnt Python pull/push
└── pwa/                          Firebase PWA (fitness-aos.web.app)
```

| Richtung | Mechanismus | Trigger |
|----------|-------------|---------|
| lokal → Firestore | `firestore-mirror.mjs` | automatisch bei POST /session + /journal |
| Firestore → lokal (live) | `python -m firestore.mirror` | on_snapshot Daemon |
| Firestore → lokal (once) | `fitness-sync pull` | manuell |
| lokal → Firestore (once) | `fitness-sync push` | manuell |

---

## Externe Services

| Service | Port | Zweck |
|---------|------|-------|
| wger (Docker) | :8000 | Exercise Master Data — 845 Exercises, 16 Muscles mit stabilen IDs |
| HabitSync | :6842 | HabitWidget Integration |

**wger Muscle-IDs** (stabil, für wger_mapping.yml):
`1` Biceps · `2` Anterior deltoid · `4` Pectoralis major · `5` Triceps · `6` Rectus abdominis
`7` Gastrocnemius · `8` Gluteus maximus · `9` Trapezius · `10` Quads · `11` Hamstrings
`12` Latissimus dorsi · `13` Brachialis · `14` Obliques · `15` Soleus · `16` Erector spinae

---

## Body Data (fitness-mail)

Fitbit-Daten via IMAP-Poller (`bin/fitness-mail`), Systemd-Timer 2× täglich (11:00 + 19:00).

```
~/.aos/fitness/body/YYYY-MM-DD.json
  weight_kg, bmi, body_fat_pct, lean_mass_kg
  steps, active_min, calories_burned, distance_km
  sleep_h, sleep_score, sleep_deep_min, sleep_rem_min
  resting_hr
  weekly_steps, weekly_distance_km, weekly_active_min, weekly_calories_avg
```

Endpoint: `GET /fitness/body?days=N` (von WeightChart.jsx genutzt, shared mit fuel-dev + relax-dev).

---

## Commands

| Befehl | Zweck |
|--------|-------|
| `npm run dev` | Backend (:9100) + Vite (:5902) |
| `npm run ui:dev` | Nur Vite |
| `npm run build` | Production Build → dist/ |
| `npm run build:catalog` | Katalog → ~/.aos/fitness/workouts/catalog.json |
| `fitnessctl start/stop/status` | Server-Management |

---

## Deployment & Directory Evolution (Stand: 2026-06-13)

Das Projekt nutzt eine **Safe-Production-Pipeline**, um Entwicklung und Releases strikt zu trennen.

### Struktur
*   **`~/fitness-dev`**: Source of Truth, Arbeits-Repository.
*   **`~/fitness`**: Release-Vessel. Enthält nur die für den Firebase-Deploy notwendigen Configs und den Build-Output.
*   **`dist-firebase/`**: Befindet sich in `~/fitness/`. Hier landet der Cloud-optimierte Build.

### Deployment-Workflow (Lokal)

1.  **Vorbereitung**: `npm run build:firebase` (in `fitness-dev`) baut das Projekt direkt nach `~/fitness/dist-firebase/`.
2.  **Testen (Preview)**: `npm run preview-firebase` erstellt einen temporären Firebase Hosting Link (Preview Channel). Ideal zum Testen am Handy vor dem Live-Gang.
3.  **Live-Gang**: `npm run deploy-firebase` rollt den Build aus `~/fitness/dist-firebase/` live aus.

### Automatisierung

*   **Lokaler Git Hook (`.git/hooks/post-commit`)**: Trigget bei Frontend-Änderungen automatisch `npm run deploy-firebase`.
*   **GitHub Actions (`.github/workflows/deploy-pwa.yml`)**: Führt den Deploy direkt aus dem Repository-Root aus (für CI/CD Unabhängigkeit).

### Build-Varianten (`package.json`)

*   `npm run build`: Lokaler Produktions-Build (für Desktop/Localhost).
*   `npm run build:firebase`: Cloud-Build mit Firestore-Mapping, Output nach `../fitness/dist-firebase`.
*   `npm run preview-firebase`: Build + Erstellung einer 1-Stunden-Preview-URL.
*   `npm run deploy-firebase`: Build + Live-Release (Hosting + Firestore Rules/Indexes).
