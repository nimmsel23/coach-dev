# Coach and its client Shell

Coach is the coach-facing product, developed on `coach-dev/dev`. Its client Shell is the VitalOS repository at `vitalos/`, tracking the VitalOS `coach` branch. A gitlink pins the exact Shell commit. VitalOS no longer contains a direct Coach submodule, workspace package, or Coach deployment job.

```text
coach-dev/                  Coach product (dev)
  vitalos/                  VitalOS client Shell (coach)
    fitness-app/, plan-app/, ...
```

## Checkout and updates

```sh
git submodule update --init vitalos
# Initialize client apps only when working on/building that Shell:
git -C vitalos submodule update --init --recursive
```

General VitalOS changes start on its `master` branch. Merge them into `coach` deliberately; retain the exclusion of Coach. Do not re-add Coach beneath VitalOS. Existing historical Coach checkouts nested inside pinned Plan versions are separate legacy dependencies; do not update them to a Coach commit that contains VitalOS.

To update the Shell pin, commit changes on `vitalos/coach`, publish that branch when authorized, then commit the `vitalos` gitlink in Coach. `git submodule update --remote vitalos` follows remote `coach`; normal checkout uses the recorded commit.

The shared Plan editor resolves `.shared/plan` (pinned CI checkout), then `vitalos/plan-app`, then local sibling Plan checkouts. The Coach build does not require recursively installing the client Shell.

## Coach releases

- Pushes on `dev` build the Coach preview (24-hour `dev` channel).
- Manually run Coach's `Deploy Coach` workflow on `dev` with `production=true` to publish `https://vos-coach.web.app`.
- Locally, `bin/coach-release --yes` builds and deploys the committed, clean `dev` checkout. `--dry-run` prints the command. This command does not push or merge Git branches.
- `npm run firebase` also builds and deploys the current checkout directly.
- `~/vitalos/bin/coach-release` is a compatibility entrypoint to Coach's command. Coach is excluded from `vos-release --all`.
- Firestore rules remain owned by VitalOS. Coach only deploys `hosting:coach`.
- VitalOS Shell production remains on `master`; the `coach` branch has no automatic Shell production deploy.

Publish VitalOS `coach` before publishing an updated Coach parent pointer. The initial migration branches have been published; the Coach push passed preview CI. The old clean `~/vitalos/coach-app` checkout, including ignored local files, is retained at `~/coach-dev/.worktrees/legacy-vitalos-coach`.

## Local commands and inherited tooling audit (2026-10-20)

`npm run dev` and `npm run ui:dev` run Vite in Coach mode and open `/coach.html`; they do not launch or reuse the Fitness Node API. `npm start` runs the Python Coach server on loopback port 9150; Catalog UI is at `/` and `dist-coach` at `/coach/`. See [COACH-SERVER.md](COACH-SERVER.md). The Vite API proxy points to the shared Coach backend on `9150`. Fitness, Fuel and Relax use explicit domain namespaces there.

`npm run deploy` builds and deploys Coach Hosting, as does `npm run firebase`. Local systemd staging/prod deployment is not implemented for Coach. `deploy.sh`, `deploy:local`, `deploy:prod`, and the inherited `fitness*ctl` executables return an error before accessing Fitness directories or services. Manage real Fitness services from the Fitness repository.

The commit hook checks Coach HTML/assets, configs, source, generators, KB and the VitalOS pin. The documentation auto-commit hook commits only the changed documentation path, preserving other staged work. The active CI is Coach-owned. Firebase config contains only Coach Hosting; inherited Functions sources and legacy server/runtime files are not deployment entrypoints. Shared Firebase project `fitness-aos`, backend/data contracts and catalog paths keep their established names.

## Klienten-Integration (2026-10-24, Branch `integrate-klienten`)

`klienten-dev` (ClientForge/Konsole-UI) und `klienten-python` (FastAPI-Backend, vormals :5200) werden Teil von Coach. Stand: Backend und Plan-Push sind integriert, die UI-Zusammenlegung steht noch aus.

### Eine App auf :5200 (`coach_klienten.py`)

`coach_klienten:app` baut `server.create_app()` (Domain-Proxys, Coach-UI, 6Pack) und setzt die Routen von `klienten_manager.main` (`/k/*`, `/api/clients`, `/konsole/*`, `/clientforge/*`, …) davor. Reihenfolge:

1. spezifische Klienten-Routen vor den Coach-Catch-alls (`/api/<domain>`-Proxys würden `/api/clients` sonst an Fitness weiterreichen),
2. generische `/{client_id}/…`-Routen erst direkt vor dem Frontend-Catch-all (sonst überdecken sie `/health`, `/_coach/*`),
3. `/`, `/health`, `/docs`, `/openapi.json` der Klienten-App werden ausgelassen, Coachs eigene bleiben.

Läuft im venv von `klienten-python` (`psycopg2`/`sqlalchemy` werden beim Import gebraucht; das System-Python hat sie nicht):

```sh
~/klienten-python/.venv/bin/python3 -m uvicorn coach_klienten:app --app-dir ~/coach-dev --host 127.0.0.1 --port 5200
```

Unit-Vorlage: `systemd/coach-klienten.service` (**nicht installiert**; `coach-api.service` :9150 und `klienten-dev.service` sind unverändert). Getestet wurde nur mit `TestClient` gegen die echten Daten, noch nicht als laufender Dienst.

Klientendaten: `~/.local/Klienten/<id>/` (`CLIENTS_ROOT`, Profil `client.json`, `data/plan.json`, `KLIENT.md`); sessions/journal sind bei bekannter `firebase_uid` Symlinks nach `~/.aos/…`. Beim Auflisten taucht `bin` (Skriptordner) fälschlich als Klient auf, bisher nicht gefiltert.

### Plan → Firestore (`coach_plan_push.py`)

Quelle der Wahrheit für Trainingspläne ist `<Klient>/data/plan.json` (`{einheiten:[…]}`, PlanEditor-Format). Jede Einheit wird zur Routine `fitness/<firebase_uid>/routines/plan-<einheit-slug>` mit Übungen in `…/exercises/<nn>-<übung>` (Schema wie `src/lib/db/firestore/routines.js`, das der Plan-Tab der Klienten-App liest).

- IDs deterministisch, erneuter Push überschreibt statt zu duplizieren; `created_at` bleibt erhalten.
- Nur Routinen mit `source: "klienten-plan"` werden geändert oder entfernt (z. B. wenn die Einheit aus dem Plan verschwindet). In der App angelegte Routinen und fremde Routinen mit gleicher ID bleiben unberührt. Übungen, die im Plan fehlen, werden aus der gepushten Routine entfernt.
- Gewichte werden nur übernommen, wenn im Plan eine Zahl steht (`""`/unbekannt → `targetWeight: null`, `BW` → `bodyweight_reps`). Pausen („60s", „2min") → Sekunden.
- Läuft im System-Python (hat `firebase_admin`; Service-Account `~/.env/firebase-fitness.json`), nicht im Klienten-venv.

Auslöser:

```sh
python3 coach_plan_push.py <client-id> [--dry-run]     # CLI
http POST :5200/k/<client-id>/plan/push dry_run==true  # Endpoint der kombinierten App
```

und automatisch: ein erfolgreiches `POST/PUT /k/<id>/plan[/client]` bzw. `/api/client/<id>/plan` in der kombinierten App startet den Push im Hintergrund (fire-and-forget, Fehler nur im Dienst-Log). Der Auto-Push wirkt erst, wenn der Dienst mit `coach_klienten` läuft; bisher wurde nur der manuelle Push real ausgeführt (Jakob, Push-Routine vom 24.10.).

Tests: `tests/test_plan_push.py` (Umwandlung, Idempotenz, Schutz fremder Routinen, Entfernen eigener) gegen eine In-Memory-Fake-DB.

### Noch offen

1. Dienste umschalten: `coach-klienten.service` installieren, `klienten-dev.service` (:5200, bisher eigener uvicorn) bzw. `coach-api.service` (:9150) ersetzen.
2. UI: ClientForge (Plan/Habits/Journal) und Konsole (Klientenliste/CRM) in die Coach-SPA übernehmen.
3. `CLAUDE.md` von coach-dev neu schreiben (beschreibt noch fitness-dev); Filter für `bin` in der Klientenliste.
4. Einseitig: Änderungen eines Plans in der App fließen nicht nach `plan.json` zurück.
