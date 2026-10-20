# Local Coach server

`server.py` is Coach's local HTTP entrypoint. It serves the existing Catalog UI, the built Firebase Coach UI, and proxies catalog API requests to the existing Fitness Python backend. It does not import the old Node server, start Fitness services, or implement a second catalog database.

## Run

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements-server.txt
npm run build:catalog-ui
.venv/bin/python server.py
```

With the dependencies available in your Python environment, `npm start` or `npm run server` also starts the server. `npm run server:dev` enables reload. Default address: `http://127.0.0.1:5903`.

| Route | Purpose |
| --- | --- |
| `/` and `/catalog-ui/` | Catalog UI: Inbox, Browser, Plan Builder, Weekly Review, Coverage |
| `/coach/` | Firebase Coach build from `dist-coach` (build with `npm run build:firebase:coach`) |
| `/_coach/health` | Local server health and UI build availability |
| `/health` | Existing backend's health, as used by Catalog UI |
| `/api`, `/fitness`, `/exercise`, `/exercises`, `/coverage` and their subpaths | Forward unchanged to the catalog backend, including query, body, method and response status |

The catalog API must already be running. Default upstream: `http://127.0.0.1:9150`. If unavailable, API requests return 502; static Coach pages remain available. The UI actions use the backend's existing data and authorization behavior. No live mutations are part of the server checks.

## Configuration

- `COACH_HOST`, `COACH_PORT`, or `--host` / `--port`: listener settings.
- `COACH_API_URL`: upstream HTTP(S) origin.
- `COACH_CATALOG_DIR`: explicit directory containing the built catalog `index.html`.
- Default catalog build lookup: `dist-catalog`, `catalog-ui/dist`, `vitalos/fitness-app/fitness/catalog/dist`, sibling `../fitness-dev/fitness/catalog/dist`.

The Catalog UI source currently belongs to Fitness. `npm run build:catalog-ui` reuses `catalog-ui/`, `vitalos/fitness-app/catalog-ui`, or `../fitness-dev/catalog-ui`, in that order. Set `COACH_CATALOG_SOURCE` to select a different existing source checkout. Install its own frontend dependencies before building. Output is always Coach's ignored `dist-catalog/`; source files and Fitness runtime data are not copied or rewritten.

`npm run dev` remains the Firebase Coach Vite workflow; `npm run preview` serves its built UI without API proxying. Firebase Hosting releases are separate and do not run Python. No systemd/autostart service is installed by adding this entrypoint.

## Checks

```sh
python3 -m unittest discover -s tests -p test_server.py -v
```

Tests use temporary UI fixtures and an in-memory API transport. They check mounts, missing assets, proxy bodies/status/cookies/compressed responses, unavailable backend handling, and filesystem traversal.
