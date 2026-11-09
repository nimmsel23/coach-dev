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
| Exercise-/Anatomy-Katalog (YAML-KB, Enrichment, Inbox, Audit) | `~/dev/coach-dev/fitness/catalog/` | `coach catalog`, Alias `coach agent` |
| FastAPI / Prod-API :9150 (Sessions, Workouts, Body, Sync) | `~/dev/coach-dev/fitness/api/` | `coach-api.service`, WD `~/dev/coach-dev` |
| Workout-/Plan-Schmiede UI + Plan-Editor | Plan (`~/dev/plan-dev`) konsumiert von Coach (`modules/plan`) | Plan owns editor; Coach hosts Schmiede |
| Node/Hono Dev-Backend, Cloud Functions | `~/dev/backend` (und `~/dev/plan-backend`) | **kein** Python-Catalog |
| Fitness Firebase PWA (Logging, Overlay) | `~/dev/fitness-dev` | Hosting/UI; Python-Tree dort ist **Fork-Rest**, nicht API-SOT |
| Fuel App | `~/dev/fuel-dev` (+ historisch `fuel-backend`) | getrennt von Fitness-Catalog |
| Klienten-Python / Praxis-CLIs | `~/dev/coach-dev/klienten-python`, Sibling `~/dev/praxis-dev` | `coach klientenctl`, `coach praxis` |

**Korrektur:** `~/dev/backend` ist Node-SOT. Der Python-Catalog ist nach
`coach-dev/fitness/` eingezogen (nicht nach `backend/fitness`).

## Lineage der „Agent“-Namen

| Alt | Heute |
|---|---|
| `fitness-agent` CLI / Daemon | `coach catalog` / `fitness.catalog.cli` (+ Enricher-Service) |
| `fitness_cli` Package | `coach-dev/fitness/` (Package `fitness`) |
| Workout-Generator-Skripte aus Catalog | Coach API `fitness/api/routers/workouts.py` + Plan-Editor |
| KB-Datenrepo `nimmsel23/fitness` (`~/dev/fitness`) | Inhalt ≈ `coach-dev/fitness/catalog/kb/` (Coach-Tree ist neuer/aktiver) |

## Restkopien / Orphans (Bereinigungsstand)

| Pfad | Status | Aktion |
|---|---|---|
| `~/dev/coach-dev/fitness/` | **SOT** | behalten |
| `~/dev/fitness-dev/fitness/` | divergierte Fork-Kopie (Workouts älter als Coach) | langfristig auf Coach-API verlassen; lokalen Python-Tree nicht weiterpflegen |
| `~/dev/fitness` | separates Git-Repo, KB nahezu = Coach-`catalog/kb` | nicht mehr schreiben; später Archiv/Deprecation |
| `~/dev/fitness-cli` | ungenutzte Teilkopie | → `~/dev/_archive/2026-11-09-fitness-orphans/` |
| `~/dev/fitness-backend` | WD der **disabled** `fitness-dev.service` | → Archiv; Unit auf `coach-dev` umgestellt oder Unit belassen disabled |
| `~/dev/fuel-backend` | historischer Fuel-Node-WD | lassen bis Fuel-AL aufräumt |
| `plan-dev/catalog`, `plan-dev/fitness_cli` | kaputte Symlinks (Ziel `fitness/` fehlt) | entfernt; Catalog gehört Coach |
| `plan-dev/fitnessctl*` u. ä. | Fork-Schuld | → `plan-dev/archive/` |

## Regel für Agenten

1. Catalog-/Enrichment-/Audit-Arbeit nur unter `coach-dev/fitness/catalog/`.
2. Workout-/Plan-UI und -Logik: Plan-Repo editieren, Coach-Pointer bewusst bumpen.
3. Keine neuen Kopien von `fitness/` in plan-dev oder backend anlegen.
4. Vor dem Löschen weiterer Bäume: diesen Stand und systemd-WDs prüfen
   (`systemctl --user show <unit> -p WorkingDirectory`).
