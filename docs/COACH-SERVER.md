# Coach backend — port 9150

**SOT:** `~/dev/coach-dev/server.py` (`coach-api.service`) owns the shared Coach
HTTP entrypoint at `http://127.0.0.1:9150`. One listening process: Fitness/
Catalog/`fitness.api`, Fuel proxy, embedded Relax, Coach domains, Catalog UI
(`/` / `/catalog-ui/`), local-mode Fitness SPA (`/fitness/`), Firebase Coach UI
(`/coach/`).

Monatsmission: [FOCUS.md](../FOCUS.md). Ownership: [OWNERSHIP-MAP.md](OWNERSHIP-MAP.md).

Domain **data** (DBs, client files, YAML-KB repo) stay with their owners. No
second catalog implementation and no mandatory tree-move of `~/dev/backend`
into this repo.

## Domain APIs (Keeper-Audit 2026-11-09)

| Coach route | Mode | Notes |
| --- | --- | --- |
| `/fitness/inbox/*`, `/session`, `/exercises`, … | **local** — `fitness.api` in-process | Former fitness-python-backend; service rename only. No `:8100` hop. |
| `/fitness-api/*` | **local** — optional `fitness-dev/backend` mount | Sessions/UI fork under `/fitness-api`, not the inbox API |
| `/api/relax/*`, `/relax-api/*` | **local** — `relax-dev/server.py` embedded | Same process; no Relax worker required |
| `/api/fuel/*`, `/fuel-api/*` | **proxy** → VitalOS `:8000/api/fuel` | Only remaining entry in `coach-backends.json`. Fuel source/SQLite stay Fuel-owned (`vitalos_api` Docker). |

Catalog/Inbox/Enrichment on the laptop live here (`:9150`). Firebase Coach UI
talks via `coachCommands`/`coachInbox`; `coach-sync.service` executes the same
`fitness.api` inbox modules. `/fitness/` may still serve a built Fitness SPA for
local preview; its coach-work API is this process.

`/health` and `/_coach/health` report Coach liveness (`fitness_api: local`,
`relax_api: local`, configured backends). `/_coach/backends` probes workers;
local fitness/relax are marked ready without HTTP hop. An unavailable domain
returns 502 without taking down other domains or static UI.

### Was nicht mehr proxied wird

- Fitness/`fitness.api` / Inbox → früher tot nach `:8100` (`fitness-preview`) —
  **entfernt**; Router hängen in `attach_fitness_api()`.
- Relax → früher eigener Worker — **embedded**.
- Node-Hono `:9100` / `~/dev/fitness-backend` → **kein** Coach-Upstream und kein
  Edit-SOT für diese API.

### Bewusst offen (Upstream bleibt)

- **Fuel** → `http://127.0.0.1:8000/api/fuel` bis ein eigener Cutover Fuel in-process
  oder anders bindet. Nicht durch Tree-Move „lösen“.

## Start and manage

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements-server.txt
npm run build:catalog-ui
.venv/bin/python server.py
```

With the dependencies available to the system Python, `npm start` / `npm run server` also work. `npm run server:dev` enables reload. Stop the managed service before manually binding the same port.

```sh
bin/coach-server install
bin/coach-server status
bin/coach-server health
bin/coach-server logs
bin/coach-server restart
```

The installer links the project-owned units into the user systemd directory and
enables `coach-api.service`. Relax is loaded from `~/dev/relax-dev/server.py`
into the Coach process. Fuel stays on VitalOS `:8000`. `fitness-api.service` is
a compatibility alias for `coach-api.service` on `:9150`. Stopping/restarting
Coach also takes its Relax routes offline. The unit defaults to loopback, sets
`PYTHONPATH` for the coach-dev tree, and optionally reads
`~/.config/coach/backend.env`. **No unit restart without explicit freigabe.**

## Add a domain or change workers

`coach-backends.json` is the domain→origin registry for **proxied** domains only
(today: `fuel`). Local keepers (fitness API, relax) are not listed there.
Adding an entry adds `/api/<domain>/*` and `/<domain>-api/*` without changing
server routing code. Start/manage the corresponding worker separately, then
restart Coach (with freigabe).

Environment overrides:

- `COACH_BACKENDS_FILE`: alternate registry file.
- `COACH_FITNESS_API_URL`, `COACH_FUEL_API_URL`, `COACH_RELAX_API_URL` (or the same pattern for new domains): worker origins.
- `COACH_API_URL`: compatibility override for Fitness only. Do not point it at Coach's own `9150`; self-proxy loops are rejected.
- `COACH_HOST`, `COACH_PORT` or `--host` / `--port`: listener settings.
- `COACH_CATALOG_DIR`: explicit directory containing the built catalog `index.html`.
- `COACH_FITNESS_FRONTEND_DIR`: explicit directory containing the built local-mode Fitness app; default `~/dev/fitness-dev/frontend/dist`.
- `COACH_FITNESS_BACKEND_ROOT`: Fitness source checkout containing `backend/api/app.py`; default `~/dev/fitness-dev`.
- `COACH_UI_DIR`: explicit directory containing the built Coach UI `index.html`.
- `KLIENTEN_PYTHON_ROOT`: defaults to `~/dev/coach-dev/klienten-python` (compat symlink `~/klienten-python`).
- `KLIENTEN_UI_ROOT`: legacy ClientForge/Konsole build, defaults to `~/dev/klienten-dev`.

## UI ownership

`build:catalog-ui` reuses the existing source from `catalog-ui/`, `vitalos/fitness-app/catalog-ui`, or sibling `../fitness-dev/catalog-ui`. `COACH_CATALOG_SOURCE` selects another existing checkout. Its own frontend dependencies must be installed. Output is always Coach's ignored `dist-catalog/`; source files and runtime data are not copied or rewritten.

Catalog build lookup: `dist-catalog`, `catalog-ui/dist`, `vitalos/fitness-app/fitness/catalog/dist`, then `../fitness-dev/fitness/catalog/dist`. Build the Fitness UI in `~/dev/fitness-dev/frontend` with `VITE_API_BASE=/fitness-api pnpm exec vite build`; output stays in its ignored `frontend/dist/`. `npm run build:firebase:coach` builds the separate Firebase Coach UI in `dist-coach`.

`npm run dev` remains the Firebase Coach Vite workflow on `5902`; its API proxy points at Coach `9150`. Firebase Hosting releases do not run Python. `workspace` is a context link only; the server never exposes it as a static directory. Legacy UI assets come from `KLIENTEN_UI_ROOT`, not from a nested coach copy.

## Checks

```sh
python3 -m unittest discover -s tests -p test_server.py -v
```

Tests use temporary UI fixtures and an in-memory API transport. They cover domain/legacy routing, extension through the registry, self-proxy rejection, worker availability, request payload/query/status/cookies/compression, UI mounts, missing assets and traversal.

## Client-ID-Routen

`/<id>/` und `/k/<id>/` liefern die bestehende ClientForge-Klientenoberfläche.
`/api/client/<id>/plans` und `/k/<id>/plans` verwenden Plan-Runtime und dieselben
Daten wie die kompatible `/api/coach/local/clients/<id>/plans`-API. Legacy-APIs
werden aus klienten-python importiert, ohne weiteren Dienst auf 5200.
Lokaler Zugriff und gültiger vorhandener Klient bleiben Voraussetzung.
Details: [LOCAL-PLANNING.md](LOCAL-PLANNING.md).
