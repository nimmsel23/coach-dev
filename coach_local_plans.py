"""Client-ID Coach HTTP boundary; Plan owns storage, klienten-python owns the registry."""
from __future__ import annotations
import asyncio
import hashlib
import logging
import importlib.util
import json
import os
import re
import sys
from datetime import datetime, timedelta
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


def load_client_workspace_module():
    source = Path(os.getenv('KLIENTEN_PYTHON_ROOT', str(Path.home() / 'klienten-python'))).expanduser()
    if not (source / 'klienten_manager/workspace.py').is_file():
        raise FileNotFoundError('klienten-python workspace owner is unavailable')
    if str(source) not in sys.path:
        sys.path.insert(0, str(source))
    import importlib
    return importlib.import_module('klienten_manager.workspace')


def is_coach_auth_user(user):
    email_name = (getattr(user, 'email', None) or '').partition('@')[0].casefold()
    display_name = (getattr(user, 'display_name', None) or '').strip().casefold()
    claims = getattr(user, 'custom_claims', None) or {}
    if not isinstance(claims, dict):
        claims = {}
    claim_role = str(claims.get('role') or '').casefold()
    return (
        email_name in {'nimmsel23', 'nimmdaniel'}
        or display_name in {'nimmsel23', 'nimmdaniel'}
        or claim_role in {'coach', 'admin', 'superuser'}
        or any(claims.get(key) is True for key in ('coach', 'admin', 'superuser'))
    )


def fitness_runtime_root():
    """Return the existing local Fitness mirror without importing Fitness services."""
    return Path(os.getenv('FITNESS_AGENT_HOME', str(Path.home() / '.aos/fitness'))).expanduser()

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
        records = await handle(request, store.clients)
        visible = []
        for item in records:
            profile_path = store.client(item['id']) / 'client.json'
            profile = plans_module.read(profile_path) or {}
            status = profile.get('status') or ''
            role = profile.get('role') or ('contact' if status in {'freund', 'interessent', 'lead', 'kontakt'} else 'client')
            if role not in {'client', 'contact'} or profile.get('coach_visible') is False:
                continue
            item.update({'role': role, 'status': status, 'canDeliver': bool(profile.get('firebase_uid') or profile.get('firebase_uids'))})
            visible.append(item)
        return {'clients': visible}

    @router.get('/api/coach/local/users')
    async def firebase_users(request: Request):
        local_only(request)
        try:
            import firebase_admin
            from firebase_admin import auth
            from coach_plan_push import get_db

            await asyncio.to_thread(get_db)
            app = firebase_admin.get_app()
            profiles_by_uid = {}
            for profile_path in store.root.glob('*/client.json'):
                try:
                    profile = json.loads(profile_path.read_text(encoding='utf-8'))
                    profile_uids = profile.get('firebase_uids') if isinstance(profile.get('firebase_uids'), list) else []
                    if profile.get('firebase_uid'):
                        profile_uids.append(profile['firebase_uid'])
                    for uid in profile_uids:
                        if uid:
                            profiles_by_uid.setdefault(uid, []).append((profile_path.parent.name, profile))
                except (OSError, ValueError, TypeError):
                    continue
            users = []
            page = await asyncio.to_thread(auth.list_users, max_results=1000, app=app)
            while page:
                for user in page.users:
                    matches = profiles_by_uid.get(user.uid, [])
                    profile = matches[0][1] if len(matches) == 1 else {}
                    coach_account = is_coach_auth_user(user)
                    role = 'coach' if coach_account else profile.get('role') or ('contact' if profile.get('status') in {'freund', 'interessent', 'lead', 'kontakt'} else 'client')
                    users.append({
                        'uid': user.uid,
                        'displayName': user.display_name or '',
                        'email': user.email or '',
                        'knownClient': bool(matches),
                        'clientId': matches[0][0] if len(matches) == 1 else None,
                        'duplicateProfiles': len(matches) > 1,
                        'role': role if profile else None,
                        'status': profile.get('status') if profile else None,
                        'selectable': not coach_account and len(matches) <= 1 and (not profile or role in {'client', 'contact'}),
                        'coachVisible': not coach_account and bool(matches) and len(matches) == 1 and role in {'client', 'contact'} and profile.get('coach_visible') is not False,
                    })
                token = page.next_page_token
                if not token:
                    break
                page = await asyncio.to_thread(auth.list_users, max_results=1000, page_token=token, app=app)
            return {'users': users}
        except Exception:
            logging.exception('Firebase Auth user listing failed')
            raise HTTPException(503, 'Firebase-Nutzerliste lokal nicht verfügbar. Coach-Serverprotokoll prüfen.')

    @router.patch('/api/coach/local/users/{uid}/membership')
    async def update_user_membership(uid: str, request: Request):
        local_only(request)
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', uid):
            raise HTTPException(400, 'Ungültige Firebase-UID.')
        try:
            body = await request.json()
        except ValueError:
            raise HTTPException(400, 'Ungültiges JSON.')
        if not isinstance(body, dict) or type(body.get('included')) is not bool:
            raise HTTPException(400, 'Coach-Auswahl fehlt.')
        role = body.get('role')
        if body['included'] and role not in ('friend', 'client'):
            raise HTTPException(400, 'Rolle muss Freund oder Klient sein.')
        try:
            import firebase_admin
            from firebase_admin import auth
            from coach_plan_push import get_db

            await asyncio.to_thread(get_db)
            app = firebase_admin.get_app()
            auth_user = await asyncio.to_thread(auth.get_user, uid, app=app)
        except Exception:
            logging.exception('Firebase Auth user lookup failed')
            raise HTTPException(503, 'Firebase-Nutzer konnte lokal nicht verifiziert werden.')
        if body['included'] and is_coach_auth_user(auth_user):
            raise HTTPException(409, 'Coach- und Admin-Konten können nicht als Klienten aufgenommen werden.')

        root = store.root
        matches = []
        for profile_path in root.glob('*/client.json'):
            try:
                profile = json.loads(profile_path.read_text(encoding='utf-8'))
            except (OSError, ValueError):
                continue
            profile_uids = profile.get('firebase_uids') if isinstance(profile.get('firebase_uids'), list) else []
            if profile.get('firebase_uid'):
                profile_uids.append(profile['firebase_uid'])
            if uid in profile_uids:
                matches.append((profile_path.parent.name, profile_path, profile))
        if len(matches) > 1:
            raise HTTPException(409, 'Diese UID ist mehreren Klienten-Workspaces zugeordnet; Zuordnung zuerst bereinigen.')
        if matches:
            client_id, profile_path, profile = matches[0]
            existing_role = profile.get('role') or ('contact' if profile.get('status') in {'freund', 'interessent', 'lead', 'kontakt'} else 'client')
            if existing_role not in {'client', 'contact'} and body['included']:
                raise HTTPException(409, 'Coach-Konten können nicht als Klienten aufgenommen werden.')
            profile['coach_visible'] = body['included']
            profile['updated_at'] = plans_module.now()
            plans_module.atomic(profile_path, profile)
            return {'ok': True, 'uid': uid, 'clientId': client_id, 'included': body['included'], 'role': existing_role}
        if not body['included']:
            return {'ok': True, 'uid': uid, 'clientId': None, 'included': False}

        display_name = (auth_user.display_name or '').strip()
        if not display_name:
            display_name = (auth_user.email or '').split('@', 1)[0].strip() or f'Fitness Nutzer {uid[:8]}'
        role = body['role']
        role_tag = 'contact' if role == 'friend' else 'client'
        status = 'freund' if role == 'friend' else 'aktiv'
        suffix = hashlib.sha256(uid.encode('utf-8')).hexdigest()[:10]
        stem = re.sub(r'[^a-z0-9]+', '-', display_name.lower()).strip('-')[:90].strip('-') or 'firebase-user'
        client_id = f'{stem}-{suffix}'
        if not plans_module.IDENTIFIER.fullmatch(client_id):
            raise HTTPException(400, 'Aus dem Kontonamen konnte keine lokale Klienten-ID gebildet werden.')
        if (root / client_id).exists():
            raise HTTPException(409, 'Lokale Klienten-ID ist bereits belegt; bitte den Workspace manuell zuordnen.')
        try:
            manager = load_client_workspace_module()
            if role == 'friend':
                result = await asyncio.to_thread(manager.create_contact_workspace, display_name, client_id, uid)
            else:
                result = await asyncio.to_thread(manager.create_workspace, display_name, client_id, uid, role=role_tag, status=status)
            profile_path = root / client_id / 'client.json'
            profile = result.get('client') or json.loads(profile_path.read_text(encoding='utf-8'))
            profile.update({'coach_visible': True, 'role': role_tag, 'status': status})
            plans_module.atomic(profile_path, profile)
            return {'ok': True, 'uid': uid, 'clientId': client_id, 'included': True, 'role': role_tag}
        except FileExistsError:
            raise HTTPException(409, 'Lokaler Klienten-Workspace wurde gleichzeitig angelegt; bitte Liste aktualisieren.')
        except Exception:
            logging.exception('Firebase user local workspace creation failed')
            raise HTTPException(503, 'Lokaler Klienten-Workspace konnte nicht angelegt werden. Serverprotokoll prüfen.')

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

    @router.get('/api/client/{client}/workout/logs')
    async def workout_logs(client: str, request: Request):
        """Read the existing local Fitness mirror for a registered client UID.

        The client workspace remains the identity source; workout records stay
        in Fitness runtime and are never copied into the private Coach workspace.
        """
        workspace = await handle(request, store.client, client)
        profile = plans_module.read(workspace / 'client.json') or {}
        uids = list(profile.get('firebase_uids') or [])
        if profile.get('firebase_uid') and profile['firebase_uid'] not in uids:
            uids.insert(0, profile['firebase_uid'])
        uid = next((value for value in uids if isinstance(value, str) and value.strip()), None)
        if not uid:
            return {'workouts': [], 'available': False, 'storage': 'local-fitness-runtime'}
        try:
            days = max(1, min(3650, int(request.query_params.get('days', '28'))))
        except ValueError:
            raise HTTPException(400, 'Ungültiger Zeitraum.')
        path = fitness_runtime_root() / 'users' / uid / 'workouts.json'
        workouts = plans_module.read(path) if path.is_file() else []
        if not isinstance(workouts, list):
            raise HTTPException(503, 'Lokale Fitness-Workoutdaten sind ungültig.')
        cutoff = datetime.now().astimezone().date() - timedelta(days=days - 1)
        recent = []
        for workout in workouts:
            if not isinstance(workout, dict) or not workout.get('finished_at'):
                continue
            try:
                day = datetime.fromisoformat(str(workout['finished_at']).replace('Z', '+00:00')).astimezone().date()
            except ValueError:
                continue
            if day >= cutoff:
                recent.append(workout)
        recent.sort(key=lambda item: str(item.get('finished_at') or ''), reverse=True)
        return {'workouts': recent, 'available': path.is_file(), 'storage': 'local-fitness-runtime'}

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
        if route.path.startswith('/api/coach/local/users'):
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
