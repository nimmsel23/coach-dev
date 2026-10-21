# Coach backend — port 9150

`server.py` owns the shared Coach HTTP entrypoint at `http://127.0.0.1:9150`: Fitness, Fuel, Relax and additional Coach domains. Catalog UI is at `/`; the built Firebase Coach UI is at `/coach/`.

Coach dispatches to existing domain workers. Domain implementations, databases, client identities and files remain with their current owners. No second catalog or data migration is introduced.

## Domain APIs

| Coach route | Current worker | Forwarded path example |
| --- | --- | --- |
| `/api/fitness/*` or `/fitness-api/*` | Fitness preview API `127.0.0.1:8100` | `/api/fitness/fitness/inbox` → `/fitness/inbox` |
| `/api/fuel/*` or `/fuel-api/*` | Fuel Python service `127.0.0.1:4000` | `/api/fuel/nutrition` → `/nutrition` |
| `/api/relax/*` or `/relax-api/*` | Relax worker `127.0.0.1:9123` | `/api/relax/techniques` → `/techniques` |

The Fitness worker is currently the existing staging instance; Coach does not claim that it is a dedicated production worker. Existing root Fitness APIs (`/fitness`, `/exercise`, `/session`, `/workouts`, `/api/workouts`, etc.) are forwarded unchanged for compatibility. Domain routes are registered first so Fuel/Relax requests never fall into that legacy Fitness dispatcher.

`/health` and `/_coach/health` report Coach liveness and build availability. `/_coach/backends` checks all configured workers and reports readiness separately per domain. `/api/fitness/health`, `/api/fuel/health` and `/api/relax/health` return the respective worker's original response. An unavailable domain returns 502 without taking down the other domains or static UI.

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

The installer links the project-owned units into the user systemd directory and enables `coach-api.service`. It starts the existing Relax Node implementation via `coach-relax.service`. Fitness preview (`8100`) and Fuel (`4000`) are already managed separately and are not restarted by Coach. The inactive old `fitness-api.service` unit is archived locally under `.worktrees/legacy-services`; its unit name becomes an alias for `coach-api.service`, preventing a second server from claiming `9150`. Stopping/restarting Coach also stops/restarts its Relax worker. The unit defaults to loopback and optionally reads `~/.config/coach/backend.env`.

## Add a domain or change workers

`coach-backends.json` contains the domain-to-origin registry. Adding an entry adds `/api/<domain>/*` and `/<domain>-api/*` without changing server routing code. Start/manage the corresponding worker separately, then restart Coach.

Environment overrides:

- `COACH_BACKENDS_FILE`: alternate registry file.
- `COACH_FITNESS_API_URL`, `COACH_FUEL_API_URL`, `COACH_RELAX_API_URL` (or the same pattern for new domains): worker origins.
- `COACH_API_URL`: compatibility override for Fitness only. Do not point it at Coach's own `9150`; self-proxy loops are rejected.
- `COACH_HOST`, `COACH_PORT` or `--host` / `--port`: listener settings.
- `COACH_CATALOG_DIR`: explicit directory containing the built catalog `index.html`.

## UI ownership

`build:catalog-ui` reuses the existing source from `catalog-ui/`, `vitalos/fitness-app/catalog-ui`, or sibling `../fitness-dev/catalog-ui`. `COACH_CATALOG_SOURCE` selects another existing checkout. Its own frontend dependencies must be installed. Output is always Coach's ignored `dist-catalog/`; source files and runtime data are not copied or rewritten.

Catalog build lookup: `dist-catalog`, `catalog-ui/dist`, `vitalos/fitness-app/fitness/catalog/dist`, then `../fitness-dev/fitness/catalog/dist`. `npm run build:firebase:coach` builds the separate Firebase Coach UI in `dist-coach`.

`npm run dev` remains the Firebase Coach Vite workflow on `5902`; its API proxy points at Coach `9150`. Firebase Hosting releases do not run Python. The local `klienten-dev` and `workspace` symlinks are context links; the server never exposes them as static directories.

## Checks

```sh
python3 -m unittest discover -s tests -p test_server.py -v
```

Tests use temporary UI fixtures and an in-memory API transport. They cover domain/legacy routing, extension through the registry, self-proxy rejection, worker availability, request payload/query/status/cookies/compression, UI mounts, missing assets and traversal.
