# Ownership-Map: Fitness-Agent → Catalog → Coach/Plan

Stand 2026-11-09. Korrigiert die alte Annahme „Catalog liegt unter `~/dev/backend/fitness`“.

## Herkunft (kurz)

Fitness und Fuel starteten als Python-„Agent“-Module (`fitness-agent`, `fuel-agent`).
Daraus wuchsen organisch Firebase-native Apps. Die Agenten sollten Kataloge
(YAML-KB) und Workout-Ableitungen per Python-Skripten managen. Heute ist der
**laufende** Pfad Coach-API + Catalog-Package, nicht mehr ein freistehender Agent.

## Was wo hingehört (SOT)

| Domäne | Source of Truth | Einstieg |
|---|---|---|
| Exercise-/Anatomy-**KB-Daten** (YAML only) | `~/dev/fitness` (`nimmsel23/fitness`) | Daten-Repo; Konsumenten spiegeln/lesen |
| Catalog-**Python** (CLI, Enrichment, Audit, Inbox-Tools) | `~/dev/coach-dev/fitness/catalog/` | `coach catalog`, Alias `coach agent` |
| FastAPI / Prod-API :9150 (Sessions, Workouts, Body, Sync) | `~/dev/coach-dev/fitness/api/` | `coach-api.service`, WD `~/dev/coach-dev` |
| Workout-/Plan-Schmiede UI + Plan-Editor | Plan (`~/dev/plan-dev`) konsumiert von Coach (`modules/plan`) | Plan owns editor; Coach hosts Schmiede |
| Node/Hono Dev-Backend, Cloud Functions | `~/dev/backend` (und `~/dev/plan-backend`) | **kein** Python-Catalog / kein KB |
| Fitness Firebase PWA (Logging, Overlay) | `~/dev/fitness-dev` | Hosting/UI; Python-Tree dort ist **Fork-Rest**, nicht API-SOT |
| Fuel App | `~/dev/fuel-dev` (+ historisch `fuel-backend`) | getrennt von Fitness-Catalog |
| Klienten-Python / Praxis-CLIs | `~/dev/coach-dev/klienten-python`, Sibling `~/dev/praxis-dev` | `coach klientenctl`, `coach praxis` |

**Korrektur:** `~/dev/backend` ist Node-SOT. Python-Tooling/API liegen in
`coach-dev/fitness/`. Die **YAML-KB** gehört dem Daten-Repo `~/dev/fitness`
(nicht „stale“). `coach-dev/fitness/catalog/kb/` ist Arbeits-/Live-Spiegel —
Drift zurück nach `~/dev/fitness` spiegeln, nicht das Daten-Repo als tot behandeln.

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
| `~/dev/fitness` | **KB-Daten-SOT** | behalten; YAML hier versionieren |
| `~/dev/coach-dev/fitness/` | **Python/API-SOT**; `catalog/kb/` = Live-Spiegel | Tooling hier; KB-Drift → Daten-Repo |
| `~/dev/fitness-dev/fitness/` | divergierte Fork-Kopie (Workouts älter als Coach) | langfristig auf Coach-API verlassen; lokalen Python-Tree nicht weiterpflegen |
| `~/dev/fitness-cli` | ungenutzte Teilkopie | → `~/dev/_archive/2026-11-09-fitness-orphans/` |
| `~/dev/fitness-backend` | WD der **disabled** `fitness-dev.service` | → Archiv; Unit WD → `fitness-dev` |
| `~/dev/fuel-backend` | historischer Fuel-Node-WD | lassen bis Fuel-AL aufräumt |
| `plan-dev/catalog`, `plan-dev/fitness_cli` | kaputte Symlinks | → `archive/fitness-fork-schuld-2026-11-09/` |
| `plan-dev/fitnessctl*` u. ä. | Fork-Schuld | → `plan-dev/archive/` |
| `fitness/coach/deploy/fitness-preview.service` | tote `:8100`-Upstream-Unit | → `archive/obsolete-units-2026-11-09/` |

## Regel für Agenten

1. **YAML-KB** (exercises/inbox/muscles/…): in `~/dev/fitness` committen; Coach-`catalog/kb` danach angleichen (oder als Submodul/Subtree anbinden).
2. Catalog-**Code**/Enrichment-CLI: unter `coach-dev/fitness/catalog/` (`coach catalog`).
3. Workout-/Plan-UI: Plan-Repo; Coach-Pointer bewusst bumpen.
4. Keine neuen Kopien von `fitness/` in plan-dev oder backend anlegen.
5. Vor dem Löschen weiterer Bäume: systemd-WDs prüfen
   (`systemctl --user show <unit> -p WorkingDirectory`).
