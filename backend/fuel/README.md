# fuel/ — Fuel Domain unter Coach

```
~/dev/coach-dev/backend/fuel/   # Python-Paket `fuel` (API + CLI) + Node (server.mjs)
```

Fuel Centre — Nutrition-Tracking CLI (Catalog-first, Gemini-Fallback), plus FastAPI-Tracker.
YAML-Kataloge: `~/dev/fuel-dev/catalogs` (`FUEL_REPO_DIR`).

## Kann

| Bereich | Was |
|---|---|
| CLI | `fuel "…"`, meal/supplement/ingredient, week/micro, catalog-verify |
| Food API | loggen (Freitext→Gemini oder Katalog), patchen, Journal/Notes |
| Supplements | Log + Katalog + Estimate + Stats |
| Nutrition Query | Tag / Woche / Historie / Suche / Estimate / Compose |
| Fasting / Frames | Fenster aus Logs · Anamnese-Snapshots |
| Legacy | `/v3/*` Proxy → Node (`FUEL_V3_URL`, default `:9000`) |

App/Frontend: `~/dev/fuel-dev`.

## Runtimes

| Runtime | Einstieg | Rolle |
|---|---|---|
| Python | `fuel` / `fuel-api` | CLI + FastAPI (`fuel.api.main:app`) |
| Node | `node server.mjs` | v3 Sync/Push |

Mount: `fuel.api.integration.router` + `initialize_fuel_backend()`.

## Install

```bash
PY313="$HOME/.local/share/uv/python/cpython-3.13-linux-x86_64-gnu/bin/python3.13"
cd ~/dev/coach-dev/backend/fuel
poetry env use "$PY313" && poetry install
uv tool install -e . --python "$PY313" --force
```

Scripts: `fuel`, `fuel-api`, `fuel-meal`, `fuel-supplement`, `fuel-ingredient`,
`fuel-week`, `fuel-micro`, `fuel-catalog-verify`.

## Daten

| Was | Default |
|---|---|
| Runtime-DB | `~/.aos/fuel/nutrition/nutrition.db` |
| YAML-Kataloge | `FUEL_REPO_DIR` → `~/dev/fuel-dev` |
| Kern | `daily_journals` (+ meal/supplement catalogs, frames) |

`http_fallback.py` absichtlich nicht `http.py` (Stdlib-Shadowing, Package-Root auf `sys.path`).
