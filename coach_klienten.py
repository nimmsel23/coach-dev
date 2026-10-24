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

import asyncio
import json
import os
import re
import sys
from pathlib import Path

from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

ROOT = Path(__file__).resolve().parent
KLIENTEN_PYTHON = Path(os.environ.get("KLIENTEN_PYTHON_ROOT", Path.home() / "klienten-python"))
for path in (ROOT, KLIENTEN_PYTHON):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from klienten_manager.main import app as klienten_app  # noqa: E402
from server import create_app  # noqa: E402

# Firestore-Push läuft im System-Python (firebase_admin), nicht im klienten-python-venv.
PUSH_PYTHON = os.environ.get("COACH_PUSH_PYTHON", "/usr/bin/python3")
PLAN_SAVE_RE = re.compile(r"^/(?:k/(?P<k>[^/]+)/plan(?:/client)?|api/client/(?P<a>[^/]+)/plan)$")

_push_tasks: set = set()

SKIPPED_PATHS = {"/", "/health"}
# FastAPI-eigene Doku-Routen existieren in beiden Apps; nur die von Coach behalten
# (Coach schaltet docs/openapi bewusst ab).
SKIPPED_PATHS |= {"/docs", "/docs/oauth2-redirect", "/openapi.json", "/redoc"}


async def run_plan_push(client: str, dry_run: bool = False) -> tuple[int, dict]:
    args = [PUSH_PYTHON, str(ROOT / "coach_plan_push.py"), client] + (["--dry-run"] if dry_run else [])
    proc = await asyncio.create_subprocess_exec(
        *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    out, err = await proc.communicate()
    try:
        body = json.loads(out.decode() or "{}")
    except ValueError:
        body = {}
    if proc.returncode != 0:
        body = {"error": (err.decode() or out.decode()).strip()[-500:]}
    return proc.returncode, body


def create_combined_app():
    app = create_app()

    @app.post("/k/{client_id}/plan/push")
    async def plan_push(client_id: str, dry_run: bool = False):
        """Plan des Klienten manuell nach Firestore (Klienten-App) spiegeln."""
        code, body = await run_plan_push(client_id, dry_run)
        return JSONResponse({"ok": code == 0, **body}, status_code=200 if code == 0 else 502)

    @app.middleware("http")
    async def push_plan_after_save(request: Request, call_next):
        response = await call_next(request)
        match = PLAN_SAVE_RE.match(request.url.path)
        if match and request.method in ("POST", "PUT") and response.status_code < 300:
            client = match.group("k") or match.group("a")
            task = asyncio.create_task(run_plan_push(client))  # fire-and-forget
            _push_tasks.add(task)
            task.add_done_callback(_push_tasks.discard)
        return response

    # plan_push steht vor den Klienten-Routen, sonst greift /k/{client_id}/plan/{x}.
    app.router.routes.insert(0, app.router.routes.pop())
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
