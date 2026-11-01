# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Sub-Docs (lies mit, je nach Bereich):**
- `../fitness/CLAUDE.md` — Python-Backend (Prod-API :9150, Dispatcher, Alembic, Packages)
- `../fitness/catalog/CLAUDE.md` — Katalog-/KB-Tool-Set (Sub-Package von `fitness/`: KB-Struktur, Coverage-Formel, Gemini-Enrichment)
- `../src/CLAUDE.md` — React-Frontend (Tabs/Views, DB-Layer, Body-Highlighter, PWA/Offline, Session-JSON-Format)
- `../anatomy-kb/CLAUDE.md` — Muskel-Anatomie-KB (Git Subtree, :9200)
- `BACKEND.md` — server.mjs API-Autodoc (Swagger/OpenAPI) + Zod-Validierung, Node↔Python-Routen-Parität

---

## fitness-dev: Praktisches Werkzeug der Diplom Präventiver Vitaltrainer Ausbildung

**fitness-dev** ist ein Kraft-Trainings-Tracking-System (PWA Frontend, Node.js Backend) das die Pflichtaufgaben der Fitnesstrainer-Module konkret unterstützt:
- Trainingspläne erstellen + dokumentieren
- Trainings-Logs führen + exportieren
- Anatomie-Lehre dokumentieren + verstehen
- Muskelabdeckungs-Analyse

---

## Arbeitshinweise für Claude Code (dauerhaft gültig, repo-weit)

- `CLAUDE.md` ist Symlink → `docs/CLAUDE.md`. Direktes Schreiben scheitert
  ("Refusing to write through symlink") — immer `docs/CLAUDE.md` editieren.
- **Release-Weg seit 2026-10-29: `dev` → `master` → `vitalos`.** Erst
  `vos-release-pr fitness` (PR `dev` → `master`; `Check` grün → Auto-Merge →
  Standalone-Live-Deploy per CI), dann `fitness-release` für `master` →
  `vitalos`. Nie von Hand auf `master` pushen (außer Hotfix); `master` wird
  lokal nie ausgecheckt. Die Beschreibung des Skripts direkt darunter stammt
  teils noch aus der Zeit vor dem PR-Schritt: es mergt jetzt `origin/master`
  (nicht `dev`) nach `vitalos`, mergt vor dem Parent-Push `origin/master` ein
  und gleicht Submodul-Checkouts an die Pointer an.
- **`~/vitalos/bin/fitness-release` ist der bevorzugte Weg für den
  `master`→`vitalos`-Merge + Deploy** (dünner Wrapper um
  `~/vitalos/bin/vos-release fitness`, verifiziert + branch-Fix
  2026-08-22). Er pusht `~/fitness-dev`s `dev`-Branch, mergt ihn in den
  `~/vitalos/fitness-app`-Worktree, pusht dort — was den Post-Push-Hook
  triggert (`pnpm run firebase`: KB-Data-Rebuild → `vite build --mode
  firebase` → stamp-sw → snapshot → `firebase deploy --only hosting` nach
  `fitness-aos.web.app`) — und bumpt danach den Submodule-Pointer im
  `~/vitalos`-Parent-Repo. `vos-release` deckt neben `fitness` auch fuel/
  habits/journal/learn/relax ab, siehe `~/vitalos/bin/vos-release --help`.
  Läuft interaktiv mit `gum confirm`-Rückfragen vor den kritischen Git-
  Operationen; `--yes` überspringt diese — nur nach expliziter User-
  Bestätigung verwenden, da das Skript einen echten Prod-Deploy auslöst.
  Voraussetzung: `~/fitness-dev` sauber (`git status` clean) und `dev`-Branch
  ausgecheckt, sonst bricht `require_clean_repo`/`expect_branch` kontrolliert
  ab, bevor irgendwas gepusht wird.
  `vos-release`s `NOISE_PATTERNS[fitness]` (Stand 2026-08-31) blendet
  `fitness/catalog/kb/inbox/*` und `fitness/**/*.py` beim Clean-Check
  aus — beides wird vom Firebase-Build nie gelesen (der braucht nur
  `src/**` + KB-*Daten*-YAMLs außerhalb von `inbox/`), blockiert den
  Release also nicht mehr automatisch. Andere unstaged Änderungen
  (`src/**`, KB-Daten außerhalb `inbox/`) blockieren weiterhin zu Recht.
- `~/vitalos/fitness-app` ist ein Git-**Worktree** von `~/fitness-dev`
  (`git worktree list` zeigt alle) — kein separater Clone. Der dort
  ausgecheckte Branch heißt **`vitalos`**, nicht mehr `master`
  (umbenannt, `origin/HEAD` zeigt entsprechend auf `origin/vitalos`;
  `~/vitalos/bin/vos-release` kannte diesen Rename bis 2026-08-22 nicht und
  scheiterte mit "Expected ... on branch master, found vitalos" — dort per
  `TARGET_BRANCHES[fitness]="vitalos"` gefixt, andere Module in
  `vos-release` sind weiterhin `master`). **Dient nur dem `vitalos`-Merge +
  dem Firebase-Build/Deploy** — kein einziger laufender lokaler Server zeigt
  dorthin. Der eigentliche Dev-Server (Node `fitness-dev.service` :9100 +
  Python `fitness-api.service` :9150, inkl. eingebettetem Firestore-Watcher
  für Katalog-Approvals) läuft mit `WorkingDirectory=/home/alpha/fitness-dev`
  — sprich, jede lokale Entwicklung/jeder Funnel-Zugriff läuft über
  `~/fitness-dev`, nie über den Worktree. Verifiziert 2026-08-17 via
  `systemctl --user show <service> -p WorkingDirectory`. **`git checkout
  vitalos` in `~/fitness-dev` schlägt
  deshalb erwartbar fehl** ("bereits von Arbeitsverzeichnis in .../vitalos/...
  verwendet") — das ist kein Fehlerzustand, den man dem User meldet oder bei
  dem man nachfragt, sondern der Normalfall.
- **`fitness-dev.service` ist im Normalfall `disabled`/`inactive`**
  (verifiziert 2026-08-31, `systemctl --user status fitness-dev.service`)
  — der Dev-Server läuft praktisch immer manuell (`pnpm run dev` /
  `scripts/dev-runner.mjs` in einem Terminal), nicht als Service. Vor
  Live-Tests gegen :9100 IMMER verifizieren ob überhaupt etwas läuft
  (`curl`/`systemctl status`), nicht annehmen. Und: `server.mjs` als
  Prozessname ist über die Sibling-Repos (`fuel-dev`, `fitness-dev`, ...)
  mehrdeutig — vor einer Annahme "das ist der fitness-Prozess" immer
  `readlink -f /proc/<pid>/cwd` prüfen, nicht nur den Namen.

  Manueller Fallback, falls `fitness-release` nicht verfügbar/gewünscht ist —
  direkt ausführen statt zu stoppen:
  ```
  cd ~/fitness-dev && git push origin dev        # dev-Branch sichern
  cd ~/vitalos/fitness-app                       # vitalos ist hier schon ausgecheckt
  git merge dev --no-edit
  git push origin vitalos
  ```
  Bei Konflikten: `vitalos` entwickelt sich hier eigenständig weiter (andere
  Sessions committen direkt hierhin), ist praktisch immer die aktuellere Seite
  für Dateien, die `dev` nicht selbst geändert hat. Vor dem Auflösen kurz
  `git log --oneline -3 -- <datei>` auf beiden Branches vergleichen (`git log
  ... dev -- <datei>` vs. lokal) — zeigt `vitalos` neuere/unabhängige Commits,
  mit `git checkout --ours -- <datei> && git add <datei>` zugunsten `vitalos`
  auflösen, danach `git commit --no-edit`. Für reine Arbeit im Worktree ohne
  Merge-Absicht (z.B. Datei ansehen): `git checkout <commit-hash>` (detached)
  reicht, `vitalos` muss dafür nicht angerührt werden.
  Push von `vitalos` passiert aus `~/vitalos/fitness-app` heraus (`git push`),
  nicht aus `~/fitness-dev` — von dort ist `vitalos` ja nicht ausgecheckt.
- Live-KB-Pfad ist `fitness/catalog/kb/`. `catalog` ist Symlink darauf
  (`catalog -> fitness/catalog`), `fitness_cli` Symlink auf `fitness` — kein
  separater Alt-Baum mehr, alle drei Pfade sind identisch. Details zur
  Katalog-Struktur: `../fitness/catalog/CLAUDE.md`.
- CLI-Binary heißt `fitness-catalog` (uv-Tool unter
  `~/.local/share/uv/tools/fitness-agent/bin/`), NICHT `fitness-agent` — die
  Skill-Doku ist hier veraltet. Domain-Dispatcher `fitness agent <cmd>` ruft
  dieselbe CLI auf. `fitness-catalog doctor` für schnellen Health-Check,
  `fitness-catalog audit anatomy|exercises|coverage` (Topic angeben!) —
  `audit` ohne Topic/mit "all" hängt (>30s, vermutlich wger-Netzwerkaufruf),
  nicht mit langem Timeout erneut versuchen ohne das zu verifizieren.
- **`chmod +x` auf einen Git-Hook (`.githooks/*`) ist selbst KEIN Deploy-Befehl**
  und braucht keine Pro-Deploy-Bestätigung — es aktiviert nur eine Automatik,
  die frühestens beim nächsten tatsächlichen `git push` nach `master` greift
  (der eigentliche Deploy-Trigger bleibt dieser spätere, separate `push`-
  Befehl, den der User ohnehin selbst auslöst). Deploy-Bestätigung bleibt
  Pflicht für: `firebase deploy`, `pnpm run firebase`/`build:firebase &&
  deploy`, `git push` nach `master` selbst, `fitness-catalog push` (Prod-
  KB-Sync) — nicht für das bloße Freischalten eines bereits geschriebenen,
  gereviewten Hooks. (2026-08-14, nach einem Fall wo der Auto-Mode-
  Classifier `chmod +x .githooks/pre-push` fälschlich als Deploy blockierte.)
- **Mehrere Claude-Sessions laufen praktisch immer parallel** an diesem Repo
  (`ps aux | grep claude` zeigt üblicherweise mehrere Prozesse, teils
  eigenständige anatomy-agent-Läufe). Vor größeren Eingriffen/gemeinsam
  genutzten Dateien (`kb/inbox_*.yml` etc.): `git status`/`git log -3` bzw.
  `git log --oneline -5 -- <pfad>` prüfen — frische Commits/unerwartete
  `M`-Dateien einer anderen Session sind kein Fehler, nicht reflexartig
  reverten. Vor eigenem `git add`/`git commit`: prüfen ob die eigene Änderung
  nicht schon (mit-)committed wurde (kann auch der Enrichment-Watcher tun,
  z.T. mit falscher Attribution) — nicht blind erneut committen.
- **`git stash` ist in diesem Repo riskant**, seit `catalog`/`fitness_cli`
  Symlinks sind: `git stash -u` kann bei Symlinks silent fehlschlagen ("...
  is beyond a symbolic link"), ein danach ausgeführtes `git stash pop` poppt
  dann einen ALTEN, unrelated Stash-Eintrag statt nichts zu tun. Nach jedem
  `git stash`: `git stash list` davor/danach vergleichen.
  Sicherer Spezialfall: `git stash push -- <konkrete-datei(en)>` (ohne
  `-u`, pfad-gescoped) umgeht das Symlink-Problem und eignet sich, um
  fremdes unstaged WIP (andere Session) kurz beiseitezulegen, z.B. vor
  einem `fitness-release`-Lauf, der `require_clean_repo` verlangt.
- `~/fitness/free-exercise-db` ist ein reiner Git-Klon von
  `github.com/yuhonas/free-exercise-db` (kein eigener Code) — falls Dateien
  fehlen, ist ein frischer Klon in ein Temp-Verzeichnis + gezieltes Kopieren
  risikofrei; `git checkout -- .` im Original-Ordner wird vom
  Auto-Mode-Classifier als Bypass-Versuch geblockt — nicht versuchen,
  stattdessen User fragen oder Fresh-Clone-Weg nehmen. **Root Cause
  gefunden + gefixt (2026-08-15):** `deploy.sh`s `rsync --delete` leerte
  dieses manuell platzierte Repo bei jedem Staging-Deploy, weil es nicht in
  `$SOURCE` existiert — Fix: `--exclude "free-exercise-db"` in
  `RSYNC_EXCLUDES` (beide Kopien, `~/fitness-dev/deploy.sh` und
  `~/fitness/deploy.sh`). Details: `../fitness/catalog/CLAUDE.md`. Der oben
  beschriebene Restore-Weg bleibt trotzdem gültig, falls es doch nochmal
  passiert (z.B. durch einen manuellen `rm`) — jetzt reicht dafür sogar
  `git checkout HEAD -- .` direkt im Original-Ordner, da die Ursache (nicht
  der Auto-Mode-Classifier) das eigentliche Risiko war.
- Firestore-Bugs live debuggen statt aus Code raten: `firebase-admin`
  Python-SDK + Credentials unter `~/.env/firebase-fitness.json`
  (`firebase_admin.initialize_app(credentials.Certificate(...))`, dann
  `db.collection_group(...)` / `db.collection(...).stream()`) — deckt Bugs
  auf, die aus reinem Code-Lesen nicht zweifelsfrei hervorgehen (Dokument-
  IDs, tatsächlich gespeicherte Feldwerte).
- Nach `git push`: `gh run list --limit 5` / `gh run view <id> --log-failed`
  prüfen — Post-Push-Hook triggert automatisch Build+Deploy.
- **Session-Handoff (seit 2026-08-31):** `TODO.md` (Makro-Backlog),
  `RESULTS.md` (Session-Log) und `NEXT.md` (repo-lokal, was offen
  blieb) werden von einem `PreCompact`-Hook (`.claude/hooks/
  pre-compact-fill-docs.sh`) automatisch nachgepflegt. Bei Sessionstart
  in unklarem Zustand: `NEXT.md` zuerst lesen, nicht nur `TODO.md`.

---

## Architektur: Zwei Schichten

### 1. fitness-dev (dieses Repo) — der Tempel
Node.js Backend + React Frontend. Logging, Visualisierung, Export.
Details: `../src/CLAUDE.md`.

### 2. fitness/ — Python Backend (Prod-API :9150 + Katalog-Tool-Set)
`fitness/api/` ist das Prod-Backend selbst (FastAPI). `fitness/catalog/` ist
ein **Sub-Package** darin — das KB-/Katalog-Tool-Set (Claude/Gemini nutzen es,
um den Katalog zu erweitern), kein eigenständiges Backend. Details:
`../fitness/CLAUDE.md` (Backend, Dispatcher, Alembic) und
`../fitness/catalog/CLAUDE.md` (KB-Struktur, Coverage-Formel).

---

## Backend (neu) — `backend/`

Neues, schlankes Python-Backend (FastAPI + Firestore-Sync + Desktop-Meldungen), Ziel-Port 9150, nur 127.0.0.1,
läuft standalone vom Repo-Root: `python3 -m backend serve` · `python3 -m backend sync pull|run|push sessions`.
Details, Routen und Entscheidungen: `backend/README.md`. Kernpunkte: kein SQLite (die alte `training_history`
hat keine UID-Spalte → Klienten kollidieren), JSON unter `~/.aos/fitness/users/<uid>/sessions/` ist die Quelle,
eine Konfliktfunktion `decide()` für Pull/Daemon/Push, Löschen lokal mit Tombstone, `sync push` ist standardmäßig
Dry-Run. Unit-Vorschläge unter `backend/deploy/` sind **nicht aktiv** — `fitness-api.service` (:9150) und
`fitness-firestore-daemon.service` sind seit 2026-10-15 auf Wunsch gestoppt, dürfen nie parallel zu den neuen
Prozessen auf denselben Daten schreiben. Frontend-Fork: `frontend/`, Notifications: `backend/notifier/`.

## Push-Benachrichtigungen (Klienten-Workout → Coach)

Cloud Function `onClientWorkout` meldet dem Coach neue Klienten-Sessions per FCM; der Service Worker zeigt sie
mit Buttons und Sammelmeldung pro Klient. Texte stehen in `functions/notifications.yaml`, Schalter im
Setup-Tab (Notification-Panel). Der Coach-Tab läuft **standalone aus `~/coach-dev`** (`vos-coach.web.app`),
dort liegt auch der Hash-Router. Details, Datenfluss, Deploy-Stand: `docs/PUSH-NOTIFICATIONS.md`.

## Backend — Server-Rollen auf einen Blick

| Datei | Port | Typ | Rolle |
|-------|------|-----|-------|
| `server.mjs` | 9100 | Node/Hono | **DEV-Server** — Vite-Proxy-Target, Frontend-Dev |
| `fitness/api/main.py` | 9150 | Python/FastAPI | **Prod-Backend** — Tailscale-Funnel, Direktimports, Service `fitness-api.service` |

**server.mjs** (Hono, `@hono/node-server`):
- API-Routen: `/session`, `/journal`, `/exercises/search`, `/coverage`, `/fitness/plan`, `/fitness/weekly`, `/fitness/export`, `/fitness/body`
- Static-Serving (dist/ oder public/) + SPA-Fallback
- Proxies: wger (lokal, derzeit gestoppt), HabitSync (:6842)
- **Session-Storage (seit 2026-08-23, siehe Sub-Doc-Sektion "Session-Storage:
  Schichten & Konfliktmodell" in `docs/ARCHITECTURE.md`):** `POST /session`
  schreibt nur noch die JSON-Datei (SOT) und benachrichtigt danach — awaited,
  nicht mehr fire-and-forget — `fitness-api.service`, das per SQLAlchemy-
  Upsert die einzige `training_history.sqlite`-Instanz schreibt. Node hat
  keinen eigenen SQLite-Writer mehr (früher paralleler, unkoordinierter
  better-sqlite3-Writer, Ursache für ~57/116 Zero-Value-Zeilen). Response
  trägt `sqliteSync: false`, wenn der Python-Sync fehlschlägt — der JSON-Save
  selbst bleibt davon unberührt.
- **wger Status (2026-08-30)**: Der Docker-Stack unter `~/.local/docker-apps/wger` ist aktuell bewusst gestoppt, weil wger faktisch nicht als aktives Fitness-Backend genutzt wird. Relevante SOTs fuer Plaene, Sessions und lokale Runtime bleiben `server.mjs`/`fitness-api.service` plus `~/.aos/fitness/`. Falls wger spaeter wieder aktiviert wird, Host-Zugang ueber `http://localhost` bzw. `WGER_BASE=http://127.0.0.1/api/v2`, nicht `:8000`.
- **wger Gewichtssync**: `POST /fitness/body` mit `weight_kg` → schreibt Body-JSON + pusht `POST /api/v2/weightentry/` zu wger (fire-and-forget). Token: `WGER_API_TOKEN` env. Base-URL: `WGER_BASE` env (frueher oft `:8000` dokumentiert, tatsaechlicher Host-Zugang ueber `:80`, siehe `../fitness/catalog/CLAUDE.md`).
- **UID-Fallback (Fix 2026-08-15)**: alle Routen ohne expliziten `uid`-Query-Param
  fallen jetzt einheitlich auf `FITNESS_UID` (aufgelöst aus `.active-uid`-Datei
  bzw. Env, Modul-Konstante oben in der Datei) zurück. Vorher fielen 12 Routen
  stattdessen auf den literalen String `"default"` zurück, während andere
  bereits korrekt `FITNESS_UID` nutzten — dadurch landeten Requests ohne
  `?uid=`/`X-User-UID`-Header in einem separaten `~/.aos/fitness/users/default/`-
  Ordner, byte-identisch dupliziert zur echten UID (verifiziert + Ordner
  gelöscht). Das Python-Prod-Backend (`fitness/api/config.py::_uid_from_request`)
  hatte diesen Bug nie — dort war die Fallback-Kette schon korrekt bis auf
  `_active_uid_fallback()`.

**API-Autodoc (2026-08-31, `@hono/swagger-ui` + `@hono/zod-openapi`):**
`GET /docs` (Swagger UI) und `GET /openapi.json` (das Spec selbst) laufen
mit. Zwei Ebenen, bewusst nicht identisch tief dokumentiert:
- **Basis-Ebene (alle ~60 Routen):** `buildOpenApiSpec()` in `server.mjs`
  introspektiert zur Laufzeit Honos eigene Routing-Tabelle (`app.routes`,
  offiziell öffentliches API laut `hono-base.d.ts`) und listet jede Route
  mit Pfad/Methode/Path-Params — kein Handschrift-Eintrag, kann also nie
  hinter dem Code zurückfallen, liefert aber keine Body-/Response-Schemas.
- **Zod-Ebene (nur `GET /exercises/search`, `GET /fitness/plan`,
  `POST /session`):** `app` ist `OpenAPIHono` statt `Hono` (Drop-in-Ersatz,
  alle anderen `app.get/post/...`-Aufrufe unverändert lauffähig). Diese drei
  Routen sind stattdessen über `app.openapi(createRoute({...}), handler)`
  mit echten Zod-Schemas registriert — inkl. echter Request-Validierung
  (kaputte Query-Werte/Bodies geben jetzt `400` mit ZodError statt vorher
  stillem Fallback auf leere Defaults). `POST /session`s Body-Schema ist
  bewusst `.loose()` + fast komplett optional, um reale Session-Payloads mit
  gewachsenen Zusatzfeldern (`slots[]`, `rev`, ...) nicht zurückzuweisen —
  Ziel ist Malformed-Input-Schutz, keine strenge Shape-Gate-Validierung.
  `GET /openapi.json` merged beide Ebenen: Basis-Spec als Fallback, die
  Zod-Routen überschreiben ihren jeweiligen Pfad/Methode-Eintrag mit dem
  über `app.getOpenAPIDocument()` gewonnenen, schema-reichen Eintrag.
- Muster für weitere Routen: siehe die drei bestehenden `createRoute(...)`-
  Blöcke in `server.mjs` als Vorlage.

**fitness-runtime.mjs** (Shared Runtime): `searchExercises()`, `buildPlan()`,
`getWeeklySummary()` (via Python weekly.py), `exportSessionMarkdown()`.

**Daten**: `~/.aos/fitness/`
- `sessions/YYYY-MM-DD.json` — Session-Logs (SOT für Node-Server)
- `sessions/training_history.sqlite` — SQLite Mirror (SOT für catalog Python-Tools)
- `journal/YYYY-MM-DD.md` — Text-Notizen
- `body/YYYY-MM-DD.json` — Körpermessungen (Fitbit-Pipeline)
- `plan.json` — Aktiver Trainingsplan
- `agent-state/` — catalog Runtime-State (Symlink: catalog/state)

---

## Commands

| Befehl | Zweck |
|--------|-------|
| `pnpm run dev` | Backend (9100) + Vite DevServer (5902) mit HMR |
| `pnpm run ui:dev` | Nur Vite DevServer (Port 5902) |
| `pnpm run build` | Production-Build in `dist/` |
| `pnpm run build:catalog` | Katalog → ~/.aos/fitness/workouts/catalog.json |
| `fitnessctl dev status` / `fitnessctl prod status` | Service-Status Dev bzw. Prod |
| `fitness sync kb\|pull\|pull-uid\|push\|watch\|all` | KB-Sync + Firestore-Sync (`fitness/commands/sync.py`) |
| `fitness catalog` | Katalog-TUI (Dashboard/Inbox-Review "Neuzugänge"/Browser/Plan/Lesson/History) |
| `fitness enrich-watch` | Gemini-Enrichment-Daemon im Vordergrund/Ad-hoc starten (läuft normalerweise als `fitness-enricher.service`) |
| `systemctl --user status fitness-enricher.service` | Status des dauerhaften Enrichment-Watchers |
| `fitness session today` | Heutige Session anzeigen |
| `fitness coverage -d DAYS` | Muskelabdeckung der letzten N Tage |
| `pnpm run build:firebase` | Firebase-PWA-Build (`vite build --mode firebase` → `dist-firebase/`) — kein eigenes `pwa/`-Verzeichnis mehr, Scripts liegen im Root-`package.json` |
| `pnpm run firebase` | Firebase-PWA bauen + deployen (`build:firebase && deploy:firebase`) |

Weitere Dispatcher (fitness-devctl/fitness-prodctl/fitnessctl): `../fitness/CLAUDE.md`.

---

## API-Referenz

| Endpoint | Methode | Beschreibung |
|----------|---------|-------------|
| `/health` | GET | Server-Status |
| `/exercise/:id/teaching` | GET | Anatomy-Lesson aus catalog/kb/anatomy_teaching/ |
| `/coaching-notes[?tag=]` | GET | Coaching Notes ("WhatsApp Wisdom Drops") aus catalog/kb/coaching_notes/, siehe `../fitness/catalog/CLAUDE.md` |
| `/coaching-notes/product-signals` | GET | Offene UX-/Produkt-Reibungspunkte, aus Coaching-Notes extrahiert |
| `/session?date=YYYY-MM-DD` | GET/POST | Tageslog — POST schreibt JSON (SOT), Python synct danach SQLite |
| `/session/history?limit=10` | GET | Letzte N Sessions |
| `/exercises/search?q=...` | GET | Search lokal + wger + yuhonas |
| `/fitness/plan?template=ppl&split=6` | GET | Trainingsplan-Generator |
| `/fitness/weekly?week=2025-W45` | GET | Wochenreport (week: "current" oder "YYYY-Www") |
| `/fitness/export` | POST | Session/Plan/Sheet/Lesson-Export |
| `/theme` | GET/POST | UI-Theme-Pref |
| `/fitness/body?days=30` | GET | Körpermessungen (Gewicht, BMI, Schritte, Schlaf, HR) der letzten N Tage |
| `/fitness/body` | POST | Body-Eintrag speichern + wger-Gewichtssync (wenn `weight_kg` vorhanden) |
| `/firestore/status` | GET | Firestore-Verbindungsstatus (`{ ok, project }`) |
| `/firestore/sync` | POST | Letzte 30 Sessions → Firestore pushen |
| `/docs` | GET | Swagger UI — interaktive API-Doku, siehe Abschnitt "API-Autodoc" unten |
| `/openapi.json` | GET | OpenAPI-3.0-Spec, zur Laufzeit aus `app.routes` generiert |

---

## Muscle-Normalisierung (CLI)

`fitness_cli/commands/__init__.py::muscle_to_group(name)` mappt rohe
Session-Muskelnamen (`"201_latissimus_dorsi"`, `"Back"`, `"back"`) auf
kanonische Gruppen (`"back"`) via Präfix-Range. `muscle_group_label(group)`
gibt den deutschen Anzeigenamen zurück (`"Rücken"`).

---

## Abhängigkeiten

- **wger lokal** — primäres Backend, lokal gehostet (Port-Gotcha: `../fitness/catalog/CLAUDE.md`)
- **yuhonas_free_exercise_db** — optional, Bilder + Varianten
- **React** ^18.3, **Vite** ^5.4, **TailwindCSS** ^3.4
- **react-body-highlighter** ^2.0.5 — Body-Map UI
- **recharts** — Charts (WeightChart, Coverage-Trends)
- **@hono/swagger-ui**, **@hono/zod-openapi**, **zod** ^4 — API-Autodoc in `server.mjs` (`/docs`, `/openapi.json`), siehe API-Autodoc-Absatz oben

---

## Workflow

1. **Ausbildung läuft** — User macht Fitnesstrainer-Module, Pflichtaufgaben
2. **User loggt Sessions** — über Session-View, JSON (SOT) + Python-Sync nach SQLite
3. **AI Agent erweitert Katalog** — nutzt `fitness/catalog`-Tools (`audit anatomy` → fehlende Übungen, Gemini generiert YAML, `map-wger` → wger-IDs)
4. **fitness-dev zeigt es** — Anatomie-Layer, Coverage-Analyse, BodyMap
5. **Loop** — mehr Logs → bessere Coverage-Analyse → bessere Vorschläge

---

## Status

- ✅ DEV-Server (Node.js, Port 9100) — server.mjs, Hono, Vite-Proxy-Target
- ✅ Python Prod-Backend (FastAPI, Port 9150) — Tailscale-Funnel
- ✅ Frontend Views (Dashboard, Session, Journal, Muscles, Learn, Weekly, Habits, Settings, Inbox)
- ✅ Swipe-Navigation + Gym Mode (layout scaling)
- ✅ Dual DB-Layer (`@db` Alias, lokal vs. Firebase-Build)
- ✅ wger + yuhonas Integration
- ✅ Katalog-Struktur in `fitness/catalog/kb/` (Exercises, Anatomy Teaching, Rules, Registry)
- ✅ Pytest-Suite (`fitness/catalog/tests/`, ~60 vorbestehende Fehler, siehe Sub-Doc)
- ✅ Session-Storage: JSON (SOT, Node) + SQLite-Upsert (einziger Schreiber:
  Python via SQLAlchemy, `UNIQUE(date, session_id, exercise_id)`), rev-
  basiertes Firestore-Konfliktmodell (Details: `docs/ARCHITECTURE.md`)
- ✅ Gmail-Pipeline (bin/fitness-mail, Fitbit-Daten)
- ✅ Firestore Sync + PWA Offline-Unterstützung (SW + IndexedDB offline-queue)
- ✅ Firebase PWA: `pnpm run build:firebase` → `~/fitness/dist-firebase/`
- ✅ anatomy-kb Integration (Git Subtree, :9200)
- ✅ Exercise-Insight-Modal zeigt bei fehlender Lesson echte wger/yuhonas-
  Rohdaten statt erfundenem Keyword-Fallback-Text (Details: `../src/CLAUDE.md`)
- ✅ Vertex-AI-Fallback für Coach-Inbox-Reenrich, unabhängig vom lokalen
  Backend (Details: `../src/CLAUDE.md`)
- ⏳ AI Agent Workflow (Gemini → anatomy_teaching YAML-Generierung, laufend)
- ⏳ Coverage-Granularität (primary/secondary/stabilizer) — teilweise
- ⏳ Anatomie-Lehre für alle Übungen (~28 von ~50+ im Katalog)
- ✅ Fitness-Tabs integriert (2026-10-20): Plan, 6Pack und Skills liegen im
  Fitness-Build unter `src/views/{Plan,SixPack,Skills}`. Ihre eigenständigen
  Arbeitsrepos (`~/plan-dev`, `~/6pack-dev`, `~/skills-dev`) bleiben verfügbar;
  Fitness hat keine Gitlinks oder Workspace-Importer für diese Apps mehr.
  `dev` bleibt der App-Entwicklungsbranch, `fitness` der Fitness-Integrations-
  branch. Vite/Firebase baut die Fitness-App direkt aus diesem Checkout.
  `@vos/cross-app-aliases` nutzt weiterhin `link:` für seine pfadbasierte
  Auflösung.
- ⏳ Coach-Tab-Gesamtaufräumung (`views/Coach/`, 5 Sub-Tabs, ~1000 Zeilen) —
  noch nicht begonnen, Details + Zielbild in `../src/CLAUDE.md`

## Mini-Apps: Splash / Service Worker / Manifest (seit 2026-10-16)

- Splash, Service Worker und SW-Register kommen aus `@vos/mini-app-shell` (SSOT `~/vitalos/packages/mini-app-shell`, hier vendored unter `scripts/mini-app-shell/` — nicht editieren, Aktualisieren/Drift: `node ~/vitalos/packages/mini-app-shell/cli.mjs vendor scripts/mini-app-shell [--check]`; Konfig `mini-app.json`).
- Solo-Builds `training`/`atlas`: `scripts/stamp-training.mjs` → `stampApp` (Manifest, Titel `<Name> - VitalOS`, Icons aus `solo-icons/<mode>/`, Splash); der SW ist hier der Haupt-SW (generiert, s. u.).
- **Haupt-Service-Worker ist generiert (seit 2026-10-16):** Quelle ist `mini-app.json` → App `fitness` (+ `frontend` für den Backend-Neubau-Fork) und das Template aus `@vos/mini-app-shell`. `public/sw.js` gibt es nicht mehr (archiviert: `docs/archive/sw.fitness-main-v1.js`); ältere Doku-Verweise auf `public/sw.js` meinen den generierten `sw.js`. Erzeugt wird er beim Build per `node scripts/mini-app-shell/cli.mjs sw <outDir> --app fitness` (ersetzt `stamp-sw.mjs`; `build`, `build:firebase:client`, `build:training`, `build:atlas`). Der Vite-Dev-Server liefert keinen SW mehr (kein Stale-Cache in der Entwicklung).
- **Splash der Haupt-App (seit 2026-10-16):** `build` (→ `dist`) und `build:firebase:client` rufen zusätzlich `cli.mjs splash <outDir> --app fitness` (Splash + "Update wird geladen …"-Loader in `index.html`, Icon `/icon-192.png`, Akzent aus `mini-app.json`). Nicht im Dev-Server. Training/Atlas bekommen ihn über `stamp-training.mjs`.
- **Änderungen am SW-Verhalten** in `mini-app.json` machen (SWR-Pfade, `neverCache`, Queue, Notifications) und danach `node scripts/mini-app-shell/cli.mjs parity --app fitness --old docs/archive/sw.fitness-main-v1.js` (bzw. `--app frontend --old frontend/public/sw.js`; `scripts/test-sw-parity.mjs` ist der Vorläufer, liefert dasselbe) laufen lassen — es spielt 36 Fetch-Szenarien (online/offline) plus Install/Activate/Messages gegen den archivierten Original-SW. Nicht abgedeckt: der Queue-Konfliktpfad (HTTP 409, nur Frontend-Fork).
- 6Pack, Plan und Skills haben eigenständige Dev-Repos; ihre Fitness-Tabs werden
  aus `src/views/` im Fitness-Repo gebaut. Coach bleibt im `src/views/Coach/`
  integriert. Firebase Deploys laufen über den Fitness-Workflow.
- Vor Push/Release: `vos-overview --plan`.
