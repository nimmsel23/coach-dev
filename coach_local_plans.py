"""Client-ID Coach HTTP boundary; Plan owns storage, klienten-python owns the registry."""
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


def load_taskwarrior_module():
    source = ROOT / 'modules/plan/fitness/plan_tasks.py'
    spec = importlib.util.spec_from_file_location('coach_plan_tasks', source)
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
    router = APIRouter()
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

    @router.get('/api/clients')
    async def clients(request: Request):
        return {'clients': await handle(request, store.clients)}

    @router.get('/api/coach/local/users')
    async def firebase_users(request: Request):
        local_only(request)
        try:
            import firebase_admin
            from firebase_admin import auth
            from coach_plan_push import get_db

            await asyncio.to_thread(get_db)
            app = firebase_admin.get_app()
            known_uids = set()
            for profile_path in clients_root().glob('*/client.json'):
                try:
                    profile = json.loads(profile_path.read_text(encoding='utf-8'))
                    known_uids.update(uid for uid in profile.get('firebase_uids', []) if uid)
                    if profile.get('firebase_uid'):
                        known_uids.add(profile['firebase_uid'])
                except (OSError, ValueError, TypeError):
                    continue
            users = []
            page = await asyncio.to_thread(auth.list_users, max_results=1000, app=app)
            while page:
                users.extend({
                    'uid': user.uid,
                    'displayName': user.display_name or '',
                    'email': user.email or '',
                    'knownClient': user.uid in known_uids,
                } for user in page.users)
                token = page.next_page_token
                if not token:
                    break
                page = await asyncio.to_thread(auth.list_users, max_results=1000, page_token=token, app=app)
            return {'users': users}
        except Exception:
            logging.exception('Firebase Auth user listing failed')
            raise HTTPException(503, 'Firebase-Nutzerliste lokal nicht verfügbar. Coach-Serverprotokoll prüfen.')

    @router.get('/api/client/{client}')
    async def profile(client: str, request: Request):
        await handle(request, store.client, client)
        profile = next((item for item in await handle(request, store.clients) if item['id'] == client), None)
        if profile is None: raise HTTPException(404, 'Klientenprofil nicht verfügbar.')
        return profile

    @router.get('/api/client/{client}/legacy')
    async def legacy(client: str, request: Request):
        return await handle(request, store.legacy, client)

    @router.get('/api/client/{client}/plans')
    async def listing(client: str, request: Request):
        return {'plans': await handle(request, store.list, client)}

    @router.get('/api/client/{client}/taskwarrior')
    async def taskwarrior_tasks(client: str, request: Request):
        workspace = await handle(request, store.client, client)
        try:
            tasks = await asyncio.to_thread(load_taskwarrior_module().workspace_tasks, workspace)
            return {'tasks': tasks, 'storage': 'local-client-workspace'}
        except Exception:
            logging.exception('Unable to read client Taskwarrior database')
            raise HTTPException(503, 'Taskwarrior-Datenbank des Klienten nicht lesbar.')

    @router.post('/api/client/{client}/taskwarrior/sync')
    async def taskwarrior_sync(client: str, request: Request):
        local_only(request)
        try:
            workspace = store.client(client)
        except plans_module.PlanError as error:
            raise HTTPException(error.status, str(error))
        try:
            body = await request.json()
        except ValueError:
            raise HTTPException(400, 'Ungültiges JSON.')
        plan_id = body.get('planId') if isinstance(body, dict) else None
        if not isinstance(plan_id, str) or not plans_module.IDENTIFIER.fullmatch(plan_id):
            raise HTTPException(400, 'Lokale Plan-ID fehlt.')
        try:
            plan = store.get(client, plan_id)
        except plans_module.PlanError as error:
            raise HTTPException(error.status, str(error))
        try:
            report = await asyncio.to_thread(load_taskwarrior_module().sync_workspace_plan, workspace, plan)
            return {'ok': True, 'report': report, 'storage': 'local-client-workspace'}
        except (FileNotFoundError, ValueError) as error:
            raise HTTPException(409, str(error))
        except Exception:
            logging.exception('Unable to sync local plan into client Taskwarrior')
            raise HTTPException(503, 'Taskwarrior-Synchronisierung fehlgeschlagen.')

    @router.post('/api/client/{client}/taskwarrior/complete')
    async def taskwarrior_complete(client: str, request: Request):
        local_only(request)
        try:
            workspace = store.client(client)
        except plans_module.PlanError as error:
            raise HTTPException(error.status, str(error))
        try:
            body = await request.json()
        except ValueError:
            raise HTTPException(400, 'Ungültiges JSON.')
        key = body.get('occurrenceKey') if isinstance(body, dict) else None
        if not isinstance(key, str) or len(key) > 300:
            raise HTTPException(400, 'Plan-Vorkommen fehlt.')
        try:
            found = await asyncio.to_thread(load_taskwarrior_module().complete_workspace_occurrence, workspace, key)
            if not found:
                raise HTTPException(404, 'Taskwarrior-Aufgabe nicht gefunden.')
            return {'ok': True, 'storage': 'local-client-workspace'}
        except HTTPException:
            raise
        except Exception:
            logging.exception('Unable to complete client Taskwarrior occurrence')
            raise HTTPException(503, 'Taskwarrior-Aufgabe konnte nicht abgeschlossen werden.')

    @router.post('/api/client/{client}/plans')
    async def create(client: str, request: Request):
        return await handle(request, store.create, client)

    @router.get('/api/client/{client}/plans/{plan}')
    async def get(client: str, plan: str, request: Request):
        return await handle(request, store.get, client, plan)

    @router.put('/api/client/{client}/plans/{plan}')
    async def save(client: str, plan: str, request: Request):
        return await handle(request, store.save, client, plan)

    @router.get('/api/client/{client}/plans/{plan}/versions')
    async def versions(client: str, plan: str, request: Request):
        return {'versions': await handle(request, store.versions, client, plan)}

    @router.post('/api/client/{client}/plans/{plan}/versions')
    async def release(client: str, plan: str, request: Request):
        return await handle(request, store.release, client, plan)

    @router.get('/api/client/{client}/plans/{plan}/export/{kind}')
    async def export(client: str, plan: str, kind: str, request: Request):
        record = await handle(request, store.get, client, plan)
        if kind == 'json': content, media = json.dumps(record, ensure_ascii=False, indent=2), 'application/json'
        elif kind == 'md': content, media = plans_module.markdown(record), 'text/markdown'
        else: raise HTTPException(404, 'Exportformat unbekannt.')
        return Response(content, media_type=media, headers={'Content-Disposition': f'attachment; filename="training-{plan}.{kind}"'})

    @router.post('/api/client/{client}/plans/{plan}/deliver')
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
    # Compatibility aliases share handlers, store and access checks with the canonical API.
    for route in list(router.routes):
        if route.path == '/api/coach/local/users':
            continue
        if route.path == '/api/clients':
            aliases = ['/api/coach/local/clients']
        else:
            suffix = route.path.removeprefix('/api/client/')
            aliases = [f'/api/coach/local/clients/{suffix}']
            if suffix != '{client}': aliases.append(f'/k/{suffix}')
        for alias in aliases:
            router.add_api_route(alias, route.endpoint, methods=route.methods, include_in_schema=False)
    return router
