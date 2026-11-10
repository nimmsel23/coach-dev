"""Reuse klienten-python handlers + Klientenschmiede UI behind Coach local boundary.

UI SOT: coach-dev/klienten-ui/{schmiede,konsole} (nicht mehr ~/dev/klienten-dev).
"""
from __future__ import annotations

import importlib
import logging
import os
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
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
