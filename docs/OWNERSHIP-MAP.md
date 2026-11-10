# Ownership-Map: Fitness-Agent → Catalog → Coach/Plan

Stand 2026-11-09. **Einstieg für Agenten** — bei Zweifel diese Datei zuerst.

| Was | Wo |
|---|---|
| Coach-HTTP `:9150` | `~/dev/coach-dev/server.py` |
| Package `fitness.*` (API/Catalog-CLI) | `~/dev/coach-dev/backend/fitness` |
| Sessions + Fitness-Package `/fitness-api` | `~/dev/coach-dev/backend/fitness/` |
| anatomy-kb | `~/dev/coach-dev/anatomy-kb` |
| Node/Hono + Functions + Fuel | `~/dev/coach-dev/backend/` (`node/`, `functions/`, `fuel/`) |
| Fuel Node + Python | `~/dev/coach-dev/backend/fuel/` |
| Fitness PWA | `~/dev/fitness-dev` (kein `fitness/`-Package mehr) |
| KB YAML | `~/dev/fitness` |

## Herkunft (kurz)

Fitness und Fuel starteten als Python-„Agent“-Module (`fitness-agent`, `fuel-agent`).
Daraus wuchsen organisch Firebase-native Apps. Die Agenten sollten Kataloge
(YAML-KB) und Workout-Ableitungen per Python-Skripten managen. Heute ist der
**laufende** Pfad Coach-API + Catalog-Package, nicht mehr ein freistehender Agent.

## Catalog = KB = Expert-Brain (eine Wahrheit)

**Catalog und KB sind dasselbe Projekt:** Exercises + Muscles (+ Rules/Notes).
Es gibt nur **eine** coach-approved DB: `kb/exercises` (plus `kb/muscles`).

| Schicht | Rolle |
|---|---|
| **Bulk-Rohstoff** | Summe **wger + yuhonas** (einmaliger Import) — zu viel auf einmal fürs Expert-Gate |
| **App-Default (jetzt)** | **Original-Yuhonas wie auf Git** (Pin) — Verbandspflaster für stabilen Übungsbetrieb, bis die KB feature-dicht ist |
| **Gate** | **Exercise-Inbox** — nur Coach; Bulk wird erst `approved`, wenn enhanced und **app-feature-gerecht** |
| **Expert-Brain** | Freigegebene Einträge in `kb/exercises` — Build verbaut sie als JS in die Apps |

Beispiel warum Yuhonas allein nicht reicht: keine vorderen/hinteren Schultern → zu grob
für feinere App-Features. Catalog/KB = Coach-Werkzeug, nicht Kern der Fitness-/Coach-App
(Apps Firestore-nativ; freigegebene KB über Build/JS).

## Was wo hingehört (SOT)

| Domäne | Source of Truth | Einstieg |
|---|---|---|
| **KB / Catalog-Daten** (Exercises+Muscles, YAML) | `~/dev/fitness` → Submodul `fitness/catalog/kb` | eine Expert-DB; Gate = Inbox |
| Catalog-**Python** (CLI, Enrichment, Audit, Inbox) | `~/dev/coach-dev/fitness/catalog/` | `coach catalog` — Werkzeug, nicht App-Kern |
| **Coach-HTTP-Server** (`server.py`, Keepers) | `~/dev/coach-dev` | `coach-api.service` **:9150** — ein Prozess |
| FastAPI Catalog/Inbox/Workouts (in-process) | `~/dev/coach-dev/fitness/api/` | von `server.py` gemountet; kein `:8100` |
| FastAPI Sessions/UI (`/fitness-api`) | `~/dev/coach-dev/backend/` | Coach: `COACH_FITNESS_BACKEND_ROOT` = Repo mit Ordner `backend/` (Default `~/dev/coach-dev`) |
| anatomy-kb | `~/dev/coach-dev/anatomy-kb` | Symlink in fitness-dev; Units WD hier |
| Workout-/Plan-Schmiede UI + Plan-Editor | Plan (`~/dev/plan-dev`) konsumiert von Coach (`modules/plan`) | Plan owns editor; Coach hosts Schmiede |
| Node/Hono + Cloud Functions | `~/dev/backend` (+ `fuel/`) | **kein** Coach-Inbox/Sessions-Python-SOT |
| Fitness Firebase PWA (Logging, Overlay) | `~/dev/fitness-dev` | Hosting/UI; kein nested Python-`backend/` mehr |
| Fuel App | `~/dev/fuel-dev` + Node/Python in `~/dev/backend/fuel` | Fuel Node/Python getrennt; Coach proxied Fuel → `:8000` |
| Klienten-Python / Praxis-CLIs | `~/dev/coach-dev/klienten-python`, Sibling `~/dev/praxis-dev` | `coach klientenctl`, `coach praxis` |

**Korrektur:** Coach-Laufzeit-SOT ist **coach-dev** (`server.py` :9150).
Inbox/Catalog und Sessions-Code (`backend/`, Mount `/fitness-api`)
liegen in `coach-dev`. Node/Functions in `~/dev/backend` bleiben getrennt
(`backend/fitness/` = Pointer). Die **YAML-KB** gehört dem Daten-Repo
`~/dev/fitness` und ist seit 2026-11-09 als Git-Submodul unter
`fitness/catalog/kb` angebunden. KB-Edits dort = Working Tree des Daten-Repos
→ in `~/dev/fitness` / dem Submodul committen und den Gitlink in Coach nachziehen.

## Lineage der „Agent“-Namen

| Alt | Heute |
|---|---|
| `fitness-agent` CLI / Daemon | `coach catalog` / `fitness.catalog.cli` (+ Enricher-Service) |
| `fitness_cli` Package | `coach-dev/fitness/` (Package `fitness`) |
| Workout-Generator-Skripte aus Catalog | Coach API `fitness/api/routers/workouts.py` + Plan-Editor |
| KB-Daten | `~/dev/fitness` (subtree-split aus Coach-KB, 2026-11-06) |

## Restkopien / Orphans (Bereinigungsstand)

| Pfad | Status | Aktion |
|---|---|---|
| `~/dev/fitness` | **KB-Daten-SOT** | YAML hier versionieren |
| `~/dev/coach-dev/fitness/` | **Python/API-SOT** (`fitness.*`); `catalog/kb` = Submodul → fitness | einzige Pflege |
| `~/dev/coach-dev/backend/` | Sammelordner Domain-Pakete (`fitness/`, bald `fuel/`, …) | `PYTHONPATH` += dieser Ordner |
| `~/dev/coach-dev/backend/fitness/` | **Fitness-Package** (`fitness.*`, `/fitness-api`) | einzige Fitness-Python-SOT |
| `~/dev/coach-dev/anatomy-kb/` | **anatomy-kb SOT** | fitness-dev Symlink |
| `~/dev/backend/fitness/` | Pointer-Docs only | kein Python-Tree |
| `~/dev/fitness-dev/fitness/` | **entfernt 2026-11-09** (war 174/176 bytegleich, Coach neuer) | Archiv `_archive/2026-11-09-fitness-dev-fitness-fork`; Deploy synct aus Coach |
| `~/dev/plan-dev/fitness/` | **kein** Python-Paket mehr | Fork-Schuld schon archiviert |
| `~/dev/fitness-cli` | ungenutzte Teilkopie | → `~/dev/_archive/2026-11-09-fitness-orphans/` |
| `~/dev/fitness-backend` | WD der **disabled** `fitness-dev.service` | → Archiv; Unit WD → `fitness-dev` |
| `~/dev/backend/fuel` | Fuel Fastify-Node (ehem. fuel-backend) | SOT für Fuel-Server |
| `plan-dev/catalog`, `plan-dev/fitness_cli` | kaputte Symlinks | → `archive/fitness-fork-schuld-2026-11-09/` |
| `plan-dev/fitnessctl*` u. ä. | Fork-Schuld | → `plan-dev/archive/` |
| `fitness/coach/deploy/fitness-preview.service` | tote `:8100`-Upstream-Unit | → `archive/obsolete-units-2026-11-09/` |

## Regel für Agenten

1. **YAML-KB** (exercises/inbox/muscles/…): im Submodul `fitness/catalog/kb`
   (= `~/dev/fitness`) committen + pushen; Coach-Gitlink bumpen.
2. Catalog-**Code**/Enrichment-CLI: unter `coach-dev/fitness/catalog/` (`coach catalog`).
3. Workout-/Plan-UI: Plan-Repo; Coach-Pointer bewusst bumpen.
4. Keine neuen Kopien von `fitness/`-Python in plan-dev oder backend anlegen
   (`backend/fitness/` bleibt Pointer).
5. Vor dem Löschen weiterer Bäume: systemd-WDs prüfen
   (`systemctl --user show <unit> -p WorkingDirectory`).
