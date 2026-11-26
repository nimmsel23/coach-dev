"""Reuse klienten-python handlers + Klientenschmiede UI behind Coach local boundary.

UI SOT: coach-dev/klienten-ui/{schmiede,konsole} (nicht mehr ~/dev/klienten-dev).
"""
from __future__ import annotations

import asyncio
import importlib
import json
import logging
import os
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from coach_klienten_ui import konsole_dir, legacy_ui, schmiede_dir, spa_document, ui_root
from coach_local_plans import clients_root, local_only, plans_module

__all__ = [
    "include_legacy_clients",
    "legacy_ui",
    "schmiede_dir",
    "konsole_dir",
    "spa_document",
    "ui_root",
]

# Per-client APIs (need client existence guard)
_CLIENT_PREFIXES = (
    "/api/client/{client_id}/",
    "/k/{client_id}/",
)

# Konsole / CRM / Buchhaltung + shared list endpoints (no client_id guard)
_KONSOLE_PREFIXES = (
    "/api/overview",
    "/konsole/api/",
    "/api/clients/anlegen",
    "/api/clients/lead",
    "/integrations/status",
    "/fitness/exercises/search",
    "/api/fitness/exercises/search",
    "/api/integrations/wger/exercises/search",
)


async def run_plan_push(client_id: str, dry_run: bool = False):
    """Run the existing explicit publisher with the same client root as Coach."""
    args = [os.getenv("COACH_PUSH_PYTHON", "/usr/bin/python3"),
            str(Path(__file__).resolve().parent / "coach_plan_push.py"), client_id]
    if dry_run:
        args.append("--dry-run")
    proc = await asyncio.create_subprocess_exec(
        *args, env={**os.environ, "CLIENTS_ROOT": str(clients_root())},
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    out, err = await proc.communicate()
    try:
        body = json.loads(out.decode() or "{}")
    except ValueError:
        body = {}
    if proc.returncode != 0:
        body = {"error": (err.decode() or out.decode()).strip()[-500:]}
    return proc.returncode, body


def include_legacy_clients(app):
    source = Path(
        os.getenv(
            "KLIENTEN_PYTHON_ROOT",
            str(Path(__file__).resolve().parent / "klienten-python"),
        )
    )
    if not (source / "klienten_manager/main.py").is_file():
        return False
    if str(source) not in sys.path:
        sys.path.insert(0, str(source))
    try:
        legacy = importlib.import_module("klienten_manager.main")
    except ImportError:
        logging.exception("klienten-python dependencies unavailable; legacy client APIs disabled")
        return False
    legacy.CLIENTS_ROOT = clients_root()

    async def client_guard(request: Request):
        local_only(request)
        client = request.path_params.get("client_id")
        if client:
            try:
                plans_module.LocalPlans(clients_root()).client(client)
            except plans_module.PlanError as error:
                raise HTTPException(error.status, str(error))

    async def local_guard(request: Request):
        local_only(request)

    push_routes = APIRouter(dependencies=[Depends(client_guard)])

    @push_routes.post("/k/{client_id}/plan/push")
    async def plan_push(client_id: str, dry_run: bool = False):
        code, body = await run_plan_push(client_id, dry_run)
        status = 200 if code == 0 else (409 if "FIREBASE_UID" in str(body.get("error", "")) else 502)
        return JSONResponse({**body, "ok": code == 0}, status_code=status)

    # Register before the legacy /plan/{...} routes and frontend catch-all.
    app.include_router(push_routes)

    client_routes = APIRouter()
    client_routes.routes = [
        route
        for route in legacy.app.routes
        if isinstance(route, APIRoute)
        and route.path.startswith(_CLIENT_PREFIXES)
    ]
    app.include_router(client_routes, dependencies=[Depends(client_guard)])

    konsole_routes = APIRouter()
    konsole_routes.routes = [
        route
        for route in legacy.app.routes
        if isinstance(route, APIRoute)
        and any(route.path == p or route.path.startswith(p) for p in _KONSOLE_PREFIXES)
    ]
    app.include_router(konsole_routes, dependencies=[Depends(local_guard)])
    return True
