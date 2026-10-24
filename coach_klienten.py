#!/usr/bin/env python3
"""Coach + Klienten in einer App (Port 5200).

Setzt den Coach-Gateway (`server.create_app()`: Domain-Proxies, Coach-UI,
6Pack-Router) mit den Routen von `klienten-python` (`klienten_manager.main`:
/k/*, /api/clients, /konsole/*, /clientforge/*, ...) zusammen.

Muss mit dem Python des klienten-python-venvs laufen (psycopg2/sqlalchemy
werden beim Import von klienten_manager gebraucht), z. B.:

    ~/klienten-python/.venv/bin/python3 -m uvicorn coach_klienten:app \
        --app-dir ~/coach-dev --host 127.0.0.1 --port 5200

Reihenfolge: die Klienten-Routen stehen VOR den Coach-Catch-alls
(`/api/<domain>`-Proxys, `/{path:path}`-Frontend), sonst würden `/api/clients`
und `/k/...` an den Fitness-Proxy bzw. das Catalog-UI geraten. Ausgelassen
werden `/` und `/health` der Klienten-App, damit Coachs eigener /health und
das Catalog-UI auf `/` bestehen bleiben.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parent
KLIENTEN_PYTHON = Path(os.environ.get("KLIENTEN_PYTHON_ROOT", Path.home() / "klienten-python"))
for path in (ROOT, KLIENTEN_PYTHON):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from klienten_manager.main import app as klienten_app  # noqa: E402
from server import create_app  # noqa: E402

SKIPPED_PATHS = {"/", "/health"}
# FastAPI-eigene Doku-Routen existieren in beiden Apps; nur die von Coach behalten
# (Coach schaltet docs/openapi bewusst ab).
SKIPPED_PATHS |= {"/docs", "/docs/oauth2-redirect", "/openapi.json", "/redoc"}


def create_combined_app():
    app = create_app()
    klienten_routes = [r for r in klienten_app.routes if getattr(r, "path", None) not in SKIPPED_PATHS]
    # Generische Klienten-Routen (`/{client_id}/...`) würden Coachs feste Pfade
    # (/health, /_coach/*) überdecken: sie kommen erst direkt vor das Frontend-Catch-all.
    generic = [r for r in klienten_routes if r.path.startswith("/{")]
    specific = [r for r in klienten_routes if not r.path.startswith("/{")]
    app.router.routes[0:0] = specific
    catch_all = next(i for i, r in enumerate(app.router.routes) if getattr(r, "path", None) == "/{path:path}")
    app.router.routes[catch_all:catch_all] = generic
    # Gleiche CORS-Regeln wie die bisherige Klienten-App (Konsole/ClientForge-Dev-Server).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return app


app = create_combined_app()
