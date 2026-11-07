# Coach project instructions

Follow [AGENTS.md](AGENTS.md) and [Coach architecture](docs/COACH-ARCHITECTURE.md).

Coach is a Fitness fork providing the coach-facing interface. Its entrypoint is `coach.html` / `src/coach-main.jsx`; client-facing VitalOS lives in the `vitalos/` submodule on branch `coach`. Plan owns training-plan authoring, program versions and assignment logic. Coach consumes the editor and adapters from its pinned `modules/plan` submodule and owns client context, access and Hosting.

Use `npm run dev` for the Coach Vite UI, `npm run build` for lint and build, and `npm start` for the local Python server (Catalog UI at `/`, Firebase Coach at `/coach/`). Hosting uses target `coach` in Firebase project `fitness-aos`. `npm run firebase` builds and deploys Coach; rules and shared Functions are not deployed here. The former `pwa/` parity workflow and Fitness systemd deployment do not apply.

Keep exercise IDs and shared Firestore contracts compatible with Fitness. Do not rename shared data keys, collections, or Firebase project IDs merely because they contain `fitness`.

The local Coach backend owns port 9150 and unifies `/api/fitness`, `/api/fuel` and `/api/relax`. Domain worker origins live in `coach-backends.json`; see `docs/COACH-SERVER.md` for service ownership and controls.

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
