"""Client-ID Coach HTTP boundary; Coach owns the local plan runtime (plan_runtime/), klienten-python owns the registry."""
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
# Coach-owned copy of the former plan-dev runtime/ (coach-dev#14).
PLAN_RUNTIME = ROOT / 'plan_runtime'

def load_plan_module(name):
    spec = importlib.util.spec_from_file_location(f'coach_plan_{name}', PLAN_RUNTIME / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_taskwarrior_module():
    # Coach-owned copy — plan-dev removed fitness/plan_tasks.py (b91e309).
    source = ROOT / 'plan_tasks.py'
    spec = importlib.util.spec_from_file_location('coach_plan_tasks', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_client_workspace_module():
    source = Path(os.getenv(
        'KLIENTEN_PYTHON_ROOT',
        str(Path(__file__).resolve().parent / 'klienten-python'),
    )).expanduser()
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


def fitness_user_root_for_uid(uid):
    """Resolve a runtime UID, including its exact local AlphaOS user-data alias."""
    if not isinstance(uid, str) or not uid or uid in {'.', '..'} or any(char in uid for char in '/\\\x00'):
        raise ValueError('Ungültige Fitness-UID-Zuordnung.')
    users_root = (fitness_runtime_root() / 'users').resolve()
    candidate = users_root / uid
    user_root = candidate.resolve()
    if user_root.is_relative_to(users_root):
        return user_root

    # Fitness user-data may expose a direct per-UID symlink into the canonical
    # AlphaOS user store. Allow only that exact local target; reject other links.
    shared_users_root = (Path.home() / '.aos' / 'users').resolve()
    if (candidate.is_symlink() and user_root.is_dir()
            and user_root == shared_users_root / uid and user_root.parent == shared_users_root):
        return user_root
    raise ValueError('Ungültige Fitness-UID-Zuordnung.')


def fitness_workouts_for_uid(uid):
    """Merge locally authored workouts with Fitness's separate cloud metadata projection."""
    user_root = fitness_user_root_for_uid(uid)
    local_path = user_root / 'workouts.json'
    local = plans_module.read(local_path) if local_path.is_file() else []
    if not isinstance(local, list):
        raise ValueError('Lokale Fitness-Workoutdaten sind ungültig.')
    by_id = {}
    for workout in local:
        if isinstance(workout, dict):
            workout_id = str(workout.get('id') or '')
            if workout_id:
                by_id[workout_id] = workout
    cloud_root = user_root / 'cloud-workouts'
    cloud_paths = sorted(cloud_root.glob('*.json')) if cloud_root.is_dir() else []
    for cloud_path in cloud_paths:
        workout = plans_module.read(cloud_path)
        if not isinstance(workout, dict) or workout.get('sourceType') != 'firestore-workout':
            continue
        workout_id = str(workout.get('id') or cloud_path.stem)
        if workout_id:
            by_id[workout_id] = workout
    newest_mtime = max(
        [path.stat().st_mtime for path in [local_path, *cloud_paths] if path.is_file()],
        default=None,
    )
    updated_at = datetime.fromtimestamp(newest_mtime).astimezone().isoformat() if newest_mtime else None
    return list(by_id.values()), bool(local_path.is_file() or cloud_root.is_dir()), updated_at


def fitness_workout_logs_for_uid(uid):
    """Include legacy saved Fitness sessions when creating Taskwarrior workout records."""
    workouts, available, updated_at = fitness_workouts_for_uid(uid)
    user_root = fitness_user_root_for_uid(uid)
    sessions_root = user_root / 'sessions'
    session_files = sorted(sessions_root.glob('*.json')) if sessions_root.is_dir() else []
    known = {str(workout.get('id') or '') for workout in workouts if isinstance(workout, dict)}
    for session_path in session_files:
        session = plans_module.read(session_path)
        if not isinstance(session, dict):
            continue
        exercises = session.get('exercises') if isinstance(session.get('exercises'), list) else []
        gate = session.get('sessionGate') if isinstance(session.get('sessionGate'), dict) else {}
        has_workout = bool(exercises or str(session.get('block') or '').strip()
                           or session.get('activity') or gate.get('endedAt'))
        if not has_workout:
            continue
        workout_id = f"fitness-session:{session.get('session_id') or session_path.stem}"
        if workout_id in known:
            continue
        day_text = str(session.get('date') or session_path.stem.split('__', 1)[0])
        workouts.append({
            'id': workout_id,
            'sourceType': 'fitness-session',
            'name': str(session.get('trainingsart') or session.get('block') or 'Fitness-Training'),
            'started_at': gate.get('startedAt'),
            'finished_at': gate.get('endedAt') or session.get('saved_at') or day_text,
            'sessionState': str(gate.get('status') or 'saved'),
            'sourcePlanId': None,
            'sourcePlanRoutineId': None,
        })
        known.add(workout_id)
    return workouts, available or bool(session_files), updated_at

# Modules are loaded from Coach's own plan_runtime/, never from modules/plan or a sibling checkout.
plans_module = load_plan_module('local_plans')


def clients_root():
    if os.getenv('CLIENTS_ROOT'): return Path(os.environ['CLIENTS_ROOT']).expanduser()
    source = Path(os.getenv(
        'KLIENTEN_PYTHON_ROOT',
        str(Path(__file__).resolve().parent / 'klienten-python'),
    )) / 'klienten_manager/config.py'
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

    async def pull_fitness_workouts(request, uid):
        origin = getattr(request.app.state, 'backends', {}).get('fitness')
        client = getattr(request.app.state, 'api_client', None)
        if origin is None or client is None:
            raise HTTPException(503, 'Fitness-Backend für den lokalen Workout-Pull nicht verfügbar.')
        path = f"{origin.path.rstrip('/')}/firestore/pull-workout-logs"
        url = origin.copy_with(path=path or '/firestore/pull-workout-logs', query=b'')
        try:
            response = await client.post(url, params={'uid': uid}, timeout=60)
            if not response.is_success:
                logging.warning('Fitness cloud workout pull returned HTTP %s', response.status_code)
                raise HTTPException(502, 'Fitness konnte die lokalen Workout-Logs nicht aktualisieren.')
            result = response.json()
        except HTTPException:
            raise
        except Exception as error:
            logging.warning('Fitness cloud workout pull failed: %s', error)
            raise HTTPException(502, 'Fitness-Workout-Pull lokal nicht erreichbar.')
        if not isinstance(result, dict) or result.get('ok') is not True:
            raise HTTPException(502, 'Fitness hat keine gültige Workout-Projektion zurückgegeben.')
        return {
            'ok': True,
            'workoutLogs': int(result.get('workout_logs') or 0),
            'removed': int(result.get('workout_logs_removed') or 0),
            'storage': result.get('storage') or 'local-fitness-runtime/cloud-workouts',
        }

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

    @router.get('/api/client/{client}/feedback-summary')
    async def client_feedback_summary(client: str, request: Request):
        local_only(request)

        def summarize():
            try:
                folder = store.client(client)
            except plans_module.PlanError as error:
                raise HTTPException(error.status, str(error))
            profile = plans_module.read(folder / 'client.json') or {}
            status = profile.get('status') or ''
            role = profile.get('role') or ('contact' if status in {'freund', 'interessent', 'lead', 'kontakt'} else 'client')
            if role not in {'client', 'contact'} or profile.get('coach_visible') is False:
                raise HTTPException(404, 'Klient ist in der Coach-Übersicht ausgeblendet.')

            uids = set(profile.get('firebase_uids') if isinstance(profile.get('firebase_uids'), list) else [])
            if profile.get('firebase_uid'):
                uids.add(profile['firebase_uid'])
            uids = {uid for uid in uids if isinstance(uid, str) and plans_module.IDENTIFIER.fullmatch(uid)}
            if len(uids) != 1:
                reason = 'no-firebase-uid' if not uids else 'ambiguous-firebase-uid'
                return {'available': False, 'reason': reason, 'deliveredPlans': 0, 'awaitingReply': 0, 'awaitingReceipt': 0}
            uid = next(iter(uids))

            for profile_path in store.root.glob('*/client.json'):
                if profile_path.parent.name == client:
                    continue
                other = plans_module.read(profile_path) or {}
                other_uids = set(other.get('firebase_uids') if isinstance(other.get('firebase_uids'), list) else [])
                if other.get('firebase_uid'):
                    other_uids.add(other['firebase_uid'])
                if uid in other_uids:
                    return {'available': False, 'reason': 'duplicate-workspace-uid', 'deliveredPlans': 0, 'awaitingReply': 0, 'awaitingReceipt': 0}

            tracked = []
            for plan in store.list(client):
                delivery = plan.get('delivery') if isinstance(plan.get('delivery'), dict) else {}
                remote_id = delivery.get('remotePlanId')
                remote_version = delivery.get('remoteVersion')
                if (isinstance(remote_id, str) and plans_module.IDENTIFIER.fullmatch(remote_id)
                        and type(remote_version) is int and remote_version > 0):
                    tracked.append((plan, remote_id, remote_version))
            tracked.sort(key=lambda item: item[0].get('delivery', {}).get('at') or '', reverse=True)
            selected = tracked[:50]
            if not selected:
                return {'available': True, 'reason': None, 'deliveredPlans': 0, 'awaitingReply': 0, 'awaitingReceipt': 0, 'truncated': False}

            from coach_plan_push import get_db
            db = get_db()
            awaiting_reply = 0
            awaiting_receipt = 0
            for _plan, remote_id, version in selected:
                response = (db.collection('planResponses').document(uid).collection('plans')
                    .document(remote_id).collection('versions').document(f'v{version}'))
                if not response.get().exists:
                    awaiting_receipt += 1
                latest = list(response.collection('entries').order_by('createdAt', direction='DESCENDING').limit(1).stream())
                if latest and (latest[0].to_dict() or {}).get('senderRole') == 'client':
                    awaiting_reply += 1
            return {
                'available': True, 'reason': None, 'deliveredPlans': len(tracked),
                'awaitingReply': awaiting_reply, 'awaitingReceipt': awaiting_receipt,
                'truncated': len(tracked) > len(selected),
            }

        try:
            return await asyncio.to_thread(summarize)
        except HTTPException:
            raise
        except Exception:
            logging.exception('Unable to read local Coach plan-feedback summary')
            raise HTTPException(503, 'Plan-Rückmeldungen lokal nicht verfügbar. Serverprotokoll prüfen.')

    # Modul-Workouts (6Pack-Tage, Calisthenics-Skills) direkt aus dem Katalog, ohne Firestore.
    @router.get('/api/coach/local/modules')
    async def module_list(request: Request):
        local_only(request)
        modules = load_plan_module('module_templates')
        return {'modules': [{'id': r['id'], 'name': r['meta']['name'], 'category': r['meta']['category'], 'exerciseCount': r['meta']['exerciseCount']} for r in modules.build_all()]}

    @router.get('/api/coach/local/modules/{module_id}')
    async def module_detail(module_id: str, request: Request):
        local_only(request)
        modules = load_plan_module('module_templates')
        for r in modules.build_all():
            if r['id'] == module_id:
                return {'routine': {'id': r['id'], 'name': r['meta']['name'], 'exercises': r['exercises']}}
        raise HTTPException(404, 'Modul nicht gefunden.')

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
        if role is not None and role not in ('friend', 'client'):
            raise HTTPException(400, 'Rolle muss Freund oder Klient sein.')
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
            if existing_role not in {'client', 'contact'}:
                raise HTTPException(409, 'Coach-Konten können nicht als Klienten aufgenommen werden.')
            selected_role = ('contact' if role == 'friend' else 'client') if role else existing_role
            profile['coach_visible'] = body['included']
            profile['role'] = selected_role
            profile['updated_at'] = plans_module.now()
            plans_module.atomic(profile_path, profile)
            return {'ok': True, 'uid': uid, 'clientId': client_id, 'included': body['included'], 'role': selected_role}
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
            return {'workouts': [], 'available': False, 'reason': 'no-firebase-uid', 'storage': 'local-fitness-runtime'}
        try:
            days = max(1, min(3650, int(request.query_params.get('days', '28'))))
        except ValueError:
            raise HTTPException(400, 'Ungültiger Zeitraum.')
        try:
            user_root = fitness_user_root_for_uid(uid)
            workouts, workout_source_available, _workout_source_updated = fitness_workouts_for_uid(uid)
        except ValueError as error:
            raise HTTPException(503, str(error))
        sessions_root = user_root / 'sessions'
        session_files = sorted(sessions_root.glob('*.json'), reverse=True) if sessions_root.is_dir() else []
        if not workout_source_available and not session_files:
            return {'workouts': [], 'available': False, 'reason': 'mirror-missing', 'storage': 'local-fitness-runtime'}

        def parse_timestamp(value):
            if not value:
                return None
            try:
                parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
                return parsed.astimezone() if parsed.tzinfo is None else parsed.astimezone()
            except (TypeError, ValueError):
                return None

        cutoff = datetime.now().astimezone().date() - timedelta(days=days - 1)
        recent = []
        for workout in workouts:
            if not isinstance(workout, dict) or not workout.get('finished_at'):
                continue
            finished = parse_timestamp(workout.get('finished_at'))
            if not finished:
                continue
            day = finished.date()
            if day >= cutoff:
                started = parse_timestamp(workout.get('started_at'))
                duration = max(0, int((finished - started).total_seconds())) if started else None
                exercises = workout.get('exercises') if isinstance(workout.get('exercises'), list) else []
                events = workout.get('eventLog') if isinstance(workout.get('eventLog'), list) else None
                completed_sets = workout.get('completedSetCount')
                if not isinstance(completed_sets, int) or completed_sets < 0:
                    completed_sets = sum(1 for event in (events or []) if isinstance(event, dict) and event.get('setId'))
                if not completed_sets:
                    completed_sets = sum(
                        1 for exercise in exercises if isinstance(exercise, dict)
                        for entry in (exercise.get('sets') or exercise.get('setsArray') or [])
                        if isinstance(entry, dict) and entry.get('completed') is True
                    )
                day = finished.date().isoformat()
                title = str(
                    workout.get('block')
                    or workout.get('name')
                    or workout.get('trainingsart')
                    or 'Trainingseinheit'
                )
                recent.append({
                    'id': str(workout.get('id') or ''),
                    'sourceType': workout.get('sourceType') or 'plan-workout',
                    'date': day,
                    'name': title,
                    'block': str(workout.get('block') or title),
                    'trainingsart': str(workout.get('trainingsart') or workout.get('name') or '') or None,
                    'location': str(workout.get('location') or '') or None,
                    'started_at': workout.get('started_at'),
                    'finished_at': workout.get('finished_at'),
                    'sessionState': str(workout.get('sessionState') or ''),
                    'routine_id': workout.get('routine_id'),
                    'sourcePlanId': workout.get('sourcePlanId'),
                    'sourcePlanRoutineId': workout.get('sourcePlanRoutineId'),
                    'exerciseCount': len(exercises),
                    'exerciseNames': [
                        str(ex.get('name')).strip()
                        for ex in exercises
                        if isinstance(ex, dict) and str(ex.get('name') or '').strip()
                    ][:12],
                    'completedSetCount': completed_sets,
                    'durationSeconds': duration,
                    'duration': round(duration / 60) if duration else None,
                })
        for session_path in session_files:
            session = plans_module.read(session_path)
            if not isinstance(session, dict):
                continue
            exercises = session.get('exercises') if isinstance(session.get('exercises'), list) else []
            gate = session.get('sessionGate') if isinstance(session.get('sessionGate'), dict) else {}
            # Fitness's legacy session log uses reps-bearing setsArray entries;
            # an empty prescription is not evidence that a set was completed.
            completed_sets = sum(
                1 for exercise in exercises if isinstance(exercise, dict)
                for entry in (exercise.get('setsArray') or exercise.get('sets') or [])
                if isinstance(entry, dict) and str(entry.get('reps') or '').strip()
                and str(entry.get('reps')).strip() not in {'0', '0.0'}
            )
            has_workout = bool(exercises or str(session.get('block') or '').strip()
                               or session.get('activity') or gate.get('endedAt'))
            if not has_workout:
                continue
            day_text = str(session.get('date') or session_path.stem.split('__', 1)[0])
            try:
                day = datetime.fromisoformat(day_text[:10]).date()
            except ValueError:
                continue
            if day < cutoff:
                continue
            finished = parse_timestamp(gate.get('endedAt') or session.get('saved_at'))
            duration_seconds = None
            if gate.get('startedAt') and gate.get('endedAt'):
                started = parse_timestamp(gate.get('startedAt'))
                if started and finished:
                    duration_seconds = max(0, int((finished - started).total_seconds()))
            if duration_seconds is None:
                raw_duration = session.get('duration')
                try:
                    if isinstance(raw_duration, str) and raw_duration.endswith('min'):
                        duration_minutes = float(raw_duration[:-3].strip())
                    else:
                        duration_minutes = float(raw_duration)
                    if duration_minutes > 0:
                        duration_seconds = int(duration_minutes * 60)
                except (TypeError, ValueError):
                    pass
            block = str(session.get('block') or '').strip()
            trainingsart = str(session.get('trainingsart') or '').strip()
            title = block or trainingsart or 'Fitness-Training'
            recent.append({
                'id': f"fitness-session:{session.get('session_id') or session_path.stem}",
                'sourceType': 'fitness-session',
                'date': day.isoformat(),
                'name': title,
                'block': block or title,
                'trainingsart': trainingsart or None,
                'location': str(session.get('location') or '').strip() or None,
                'started_at': gate.get('startedAt'),
                'finished_at': gate.get('endedAt') or session.get('saved_at') or day_text,
                'sessionState': str(gate.get('status') or 'saved'),
                'routine_id': None,
                'sourcePlanId': None,
                'sourcePlanRoutineId': None,
                'exerciseCount': len(exercises),
                'exerciseNames': [
                    str(ex.get('name')).strip()
                    for ex in exercises
                    if isinstance(ex, dict) and str(ex.get('name') or '').strip()
                ][:12],
                'completedSetCount': completed_sets if completed_sets else None,
                'durationSeconds': duration_seconds,
                'duration': round(duration_seconds / 60) if duration_seconds else None,
            })
        recent.sort(key=lambda item: str(item.get('finished_at') or ''), reverse=True)
        return {'workouts': recent[:30], 'available': True, 'reason': None, 'storage': 'local-fitness-runtime'}

    @router.post('/api/client/{client}/workout/pull')
    async def workout_pull(client: str, request: Request):
        local_only(request)
        try:
            workspace = store.client(client)
        except plans_module.PlanError as error:
            raise HTTPException(error.status, str(error))
        profile = plans_module.read(workspace / 'client.json') or {}
        uids = list(profile.get('firebase_uids') or [])
        if profile.get('firebase_uid') and profile['firebase_uid'] not in uids:
            uids.insert(0, profile['firebase_uid'])
        uid = next((value for value in uids if isinstance(value, str) and value.strip()), None)
        if not uid:
            raise HTTPException(409, 'Für diesen Workspace ist keine Firebase-UID hinterlegt.')
        result = await pull_fitness_workouts(request, uid)
        workouts, _available, _updated = fitness_workout_logs_for_uid(uid)
        from coach_taskwarrior_scheduler import with_taskwarrior_lock
        taskwarrior_module = load_taskwarrior_module()
        result['taskwarrior'] = await asyncio.to_thread(
            with_taskwarrior_lock, taskwarrior_module.sync_workspace_workouts, workspace, workouts,
        )
        return result

    @router.get('/api/client/{client}/taskwarrior')
    async def taskwarrior_tasks(client: str, request: Request):
        workspace = await handle(request, store.client, client)
        try:
            from coach_taskwarrior_scheduler import with_taskwarrior_lock
            tasks = await asyncio.to_thread(with_taskwarrior_lock, load_taskwarrior_module().workspace_tasks, workspace)
            return {'tasks': tasks, 'storage': 'local-client-workspace'}
        except Exception:
            logging.exception('Unable to read client Taskwarrior database')
            raise HTTPException(503, 'Taskwarrior-Datenbank des Klienten nicht lesbar.')

    @router.get('/api/client/{client}/taskwarrior/automation')
    async def taskwarrior_automation_get(client: str, request: Request):
        local_only(request)
        try:
            workspace = store.client(client)
        except plans_module.PlanError as error:
            raise HTTPException(error.status, str(error))
        from coach_taskwarrior_scheduler import enabled_plan_ids
        return {'enabledPlanIds': enabled_plan_ids(workspace), 'intervalSeconds': 60, 'storage': 'local-client-workspace'}

    @router.patch('/api/client/{client}/taskwarrior/automation')
    async def taskwarrior_automation_update(client: str, request: Request):
        local_only(request)
        try:
            workspace = store.client(client)
            body = await request.json()
        except plans_module.PlanError as error:
            raise HTTPException(error.status, str(error))
        except ValueError:
            raise HTTPException(400, 'Ungültiges JSON.')
        plan_id = body.get('planId') if isinstance(body, dict) else None
        enabled = body.get('enabled') if isinstance(body, dict) else None
        if not isinstance(plan_id, str) or not plans_module.IDENTIFIER.fullmatch(plan_id):
            raise HTTPException(400, 'Lokale Plan-ID fehlt.')
        if type(enabled) is not bool:
            raise HTTPException(400, 'Automatikstatus muss wahr oder falsch sein.')
        try:
            store.get(client, plan_id)
        except plans_module.PlanError as error:
            raise HTTPException(error.status, str(error))
        from coach_taskwarrior_scheduler import enabled_plan_ids, set_plan_enabled
        ids = set_plan_enabled(workspace, plan_id, enabled)
        return {'enabledPlanIds': ids, 'enabled': plan_id in ids, 'intervalSeconds': 60, 'storage': 'local-client-workspace'}

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
            profile = plans_module.read(workspace / 'client.json') or {}
            uids = list(profile.get('firebase_uids') or [])
            if profile.get('firebase_uid') and profile['firebase_uid'] not in uids:
                uids.insert(0, profile['firebase_uid'])
            uid = next((value for value in uids if isinstance(value, str) and value.strip()), None)
            cloud_pull = None
            if uid:
                try:
                    cloud_pull = await pull_fitness_workouts(request, uid)
                except HTTPException as error:
                    logging.info('Fitness cloud workout refresh unavailable for local plan sync: %s', error.detail)
                    cloud_pull = {'ok': False, 'reason': error.detail}
            try:
                workouts, workouts_available, workout_source_updated_at = fitness_workout_logs_for_uid(uid) if uid else ([], False, None)
            except ValueError as error:
                raise HTTPException(503, str(error))
            from coach_taskwarrior_scheduler import with_taskwarrior_lock
            report = await asyncio.to_thread(with_taskwarrior_lock, load_taskwarrior_module().sync_workspace_plan, workspace, plan, None, workouts)
            workout_task_report = await asyncio.to_thread(with_taskwarrior_lock, load_taskwarrior_module().sync_workspace_workouts, workspace, workouts)
            delivery = plan.get('delivery') if isinstance(plan.get('delivery'), dict) else {}
            delivered_current = delivery.get('localVersion') == plan.get('headVersion')
            remote_plan_id = delivery.get('remotePlanId')
            matched_workouts = sum(
                1 for workout in workouts
                if delivered_current and remote_plan_id and isinstance(workout, dict)
                and workout.get('sourcePlanId') == remote_plan_id
            )
            return {
                'ok': True, 'report': report, 'storage': 'local-client-workspace',
                'workoutSourceAvailable': workouts_available,
                'workoutSourceUpdatedAt': workout_source_updated_at,
                'cloudWorkoutPull': cloud_pull,
                'workoutTasks': workout_task_report,
                'deliveredCurrent': delivered_current,
                'matchedWorkouts': matched_workouts,
            }
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
            from coach_taskwarrior_scheduler import with_taskwarrior_lock
            found = await asyncio.to_thread(with_taskwarrior_lock, load_taskwarrior_module().complete_workspace_occurrence, workspace, key)
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
        if route.path.startswith(('/api/coach/local/users', '/api/coach/local/modules')):
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
