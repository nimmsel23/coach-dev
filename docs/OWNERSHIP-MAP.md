# Ownership-Map: Fitness-Agent → Catalog → Coach/Plan

Stand 2026-11-09. Korrigiert die alte Annahme „Catalog liegt unter `~/dev/backend/fitness`“.

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
| FastAPI Sessions/UI (`/fitness-api`) | `~/dev/backend/fitness/backend` | Coach mountet via `COACH_FITNESS_BACKEND_ROOT` (Default `~/dev/backend/fitness`) |
| Workout-/Plan-Schmiede UI + Plan-Editor | Plan (`~/dev/plan-dev`) konsumiert von Coach (`modules/plan`) | Plan owns editor; Coach hosts Schmiede |
| Node/Hono + Cloud Functions | `~/dev/backend` (+ `fuel/`; Kopien: plan-backend) | **kein** Coach-Inbox-SOT; Python Sessions-API läuft über Coach-Mount |
| Fitness Firebase PWA (Logging, Overlay) | `~/dev/fitness-dev` | Hosting/UI; kein nested Python-`backend/` mehr |
| Fuel App | `~/dev/fuel-dev` + Node/Python in `~/dev/backend/fuel` | Fuel Node/Python getrennt; Coach proxied Fuel → `:8000` |
| Klienten-Python / Praxis-CLIs | `~/dev/coach-dev/klienten-python`, Sibling `~/dev/praxis-dev` | `coach klientenctl`, `coach praxis` |

**Korrektur:** Coach-Laufzeit-SOT ist **coach-dev** (`server.py` :9150).
Inbox/Catalog bleiben in `coach-dev/fitness/`. Das Sessions-/Sync-Python-Paket
liegt unter `~/dev/backend/fitness/backend` und wird von Coach unter
`/fitness-api` übernommen (kein zweiter Listener). Node/Functions in
`~/dev/backend` bleiben getrennt. Die **YAML-KB** gehört dem
Daten-Repo `~/dev/fitness` und ist seit 2026-11-09 als Git-Submodul unter
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
| `~/dev/coach-dev/fitness/` | **Python/API-SOT**; `catalog/kb` = Submodul → fitness | Tooling hier |
| `~/dev/fitness-dev/fitness/` | divergierte Fork-Kopie (Workouts älter als Coach) | langfristig auf Coach-API verlassen; lokalen Python-Tree nicht weiterpflegen |
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
4. Keine neuen Kopien von `fitness/` in plan-dev oder backend anlegen.
5. Vor dem Löschen weiterer Bäume: systemd-WDs prüfen
   (`systemctl --user show <unit> -p WorkingDirectory`).
