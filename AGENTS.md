# Coach repository

Scoped fertige Arbeit: **immer committen** (nicht auf explizites „commit“ warten).

Coach is the standalone coach-facing product on `dev`. The `vitalos/` submodule is a local checkout used only as historical context and, where needed, for Git merges. It is not a Coach build or Hosting dependency. Do not directly edit files inside this checkout; make changes in their owning source repository and bring them in through the intended Git merge. See `docs/COACH-ARCHITECTURE.md` for checkout and release instructions. Do not add Coach beneath VitalOS or restore the former `vitalos/coach-app` release path.

Source-code edits belong only in `~/vitalos/src` or `~/dev/*-dev/src`, only on a `dev` branch, and must always be committed. Every `*-app` checkout is for intended Git merges/integration only and must not be edited directly.

Use pnpm. Commit scoped completed changes; push completed work to `dev` (CI promotes it; never force-push). Do not update the historical VitalOS gitlink as a prerequisite for Coach releases. Preserve unrelated changes.

Coach owns Hosting preview/production via `.github/workflows/deploy-coach.yml` and `bin/coach-release`. Rules are owned by VitalOS. Coach owns `firestore.rules.part`; VitalOS imports a committed copy through `scripts/import-coach-rules.mjs` and composes/deploys the shared ruleset. Do not deploy Firestore rules from Coach.

Coach is the backend repo plus a specialized coach frontend. Shared API on
port 9150 (`server.py`, `coach-api.service`). Domain APIs dispatch through
`coach-backends.json`; preserve existing domain data ownership and legacy
Fitness routes. Never configure a domain upstream to loop back to Coach.

`klienten-python/` lives inside this repo (own git tree + `.venv`, gitignored).
Default `KLIENTEN_PYTHON_ROOT` is `~/dev/coach-dev/klienten-python`;
`~/klienten-python` remains a compatibility symlink. Legacy ClientForge/Konsole
UI build still comes from sibling `~/dev/klienten-dev` (`KLIENTEN_UI_ROOT`) until
that surface is fully absorbed into Coach. `workspace` is context only, not a
public static root.

Praxis-/Klienten-CLIs über den Coach-Dispatcher (nicht mehr nur als lose Binaries):
`coach praxis`, `coach klientenctl` (Alias `coach klienten`), `coach konsolectl`
(Alias `coach konsole`). Braucht Sibling `~/dev/praxis-dev` (`PRAXIS_DEV_ROOT`).

## Catalog / former fitness-agent (2026-11-09)

Python catalog + FastAPI live under `fitness/` in this repo (SOT). Entry:
`coach catalog` (Alias `coach agent`). Node under `~/dev/backend` is **not**
the catalog. Ownership, lineage and archived orphans:
[docs/OWNERSHIP-MAP.md](docs/OWNERSHIP-MAP.md).

## Plan source ownership (2026-10-30)

Plan owns training-plan/program authoring, workout-template editors and plan
versioning/assignment code. Coach consumes the pinned `modules/plan` Git submodule; do not
maintain a second editor or use an unpinned sibling checkout. Change Plan at
`~/plan-dev`, commit, verify, then deliberately advance Coach's pointer. Publish
Plan before pushing a Coach commit referencing it. Since 2026-11-05 `modules/plan` holds
only Plan-specific files; everything shared comes from `fitness-dev/src` via
`modules/plan/vite-fitness-overlay.mjs` (path: `FITNESS_ROOT`, else sibling `../fitness-dev` or
`../fitness-app`; CI checks it out per `modules/plan/fitness.ref`). Coach retains access control,
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
