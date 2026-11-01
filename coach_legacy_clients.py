"""Reuse klienten-python handlers behind Coach's local access boundary."""
import importlib
import logging
import os
import sys
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.routing import APIRoute
from coach_local_plans import clients_root, local_only, plans_module


def legacy_ui():
    return Path(os.getenv('KLIENTEN_UI_ROOT', str(Path(__file__).resolve().parent.parent / 'klienten-dev'))) / 'dist-klienten'


def include_legacy_clients(app):
    source = Path(os.getenv('KLIENTEN_PYTHON_ROOT', str(Path.home() / 'klienten-python')))
    if not (source / 'klienten_manager/main.py').is_file():
        return False
    if str(source) not in sys.path:
        sys.path.insert(0, str(source))
    try:
        legacy = importlib.import_module('klienten_manager.main')
    except ImportError:
        logging.exception('klienten-python dependencies unavailable; legacy client APIs disabled')
        return False
    # Share the configured registry; do not start a second server or copy its storage.
    legacy.CLIENTS_ROOT = clients_root()

    async def guard(request: Request):
        local_only(request)
        client = request.path_params.get('client_id')
        if client:
            try:
                plans_module.LocalPlans(clients_root()).client(client)
            except plans_module.PlanError as error:
                raise HTTPException(error.status, str(error))

    routes = APIRouter()
    routes.routes = [route for route in legacy.app.routes if isinstance(route, APIRoute)
                     and route.path.startswith(('/api/client/{client_id}/', '/k/{client_id}/'))]
    app.include_router(routes, dependencies=[Depends(guard)])
    return True
