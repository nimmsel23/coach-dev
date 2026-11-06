# CLAUDE.md — fitness/catalog

Sub-Package von `fitness/` (Python-Backend, siehe `../CLAUDE.md`) — **nur**
das Katalog-/KB-Tool-Set: Übungen, Anatomie-Lehre, Coverage-Berechnung. Kein
eigenständiges Backend — die Prod-API (:9150) läuft in `fitness/api/`, siehe
`../CLAUDE.md`. Wird von `fitness-agent` (Katalog erweitern) und
`fitness-dev-coding-agent` (fitness-app selbst) genutzt.

---

## Rolle

Python-Tool-Set das Claude oder Gemini als Tool nutzt, um den Übungs-Katalog zu
erweitern. Mission: Training als angewandte Anatomie — nicht nur „welche Muskeln
trainiert diese Übung" sondern „welche Bewegung erklärt mir Anatomie praktisch am
eigenen Körper". Das ist der didaktische Layer, den wger/yuhonas/Open-Source-DBs
nicht liefern.

**Zwei Agenten-Rollen:**
- `fitness-agent` → schreibt + erweitert Katalog (`kb/`), erkennt Lücken, schreibt Tickets
- `fitness-dev-coding-agent` → implementiert Tickets in Code, baut fitness-app

```
AI Agent (Claude / Gemini)
    ↓ ruft auf
fitness.catalog             Python KB-Tool-Set (importiert von fitness/api/)
    ├── resolve_query()          Exercise-Name → canonical_id
    ├── teach_exercise()         Anatomie-Lesson aus YAML rendern
    ├── log_training_entry()     Eintrag in SQLite schreiben
    ├── build_plan()             Trainingsplan generieren
    ├── audit()                  Katalog-Qualität prüfen (was fehlt?)
    ├── build_coach_sheet()      Coaching-Daten strukturiert aufbereiten
    └── map_wger()               Exercise ↔ wger_id zuordnen
    ↓ schreibt in
kb/anatomy_teaching/*.yml  Anatomie-YAML (Ursprung, Ansatz, Innervation)
kb/exercises/*.yml         Exercise-Definitionen
~/.aos/fitness/sessions/training_history.sqlite
```

**Wozu neben wger:**
- Anatomie-Detail (Ursprung, Ansatz, Innervation, Funktion) — Ausbildungs-Level
- Coaching-Qualität (häufige Fehler, Technik-Cues, Progressionen)
- Coverage-Granularität (primary / secondary / stabilizer auf Muskel-Ebene)
- HIT-spezifische Hinweise (Stretch-Position, Peak-Kontraktion, TuT)

**CLI-Einstieg:** `python3 -m catalog.catalog <command>`. Binary:
`fitness-catalog` (uv-Tool, unter
`~/.local/share/uv/tools/fitness-agent/bin/`).

**Vollständige Command-Liste** (`fitness-catalog --help`):

| Bereich | Commands |
|---------|----------|
| Setup/Diagnose | `bootstrap`, `doctor`, `wger-check` |
| Katalog-Pflege | `audit [topic] [--enrich N]` (topics u.a. `anatomy`, `exercises`, `coverage`, `demand`, `source-consistency`), `add-exercise`, `enrich`, `watch`, `alias-add` |
| Import/Mapping | `import` (Bulk, One-Shot — siehe unten), `reimport <query> [--source wger\|yuhonas\|both]` (Einzel-Reimport → `kb/inbox/`), `map-wger --exercise <id/query> [--write]`, `export-wger-index [--show-unmapped]` |
| Inbox/Review | `inbox list\|show\|approve\|reenrich\|delete\|graveyard\|restore\|attach-sources [file_id] [--apply]` (Non-TUI-Review), `graveyard list\|restore\|tui` |
| Resolve/Query | `resolve`, `coverage`, `report` |
| Training-Log | `log`, `history`, `progress`, `plan` |
| Lehre/Export | `teach`, `coach-sheet`, `export-exercise`, `export-coverage`, `preview` |
| Sync | `push [--dry-run] [--force]` (KB → Firestore, default nur `FITNESS_ENV=prod`), `push-changed` (nur geänderte IDs aus Git-Range) |
| UI | `tui` (Dashboard/Inbox-Review/Browser/Plan/Lesson/History) |

`import` ist als One-Shot-Bulk-Import gedacht, siehe Memory
`project_wger_bulk_import_one_shot`.

**Kein `user-data` hier:** Runtime-User-Daten-Reparatur (Sessions/History)
gehört fachlich nicht zum Katalog-KB-Tool-Set und lebt seit 2026-08-07 in
`fitness/runtime/` (eigene Typer-App), gemountet nur noch unter `fitness
user-data <cmd>` (`fitness/cli.py`), nicht mehr unter `fitness-catalog`. Details:
`../CLAUDE.md`.

---

## Katalog-Struktur (`kb/`)

```
fitness/catalog/
├─ config.yml
├─ data_source_priority.yml
├─ kb/                             — Knowledge Base (SOT-Ordner)
│  ├─ exercises/                   — Exercise-Definitionen (canonical IDs)
│  ├─ inbox/                       — unreviewte Drafts (inbox_*.yml, alleinige Ablage seit 2026-07-25)
│  ├─ anatomy_teaching/            — Anatomie-YAML (Ursprung, Ansatz, Innervation, Funktion)
│  ├─ registry/
│  │  ├─ aliases.yml, wger_mapping.yml   — Namensauflösung / wger-Zuordnung
│  │  ├─ wger_exercises_id.yml           — wger_id → wger_name (Rohdaten)
│  │  ├─ wger_muscles.yml                — wger muscle_id → catalog muscle group
│  │  └─ wger_catalog_index.yml          — wger_id → catalog_id (auto-generated, `fitness-agent export-wger-index`)
│  ├─ muscles/
│  │  ├─ muscles.yml               — Muskel-Taxonomie (100er-Regionen, nach Muskelgröße nummeriert)
│  │  └─ muscle_coverage_rules.yml — Gewichtungen (primary/secondary/stabilizer)
│  └─ rules/
│     ├─ program_rules.yml, progression_rules.yml, safety_rules.yml
├─ api/                            — Firestore-Watcher, Sync-Gateway (Session-JSON → SQLite), Compat-Shim `api.py` → `fitness.api.main`
└─ tests/                          — Pytest-Suite (resolver, coverage, planner, teaching, weekly)
```

`kb/inbox/*.yml` ist versionierte Catalog-Quelle und wird nicht ignoriert.
Draft-Erzeuger (Session-Enrichment, Queue, Reimport und `new-draft`) committen
jeweils nur die neu geschriebene Draft-Datei automatisch; Graveyard-Restore
committet zusätzlich die aktualisierte Tombstone-Registry. Ein Auto-Commit
approved den Draft nicht und pusht/deployt nichts. Schlägt Git fehl, bleibt der
Draft lokal erhalten und der Writer protokolliert den Fehler.

`kb/maps/` existiert **nicht** (nie existiert) — `aliases.yml`/`wger_mapping.yml`
liegen in `kb/registry/`. Bei neuen `load_catalog_yaml()`-Aufrufen: Pfad immer
gegen `ls kb/` verifizieren, nicht vom Funktionsnamen ausgehen (`except
FileNotFoundError: return {}` verschluckt Tippfehler still).

**Muskel-Hierarchie:** `parent:`-Feld in der Taxonomie +
`build_muscle_parent_map()`/`rollup_parent_scores()` in `coverage.py`, Ergebnis
additiv in `muscle_scores_with_parents` (mutiert `muscle_scores` nicht). Relevant
für granulare Highlighter: `wger_id` als Signal reicht nur für die grobe
RBH-Ebene — z.B. hat die Rotatorenmanschette keine eigene `wger_id`, das
`parent`-Feld deckt das ab.

**Muskel-IDs (FMA, seit 2026-10-22):** Nummerierte Muskel-YAMLs in
`kb/muscles/**` tragen `fma_id: FMA:<nummer>` (Foundational Model of Anatomy,
abgefragt über die EBI-OLS-API). Die FMA-ID ist die eindeutige Identität eines
Muskels; Aliase sind nur Eingabehilfen. Grund: `medialer kopf`/`lateraler kopf`
bezeichnen bei Trizeps und Wade verschiedene Muskeln, deshalb wurden diese
Aliase entfernt (Commit `2492ae2`). Die Zuordnung ist für 52 Muskeln gesetzt;
Sammelbegriffe und Teilregionen ohne eindeutiges Whole-Muscle-Konzept in FMA
(Trapezius-Teile, Deltoid-Köpfe, Obliquen, Erector spinae, Adduktoren-Gruppe,
Quadriceps- und Hamstring-Gruppe) haben bewusst kein `fma_id`. Neue Muskeln:
Konzept in FMA suchen (`https://www.ebi.ac.uk/ols4/api/search?q=<name>&ontology=fma`)
und das Whole-Muscle-Konzept wählen, nicht das Oberflächen- oder Sehnen-Konzept.

---

## Datenquellen-Integration

**Priorität**: custom_yaml (Semantic Truth) > wger (Backend) + yuhonas (Ergänzung)

- **wger** (lokal): Primäres Backend für Exercise Master Data. **Läuft NICHT auf
  :8000** trotz `docker port docker-web-1` — tatsächlicher Host-Zugang über
  `docker-nginx-1` auf Port **80** (`http://127.0.0.1/api/v2/...`). ⚠️
  `docker-nginx-1` bindet auf `0.0.0.0:80` (alle Interfaces) — sollte in der
  wger-`docker-compose.yml` auf `127.0.0.1:80` eingeschränkt werden.
  Health-Check vor Debugging: `curl -s -o /dev/null -w "%{http_code}\n"
  "http://127.0.0.1:8000/"` — offener Port ≠ funktionierende App.
- **yuhonas** (free-exercise-db): Bilder + Form-Videos, alternative Namen.
  ⚠️ **Zwei separate, unabhängige yuhonas-Integrationen im Code — nicht
  verwechseln:**
  1. `importer.py::_ensure_yuhonas_json()` — der tatsächlich aktive Pfad,
     liest die Bulk-Datei `~/fitness/free-exercise-db/dist/exercises.json`
     und importiert sie über den normalen Bulk-Import-Flow
     (`unreviewed_*.yml`).
  2. `resolver.py::build_exercise_index()`, "Durchlauf 3: Yuhonas" — toter
     Code, sucht per `catalog_path("../yuhonas")` nach
     `fitness/catalog/yuhonas/*.json` (Einzeldateien pro Übung), ein
     Verzeichnis das nie existiert hat. Läuft seit jeher ins Leere (`if
     yuhonas_dir.exists()`-Guard greift immer), vermutlich Altlast aus einer
     Vorgänger-Import-Struktur, durch (1) abgelöst aber nie entfernt. Noch
     nicht bereinigt — Entscheidung (reparieren vs. löschen) steht aus.

  **Root Cause für "Repo wird nach dem Import geleert" gefunden + gefixt
  (2026-08-15):** nicht der Importer selbst — `deploy.sh` (Staging-Deploy,
  `~/fitness-dev/deploy.sh` UND die deployte Kopie `~/fitness/deploy.sh`)
  syncte per `rsync -av --delete "$SOURCE/" "$DEST/"` von `~/fitness-dev/`
  nach `~/fitness/`. `free-exercise-db` liegt manuell unter `~/fitness/`,
  existiert aber nicht in `$SOURCE` — `--delete` löschte deshalb bei jedem
  Staging-Deploy den kompletten Klon-Inhalt, außer `.git` (generell per
  `--exclude ".git"` geschützt, daher blieb exakt der leere `.git`-Ordner
  übrig — das beobachtete Symptom). Fix: `--exclude "free-exercise-db"` zu
  `RSYNC_EXCLUDES` in beiden `deploy.sh`-Kopien ergänzt. Repo aus eigener
  Git-Historie wiederhergestellt (`git checkout HEAD -- .`, rein lokal, da
  Index+Objects intakt waren — kein Neuklon nötig). Der alte Gotcha
  ("Ursache nicht identifiziert", `_ensure_yuhonas_json()`-Docstring in
  `importer.py`) ist damit aufgelöst, der GitHub-Fallback-Fetch dort bleibt
  aber als zusätzliches Sicherheitsnetz bestehen (schadet nicht, greift nur
  noch bei echtem Erstklon-Fehlen).
- **custom_yaml**: Semantic Source of Truth, Anatomie-Lehre, überschreibt bei Konflikt.

**Dedup-Bug in `build_exercise_index()` gefixt (2026-08-15):** Durchlauf 2
(Bulk/`unreviewed_*.yml`) legte für neue, noch unbekannte Übungen einen
Bulk-Record an, registrierte ihn aber nie in `by_wger`/`by_name` — dadurch
konnte Durchlauf 3 (Yuhonas, sobald der Pfad oben gefixt ist) bzw. weitere
Bulk-Einträge in Durchlauf 2 selbst denselben Record nie wiederfinden und
legten für dieselbe reale Übung einen zweiten, separaten unreviewed-Eintrag
an — sichtbar als Duplikate in Suche/Coach-Inbox. Fix: Registrierung direkt
nach dem Anlegen des neuen Bulk-Records. Verifiziert (Alt- vs. Neu-Vergleich
von `build_exercise_index()`): 1715 → 1687 Records, −28 Duplikate — allein
aus Bulk-zu-Bulk-Merges innerhalb Durchlauf 2, der Yuhonas-Anteil des
Duplikat-Problems bleibt bestehen, bis der Pfad-Bug oben behoben ist.

**yuhonas/wger liefern flache Muskel-Namen** (`chest`, `lats`, `lower back`, ...),
keine kanonischen IDs. `muscle_index.yml::string_aliases` löst genau diese 17
Wörter zu kanonischen Gruppen-IDs auf — beim Import/Enrichment IMMER darüber
auflösen, nie `normalize_muscle_id()` (reines Slugify) roh übernehmen.

**wger-Schulter-Taxonomie hat nur eine ID** (`2 = Anterior deltoid`, keine
separate Rear-/Lateral-Delt-ID) — jede importierte Schulterübung landete
deshalb ungefiltert auf `301_anterior_deltoid`. Fix:
`reclassify_deltoid_muscles()` in `importer.py`, Keyword-Heuristik (rear/
reverse/posterior/face pull/external rotation → posterior; lateral/side
raise/upright row → lateral) reklassifiziert nach dem wger-Lookup, vor dem
Schreiben der unreviewed-YAML. Nur Code-Fix, keine rückwirkende Korrektur
bestehender `unreviewed_wger.yml`-Einträge (laufen durch Inbox/Gemini-Review).

**`exercises:`-Listen in Region-Dateien NUR als reine ID-Strings**, nie als
volle Objekte mit `primary_muscles`/`secondary_muscles`:
`resolver.py::build_exercise_index()` merged Muskel-Felder aus mehreren
Quellen per **Set-Union**, nicht Override — ein Objekt-Eintrag in der
Region-Datei UND einer eigenen nummerierten Datei (`041.yml`) kann dieselbe
Muskel-ID gleichzeitig in `primary_muscles` UND `secondary_muscles` landen.
Nummerierte Dateien sind die alleinige Quelle für Muskel-Rollen.

`body_region:`-Feld in `kb/muscles/**/*.yml` ist die kanonische
Regions-Taxonomie für ALLE Body-Highlighter — Gruppen-Files setzen einen
Default, einzelne Muskel-Files können ihn feiner überschreiben (`rglob` +
Feld lesen, nicht Dateinamen). Frontend hat noch hartcodierte Parallel-
Mappings (siehe `../../src/CLAUDE.md`) statt aus der KB zu lesen —
Architektur-Schuld, noch nicht aufgelöst.

**`GET /fitness/muscles/viz` (`fitness/api/routers/exercises.py`) ist als
Konstruktion selbst Architektur-Schuld** (User-Bewertung 2026-08-15: "mega
construction fail", bewusst noch nicht angefasst). Konkrete Befunde:
- `body_region:`-Feld aus dem Absatz oben existiert in KEINER einzigen
  Datei unter `kb/muscles/**/*.yml` (`grep -rl body_region` → 0 Treffer) —
  die Doku-Aussage "kanonische Regions-Taxonomie" ist Wunschzustand, nicht
  Ist-Zustand. Region kommt tatsächlich rein aus Ordner-Tiefe
  (`build_muscle_document()` in `core/muscles.py`: `is_region = path.parent
  == root`, `region = path.parent.name`), kein überschreibbares Feld.
- `muscles_viz()` sortiert Regions-Dateien nach `len(muscles)` aufsteigend
  und nutzt `setdefault` als impliziten Prioritäts-Mechanismus (kleine/
  spezifische Dateien gewinnen vor großen Sammel-Dateien) — funktioniert,
  ist aber eine stille Heuristik ohne explizite Rangfolge.
- Drittes paralleles Encoding derselben BodyMap-Slugs: `anatomy-kb/
  muscle-index.json::rbh_slugs` dupliziert `viz.body_muscles.ids` aus dem
  Catalog, aber unsynced und teils falsch (z.B. `quadriceps_femoris` hat
  `rbh_slugs: [quads]` ohne links/rechts, während `viz.body_muscles.ids`
  korrekt `[quads-left, quads-right]` führt). `rbh_slugs` wird vom
  Frontend nirgends gelesen (nur intern in anatomy-kb selbst) — totes,
  driftendes Duplikat.
- Wurzelursache laut User (2026-08-15): `anatomy-kb` war ursprünglich ein
  Symlink, wurde irgendwann zu einem echten, eigenständigen Ordner (heute
  Git Subtree, siehe `anatomy-kb/CLAUDE.md`) — dadurch konnte die
  Muskel-Daten-Kopie von `kb/muscles/` abdriften, statt dieselbe Quelle zu
  bleiben.
- User-Position (wiederholt vertreten, zuletzt 2026-08-15): eigentlich
  sollte die GESAMTE `kb/` (nicht nur `muscles/`) ein Subtree sein, der
  außerhalb dieses Repos liegt — Zielbild: genau EINE KB für Anatomie +
  Exercises, nicht mehrere Repos mit potenziell abdriftenden Teilkopien.
  Noch nicht umgesetzt, nur festgehalten.

**Nicht-Übungen (Aktivitäten) — `kb/registry/non_exercises.yml` (2026-11-01):**
HIIT, Laufen, Radfahren usw. sind Aktivitäten (Session-Feld `activityAddons`,
`src/constants/activities`), keine Exercises. Einträge aus wger/yuhonas, die
das sind (aktuell `wger_529` HIIT), stehen in dieser Sperrliste (Matching nur
über IDs) und werden gefiltert in `build_exercise_index()`,
`find_source_entries()`, Importer, `sync_exercises()` (Firestore-Push; ein echter
Push räumt das Doc als Waise ab) und im Bulk-Bundle
(`scripts/build-exercise-bulk-data.mjs` → `nonExercises.generated.js`, von
`firestore/kb.js` genutzt). Roh-Import (`unreviewed_wger.yml`) bleibt
unverändert, damit ein Reimport nichts zurückbringt. Weitere Kandidaten
(Cardio/Stretching) sind nur gelistet, nicht gesperrt — Entscheidung bei Daniel.

**`legacy_ids` (2026-11-01):** frühere IDs derselben Übung, z.B.
`inbox_back_squat` aus alten Sessions. Der Resolver behandelt sie wie
Such-Aliase (`find_by_id`/`find_exact_id`, `search_aliases`), `kbLookup.js`
ebenso. Sessions werden nie umgeschrieben. Eine ID, die in Sessions an
verschiedenen Übungen hängt (`inbox_brustmaschine`), gehört NICHT in
`legacy_ids`; dort muss der Name entscheiden.

**Claude-Beispieleinträge:** `kb/inbox/inbox_{back_squat,machine_chest_press,
incline_chest_press_machine,samurai_extension}.yml` — Tier bewusst `inbox`
(Entwurf, `review_state: draft`, Tag `claude_draft`), weil der Tier an `inbox_`
im Dateinamen hängt und Daniel sie fachlich noch nicht geprüft hat. Nach der
Prüfung: Datei nach `kb/exercises/` verschieben (dann `expert`).

---

## Coaching Notes Pipeline ("WhatsApp Wisdom Drops")

**Problem:** Spontane Coaching-Erklärungen (z.B. eine Trainingsmethoden-
Klarstellung an einen Klienten über WhatsApp) enthalten oft wiederverwendbares
Wissen, das sonst nur im Chatverlauf lebt und für die App verloren geht.
**Lösung:** Ein eigener, schlanker KB-Content-Typ (analog zu
`anatomy_teaching/`, aber ohne dessen Bewegungs-/Gelenk-Detailtiefe), der
kontextuell im Frontend auftaucht statt in einem generischen FAQ zu versanden.

```
kb/coaching_notes/*.yaml   (SSOT, von Hand/Agent geschrieben)
    ↓ Python: fitness/catalog/agent/coaching_notes.py (load_all_notes, find_notes_by_tag, load_open_product_signals)
    ↓ FastAPI: GET /coaching-notes[?tag=], GET /coaching-notes/{id}, GET /coaching-notes/product-signals
    ↓ Node-Proxy: server.mjs (/coaching-notes* → proxyToPython)
    ↓ Build-Time: scripts/build-coaching-notes.mjs → src/lib/coachNotesData.generated.js
    ↓ Frontend: src/lib/coachNotes.js (getAllCoachingNotes/getCoachingNotesByTag)
      → Timer-Tab (SixPackPromiseCard.jsx) LearnScreen, Sektion "Wisdom"
      → NoteDetailScreen (Titel/Summary/Body/Follow-up)
```

**Surfacing-Entscheidung (2026-08-22):** Erster Anlauf war ein kontextueller
Tooltip in `ActivityAddon.jsx` (erscheint beim HIIT-Activity-Finisher,
während/kurz vor dem Training) — auf User-Feedback verworfen: taucht "zu
plötzlich" auf, wenn die Session eigentlich schon läuft. Stattdessen lebt es
jetzt als durchsuchbare Liste ("Wisdom") im Timer-Tab-Learn-Screen
(`SixPackPromiseCard.jsx::LearnScreen`, dritte Sektion nach Core-Übungen und
Calisthenics-Skills) — bewusst dort statt im separaten `learn-dev`-Repo
(`~/learn-dev`, per `@learn`-Vite-Alias eingebunden, siehe `../../src/CLAUDE.md`),
weil das eine Cross-Repo-Integration gewesen wäre und der Timer-Tab thematisch
ohnehin schon HIIT-artige Core-Finisher behandelt. `CoachNoteCard.jsx`
(generische Tailwind-Karte für den ersten Anlauf) wurde wieder entfernt —
`src/lib/coachNotes.js` (die Datenzugriffs-Helper) bleibt bestehen und wird
jetzt direkt von `SixPackPromiseCard.jsx` importiert.

**Warum Build-Time-Bundle statt Live-API-Call im Frontend:** gleiches Prinzip
wie bei `SIXPACK_*`/`exerciseBulkData` (siehe `../../src/CLAUDE.md`) — Notes
ändern sich selten, brauchen aber sowohl im lokalen Dev-Betrieb als auch im
Firebase-Build (kein Zugriff auf die lokale Python-API) denselben Inhalt ohne
Firestore-Sync-Aufwand. `build:coaching-notes` läuft automatisch vor jedem
`dev`/`build`/`build:firebase` (`predev`/`prebuild`/`prebuild:firebase` →
`build:kb-data`). Die FastAPI-Route (`/coaching-notes`) bleibt trotzdem
bestehen — für Terminal-Zugriff (`fitness-catalog`-CLI o.ä.) und falls später
ein Live-Pfad gebraucht wird.

**Pipeline für einen neuen Wisdom-Drop (Claude/Agent-Workflow):**
1. Rohtext (WhatsApp-Auszug o.ä.) vom User bekommen.
2. Neue Datei `kb/coaching_notes/<slug>.yaml` anlegen, Schema:
   ```yaml
   id: <slug>                        # eindeutig, snake_case
   title: "Kurzer Frage-/Aussagetitel"
   tags: [thema1, thema2]            # frei wählbar, z.B. training_method
   applies_to:
     activity_types: [hiit]          # optional — Werte aus ACTIVITY_MUSCLE_GROUPS-Keys
     topics: [intensity_technique]   # optional — freie Themen-Tags
   source: whatsapp_coaching_<klient>_<datum>
   summary: >
     1-3 Sätze Kurzfassung.
   body: |
     Vollständige, strukturierte Erklärung (Markdown-Überschriften ##
     erlaubt, wird als whitespace-pre-line gerendert — kein Markdown-Parser
     im Frontend, also keine Links/Bold-Syntax erwarten).
   follow_up:                        # optional, Frage/Antwort-Paare
     - question: "..."
       answer: "..."
   created: "YYYY-MM-DD"
   ```
   Klientennamen/private Details generalisieren — die Note ist wiederverwendbar
   für alle Klienten, nicht Matthias-spezifisch.
2b. Optional: Rohtext unverändert als `kb/coaching_notes/<slug>.raw.txt`
   danebenlegen (Quellenarchiv, z.B. der originale WhatsApp-Export). Wird von
   Loader/Build-Script ignoriert (beide filtern nur `.yaml`/`.yml`) — reine
   Referenz für spätere Nachschlagezwecke, kein aktiver KB-Content.
3. `npm run build:coaching-notes` (oder einfach `npm run dev`/`build`, läuft
   automatisch) — generiert `coachNotesData.generated.js` neu.
4. Taucht automatisch in der "Wisdom"-Liste im Timer-Tab-Learn-Screen auf
   (`SixPackPromiseCard.jsx::LearnScreen`, nutzt `getAllCoachingNotes()`) —
   kein zusätzlicher Verdrahtungsschritt pro Note nötig. Nur bei Bedarf für
   einen *zusätzlichen*, kontextuellen Surfacing-Punkt (z.B. an einer ganz
   bestimmten Stelle im Flow) `getCoachingNotesByTag()` gezielt verwenden —
   matched gegen `tags`, `applies_to.activity_types` und `applies_to.topics`
   gleichzeitig.
5. Kein Server-Neustart nötig für die reine YAML-Änderung im Firebase-Build
   (Build-Time-Bundle) — für den lokalen Node/Python-Dev-Betrieb liest
   `load_all_notes()` bei jedem Request frisch von Disk.
6. **Produkt-/UX-Signale erkennen** (optional, aber immer prüfen): Rohtext
   nicht nur nach Coaching-Wissen durchsuchen, sondern auch nach Reibungspunkten
   in der App-Nutzung selbst (z.B. "Klient trägt nicht/verzögert ein", "Klient
   kennt Feature X nicht", "Klient hat sich die Antwort auf eine Frage selbst
   gesucht, die die App eigentlich beantworten könnte"). Falls vorhanden: als
   `product_signals:`-Liste in dieselbe YAML eintragen (Felder `signal`,
   `hypothesis`, `status: open`, siehe `hit_vs_5x5_vs_hiit.yaml` als Beispiel)
   — getrennt vom eigentlichen `body`, damit die Note selbst klientenneutral
   bleibt. Offene Signale zusätzlich unter "💬 Client-Signale" in `docs/TODO.md`
   verlinken, damit sie sichtbar sind, ohne dass diese Pipeline selbst UX-Fixes
   implementiert (das bleibt Aufgabe der jeweils zuständigen Session-/Feature-
   Arbeit, z.B. der laufenden Session-Tab-UX-Überarbeitung).
   Abfrage aller offenen Signale: `load_open_product_signals()`
   (`fitness/catalog/agent/coaching_notes.py`) bzw. `GET /coaching-notes/product-signals`.

---

## Coverage-Formel

```
coverage_score = sets × role_weight × effort_factor
```

| Role | Weight | RPE | Factor |
|------|--------|-----|--------|
| primary | 1.0 | 7 | 0.75 |
| secondary | 0.5 | 8 | 0.90 |
| stabilizer | 0.2 | 9 | 1.00 |
| minor | 0.1 | 10 | 1.05 |

## Canonical Flow / Exercise Matching

```
User Input → Alias Resolver (aliases.yml) → canonical exercise_id
→ Custom YAML Lookup → Muscle Taxonomy → Coverage Rules → Program Rules
→ Workout Generation → wger Mapping → Export / Logging → History → Progression
```

Matching-Reihenfolge: exakte canonical ID → `aliases.yml` → deutscher Name →
englischer Name → Fuzzy → wger lokal → yuhonas. Bei Unklarheit: 2–3 Treffer mit
Confidence zurückgeben, nicht raten.

## Agent-Prioritäten / Nicht erlaubt

- Custom YAML gewinnt bei Trainingslogik — überschreibt wger bei Konflikt
- Stable canonical IDs — nie durch wger-IDs ersetzen
- Unsichere Mappings als `inferred: true` markieren, nie stillschweigend speichern
- Backup vor Writes auf user-owned YAMLs
- **Nicht erlaubt:** zufällige Übungsauswahl, wger blind vertrauen, canonical
  IDs löschen/durch wger-IDs ersetzen, YAMLs ohne Backup überschreiben,
  Trainingshistorie verlieren, Muskelbeteiligung binär bewerten
  (Stabilizer ≠ Primary), Schmerz ignorieren

---

## anatomy-kb (Git Subtree, `../../anatomy-kb/`, :9200)

Muskel-Anatomie-Layer der Ausbildung, eigene `CLAUDE.md` dort. Daten-Stack:

```
wger + yuhonas → kb/exercises/ (Base-Layer) → kb/anatomy_teaching/ (Teaching-Layer)
    ↑ push_to_teaching()
anatomy-kb/muscles/ (Muskel-Layer: origin, insertion, innervation)
    ↑ Gemini-Enrichment aus Ausbildungswissen
```

---

## Gemini-Fallstricke (`fitness/catalog/agent/gemini.py`)

1. API-Key aus `.env`/Shell-Env kann Anführungszeichen enthalten
   (`GEMINI_API_KEY="..."` → wörtlich mit Quotes übernommen ohne Strip) →
   "API key not valid".
2. `gemini-2.0-flash` hat auf manchen Keys Kontingent 0 (`RESOURCE_EXHAUSTED`)
   — `gemini-2.5-flash` (AlphaOS-Konvention, `~/.env/gemini.env: GEMINI_MODEL`)
   ist der richtige Default.

---

## Exercise-Enrichment (Gemini, Watcher)

Läuft als `fitness-enricher.service` (systemd --user, `python3 -m catalog
watch` → `api/watcher.py`). Beobachtet `runtime_root()/users/*/inbox/*.json`
(= `~/.aos/fitness/users/*/inbox/`). `~/.aos/users/<uid>/fitness` ist NUR ein
Symlink auf `~/.aos/fitness/users/<uid>` — beide Pfade sind dieselben Daten.
**Gotcha:** `Path.glob("**/...")` folgt in Python 3.13+ standardmäßig keinen
Symlinks — ein Scan über `~/.aos/users/` mit `**` findet deshalb nichts, über
den physischen `runtime_root()/users`-Pfad schon.

Nach Anreicherung schreibt der Watcher `status: 'ai_enriched'` + `enriched`
zurück ins ursprüngliche `fitness/{uid}/inbox/{doc_id}`-Dokument (sonst bleibt
die Coach-Inbox-UI für immer beim `pending_review`-Platzhalter hängen —
`approveInbox()` erwartet das `enriched`-Feld).

**Coach-Approval-Rückkanal:** `firestore/mirror.py` läuft als Daemon
(`fitness-firestore-daemon.service`, `on_snapshot`-basiert, Realtime-Push von
Google — kein Polling, kein Funnel nötig). Listener `on_kb_exercises` auf
`fitness/kb/exercises`: bei `ADDED`/`MODIFIED` mit `source == "approved"` wird
die Übung nach `kb/exercises/approved_from_firebase.yml` gemergt (per
`exercise_id`, keine Duplikate) und der zugehörige `kb/inbox/inbox_*.yml`-
Draft lokal gelöscht. `iter_catalog_yaml_files()` (`core/loader.py`) globbt
beim nächsten `fitness sync kb`-Push automatisch mit.

Vier Inbox-Ablageorte im Code (lokal `kb/inbox/*.yml`, Watcher-beobachteter
`~/.aos/fitness/users/*/inbox/`, Firestore `fitness/{uid}/inbox`-Collection,
`fitness/api/config.py::INBOX_DIR`) — Konsolidierung noch offen, bei Änderung
alle vier synchron halten.

**Proaktives Enrichment beim Session-Save (2026-08-15, im Backend, kein
separater Service):** `fitness/api/routers/sessions.py::_queue_unreviewed_enrichment()`
läuft als Fire-and-Forget (`asyncio...run_in_executor`, gleiches Muster wie
`mirror_session`) direkt nach jedem `POST /session`. Für jede tatsächlich
geloggte Übung (`_performed_exercises()`, kein bloßer Plan-Eintrag) wird per
`resolve_query()` der Record-Tier geprüft — ist er bereits `"expert"`, wird
nichts getan; sonst läuft `process_inbox_file_virtual()` (→
`build_external_seed()`, mergt wger+yuhonas-Rohdaten für genau diese eine
Übung zu einem Inbox-Draft). Funktionstest verifiziert: Session mit nur einer
Expert-Übung → 0 Aufrufe, Session mit einer Bulk-Übung → genau 1 Aufruf mit
korrekter `wger_id`.

Bewusst NICHT die ältere `FITNESS_WATCHER_PROACTIVE_REFINER`-Logik (periodischer
Scan des `fitness-enricher.service`-Watchers über die "meistgenutzten
unreviewed Übungen", Default `off` via Env-Flag) — die reicherte Übungen an,
die niemand tatsächlich geloggt hatte ("the inbox watcher must not invent
history rows or phantom exercise drafts", Kommentar im Code). Der neue
Trigger ist strikt auf die Übungen der jeweils gespeicherten Session
begrenzt, läuft im selben FastAPI-Prozess statt in einem separaten
Watcher-Prozess.

**"Mergen" bei wger/yuhonas ist absichtlich KEINE Feld-Verschmelzung** (User-
Klarstellung 2026-08-31/09-01, nach mehreren Präzisierungsrunden): `inbox
attach-sources [file_id] [--apply]` (dry-run per Default) verlinkt bei einem
sicheren Treffer `wger_id`/`yuhonas_id`/`external_ids` auf oberster Ebene und
hängt zusätzlich den jeweils rohen, unveränderten wger- bzw. yuhonas-Treffer
unter `origin.wger`/`origin.yuhonas` in den Inbox-Draft (NICHT
`source_snapshot.*` — das war der erste Name, per User-Feedback umbenannt:
kollidiert sonst semantisch mit `source:` = Review-Tier-Feld unreviewed/
bulk/expert. Auch NICHT `origin.snapshots.wger` — zweiter Versuch, per
User-Feedback direkt eine Ebene flacher. `origin` existierte als Feld mit
`type`/`source_refs` bereits vorher, `wger`/`yuhonas` sind neue Schlüssel
direkt daneben). Coach-Sheet (`coach_sheet.py::render_coach_sheet_markdown()`)
zeigt das als
eigenen "## Quellen"-Abschnitt getrennt nach wger/yuhonas, ohne Merge.
Lookup-Funktion dafür ist `find_source_entries()` in `core/source_merge.py`
(gibt `{"wger": entry|None, "yuhonas": entry|None}` zurück, optional
`wger_entries`/`yuhonas_entries`/`record`-Parameter für Batch-Aufrufer, um
teure Neu-Ladungen/Rebuilds zu vermeiden). Das ist eine andere Funktion als
`build_external_seed()` (nutzt `find_source_entries()` intern, mergt danach
aber Listenfelder für neue Katalog-Seeds) — bei "Quellen zusammenführen"-
Anfragen zuerst klären, welche der beiden gemeint ist.

**Fuzzy-Match-Falle:** `_best_match()` in `source_merge.py` nutzt
`rapidfuzz.fuzz.token_set_ratio` mit `min_score=86` — zu strikt für
wger-generische vs. yuhonas-geräte-präfixierte Namen (z.B. "Walking Lunges"
vs. "Barbell/Bodyweight/Dumbbell Walking Lunge" scored nur 68–74). Das ist der
Hauptgrund, warum die meisten Inbox-Drafts nur eine der beiden Quellen haben,
nicht ein Bug in der Aufruf-Kette. Threshold-Senkung wurde noch nicht
evaluiert (Risiko: False Positives bei unterschiedlichen Übungen mit
ähnlichem Namen).

---

## Datei-Backups & parallele Sessions

- Nach mehreren Edits an `kb/**/*.yml`: `find kb -name "*.bak" -delete` —
  Edits erzeugen wiederholt Backup-Dateien, vor jedem Commit aufräumen.
- Mehrere Claude-Sessions laufen praktisch immer parallel an diesem Repo
  (`ps aux | grep claude` zeigt üblicherweise mehrere Prozesse). Vor dem
  Anfassen gemeinsam genutzter Dateien (`kb/inbox_*.yml` etc.):
  `git log --oneline -5 -- <pfad>` prüfen — ein frischer Commit einer anderen
  Session ist kein Fehler.
