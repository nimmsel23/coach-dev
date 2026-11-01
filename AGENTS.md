# Coach repository

Coach is the coach-facing product on `dev`. VitalOS is its client Shell, pinned as the `vitalos/` submodule tracking the VitalOS `coach` branch. See `docs/COACH-ARCHITECTURE.md` for checkout and release instructions. Do not add Coach beneath VitalOS or restore the former `vitalos/coach-app` release path.

Use pnpm. Commit scoped completed changes; do not push unless explicitly requested. Publish the VitalOS `coach` commit before pushing a changed parent gitlink. Preserve unrelated changes.

Coach owns Hosting preview/production via `.github/workflows/deploy-coach.yml` and `bin/coach-release`. Rules are owned by VitalOS. Do not deploy Firestore rules from Coach.

Coach owns the shared backend on port 9150 (`server.py`, `coach-api.service`). Domain APIs dispatch through `coach-backends.json`; preserve existing domain data ownership and legacy Fitness routes. Never configure a domain upstream to loop back to Coach. Local `klienten-dev` and `workspace` symlinks are context only, not public static roots.

## Plan source ownership (2026-10-30)

Plan owns training-plan/program authoring, workout-template editors and plan
versioning/assignment code. Coach consumes the pinned `modules/plan` Git submodule; do not
maintain a second editor or use an unpinned sibling checkout. Change Plan at
`~/plan-dev`, commit, verify, then deliberately advance Coach's pointer. Publish
Plan before pushing a Coach commit referencing it. Coach retains access control,
client selection, navigation and Hosting ownership.

## Local planning

`/coach/local.html` uses the existing Coach server on 9150, the pinned Plan editor
and Plan-owned Python runtime. Client roots come from klienten-python config;
never create a duplicate client registry or serve workspace/klienten source trees.
Local writes go only to native `data/training-plans`; legacy files require explicit
import. Saving/releasing locally must never automatically publish to Firestore.
See `docs/LOCAL-PLANNING.md`.

## Coach ↔ Klienten-Kommunikation (2026-11-01)

Vor Änderungen [docs/COACH-COMMUNICATION.md](docs/COACH-COMMUNICATION.md) und
[Runbook](docs/COACH-COMMUNICATION-RUNBOOK.md) lesen. Coach besitzt die explizite
Klientenauswahl; Fitness bindet seine Seite an die eigene Cloud-Auth-UID.
Nachrichten/Lesestände liegen in `coachConversations`, außerhalb der alten
Fitness-Owner-Regel. Regeln gehören VitalOS; App-Veröffentlichung setzt deren
autorisierten Release voraus. Kein Versand an reale Konten als Entwicklungstest.
Planbezug ist eine Referenz, keine Planfreigabe. Keine Nachrichten durch
`coach-sync`, Enrichment oder eine zusätzliche Klienten-Registry leiten.
