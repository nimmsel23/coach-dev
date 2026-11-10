"""Klientenschmiede + Coachkonsole builds for Coach :9150."""
from __future__ import annotations

import importlib
import logging
import os
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.routing import APIRoute

from coach_local_plans import clients_root, local_only, plans_module

ROOT = Path(__file__).resolve().parent


def ui_root() -> Path:
    return Path(os.getenv("KLIENTEN_UI_ROOT", str(ROOT / "klienten-ui")))


def schmiede_dir() -> Path:
    return ui_root() / "schmiede"


def konsole_dir() -> Path:
    return ui_root() / "konsole"


def spa_document(directory: Path, html_name: str, base: str) -> HTMLResponse | JSONResponse:
    document = directory / html_name
    if not document.is_file():
        return JSONResponse(
            {
                "detail": f"{html_name} fehlt unter {directory}",
                "hint": "Builds liegen in coach-dev/klienten-ui/{schmiede,konsole}",
            },
            status_code=503,
        )
    html = document.read_text(encoding="utf-8")
    if "<base " not in html:
        html = html.replace("<head>", f'<head><base href="{base}">', 1)
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})


def include_legacy_clients(app):
    """Mount per-client API handlers from klienten-python (local-only)."""
    source = Path(
        os.getenv(
            "KLIENTEN_PYTHON_ROOT",
            str(ROOT / "klienten-python"),
        )
    )
    if not (source / "klienten_manager/main.py").is_file():
        return False
    if str(source) not in sys.path:
        sys.path.insert(0, str(source))
    try:
        legacy = importlib.import_module("klienten_manager.main")
    except ImportError:
        logging.exception("klienten-python unavailable; client APIs disabled")
        return False
    legacy.CLIENTS_ROOT = clients_root()

    async def guard(request: Request):
        local_only(request)
        client = request.path_params.get("client_id")
        if client:
            try:
                plans_module.LocalPlans(clients_root()).client(client)
            except plans_module.PlanError as error:
                raise HTTPException(error.status, str(error))

    routes = APIRouter()
    routes.routes = [
        route
        for route in legacy.app.routes
        if isinstance(route, APIRoute)
        and route.path.startswith(("/api/client/{client_id}/", "/k/{client_id}/"))
    ]
    app.include_router(routes, dependencies=[Depends(guard)])
    return True


# Back-compat names used by older imports/tests
def legacy_ui() -> Path:
    return schmiede_dir()
