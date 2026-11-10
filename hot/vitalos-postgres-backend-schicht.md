# Ideenspeicher: VitalOS-Postgres als allgemeine Backend-Schicht

Stand: 2026-11-10  
Org-Task: `fe34e959-4771-40a2-a723-49a7204dd601` (`project:coach-dev` +cto)  
Einstieg: wenn Urgency/Door das hergibt — kein Sofort-Build.

## Intent

Eine **gemeinsame Postgres-Datenlage** für Coach-Domains (nicht nur Fuel):

- Makros / Mikros / Nutrition (Fuelctx v4)
- Workouts / Sessions / Gewicht / …
- Host bleibt **`coach-dev/server.py` (:9150)** — Domain-Module in-process
- **Kein Parallel-:8000-Reich** neben Coach

`~/workspace/VitalOS` + Postgres war als **allgemeiner Backend-Refactor** gedacht, nicht als Fuel-only-Compose. Der reine Fuel-Umweg über VitalOS als Extra-Host war überflüssig; die Postgres-Idee dahinter bleibt relevant.

## Was schon gilt

| Stück | Lage |
|---|---|
| Fitness-API | `backend/fitness` → Coach attach |
| Fuel-API | `backend/fuel` → Coach attach (`/api/fuel`, `/fuel-api`) |
| Relax | embed aus relax-dev → `/api/relax` |
| Fuelctx App | `fuel-dev` (Frontend); Deploy Node getrennt |

## Offene Fragen (wenn’s dran ist)

1. Eine DB vs. Schema-pro-Domain in einem Cluster?
2. Was bleibt SQLite lokal (`~/.aos/fuel/…`) vs. was wandert nach Postgres?
3. Relation zu `klienten-python` / Praxis-DB (`clients.db`) — mit rein oder eigene Spur?
4. Cutover-Reihenfolge: Nutrition zuerst, dann Workouts/Gewicht, oder Schema-Gerüst zuerst?

## Nicht-Ziele (vorerst)

- VitalOS wieder als zweiten API-Host ausbauen
- Sofortiger Big-Bang-Migrate ohne Door/Urgency
- Coach-HTTP (:9150) ersetzen
