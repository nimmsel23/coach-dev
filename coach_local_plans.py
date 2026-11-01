"""Local Coach HTTP boundary; Plan owns storage, klienten-python owns the registry."""
from __future__ import annotations
import asyncio
import logging
import importlib.util
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response

ROOT = Path(__file__).resolve().parent
PLAN_RUNTIME = ROOT / 'modules/plan/runtime'

def load_plan_module(name):
    spec = importlib.util.spec_from_file_location(f'coach_plan_{name}', PLAN_RUNTIME / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

# Modules are loaded from the pinned submodule, never the sibling development source.
plans_module = load_plan_module('local_plans')


def clients_root():
    if os.getenv('CLIENTS_ROOT'): return Path(os.environ['CLIENTS_ROOT']).expanduser()
    source = Path(os.getenv('KLIENTEN_PYTHON_ROOT', str(Path.home() / 'klienten-python'))) / 'klienten_manager/config.py'
    if source.is_file():
        spec = importlib.util.spec_from_file_location('coach_client_config', source)
        config = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(config)
        return config.DATA_DIR
    return Path.home() / '.local/Klienten'


def local_only(request):
    if not request.client or request.client.host not in ('127.0.0.1', '::1', 'localhost', 'testclient'):
        raise HTTPException(403, 'Lokale Planverwaltung ist nur auf diesem Rechner verfügbar.')
    if request.url.hostname not in ('127.0.0.1', 'localhost', '::1'):
        raise HTTPException(403, 'Lokaler Hostname erforderlich.')
    if request.method not in ('GET', 'HEAD'):
        origin = request.headers.get('origin')
        if origin and (urlsplit(origin).netloc != request.url.netloc or urlsplit(origin).scheme != request.url.scheme):
            raise HTTPException(403, 'Fremder Ursprung abgelehnt.')


def create_router(root=None, deliver=None):
    router = APIRouter(prefix='/api/coach/local')
    store = plans_module.LocalPlans(root or clients_root())

    async def handle(request, fn, *args):
        local_only(request)
        if request.method in ('POST', 'PUT'):
            raw = await request.body()
            if len(raw) > 2_000_000: raise HTTPException(413, 'Plan zu groß.')
            try: body = json.loads(raw or '{}')
            except ValueError: raise HTTPException(400, 'Ungültiges JSON.')
            if not isinstance(body, dict): raise HTTPException(400, 'Objekt erwartet.')
            args = (*args, body)
        try: return fn(*args)
        except plans_module.PlanError as err: raise HTTPException(err.status, str(err))

    @router.get('/clients')
    async def clients(request: Request):
        return {'clients': await handle(request, store.clients)}

    @router.get('/clients/{client}/legacy')
    async def legacy(client: str, request: Request):
        return await handle(request, store.legacy, client)

    @router.get('/clients/{client}/plans')
    async def listing(client: str, request: Request):
        return {'plans': await handle(request, store.list, client)}

    @router.post('/clients/{client}/plans')
    async def create(client: str, request: Request):
        return await handle(request, store.create, client)

    @router.get('/clients/{client}/plans/{plan}')
    async def get(client: str, plan: str, request: Request):
        return await handle(request, store.get, client, plan)

    @router.put('/clients/{client}/plans/{plan}')
    async def save(client: str, plan: str, request: Request):
        return await handle(request, store.save, client, plan)

    @router.get('/clients/{client}/plans/{plan}/versions')
    async def versions(client: str, plan: str, request: Request):
        return {'versions': await handle(request, store.versions, client, plan)}

    @router.post('/clients/{client}/plans/{plan}/versions')
    async def release(client: str, plan: str, request: Request):
        return await handle(request, store.release, client, plan)

    @router.get('/clients/{client}/plans/{plan}/export/{kind}')
    async def export(client: str, plan: str, kind: str, request: Request):
        record = await handle(request, store.get, client, plan)
        if kind == 'json': content, media = json.dumps(record, ensure_ascii=False, indent=2), 'application/json'
        elif kind == 'md': content, media = plans_module.markdown(record), 'text/markdown'
        else: raise HTTPException(404, 'Exportformat unbekannt.')
        return Response(content, media_type=media, headers={'Content-Disposition': f'attachment; filename="training-{plan}.{kind}"'})

    @router.post('/clients/{client}/plans/{plan}/deliver')
    async def send(client: str, plan: str, request: Request):
        local_only(request)
        try:
            payload = store.delivery_payload(client, plan)
            try: body = await request.json()
            except ValueError: raise plans_module.PlanError('Ungültiges JSON.')
            if not isinstance(body, dict) or type(body.get('version')) is not int: raise plans_module.PlanError('Versionsnummer fehlt.')
            if body['version'] != payload['localVersion']: raise plans_module.PlanError('Freigegebene Version wurde inzwischen geändert. Bitte neu laden.', 409)
            if deliver:
                result = await asyncio.to_thread(deliver, payload)
            else:
                from coach_plan_push import get_db
                result = await asyncio.to_thread(lambda: load_plan_module('plan_delivery').publish(payload, get_db()))
            return {'plan': store.delivered(client, plan, payload['localVersion'], result), 'delivery': result}
        except plans_module.PlanError as err: raise HTTPException(err.status, str(err))
        except Exception:
            logging.exception('Local plan delivery failed')
            # Do not leak credential paths or transport details into the browser.
            raise HTTPException(502, 'Versand fehlgeschlagen. Lokaler Plan bleibt gespeichert. Serverprotokoll prüfen.')
    return router
