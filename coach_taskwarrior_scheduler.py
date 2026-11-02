"""Local, opt-in Taskwarrior reconciliation for Coach client workspaces."""
from __future__ import annotations

import fcntl
import json
import logging
import os
from pathlib import Path
import re
import tempfile
import time
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from coach_local_plans import clients_root, fitness_runtime_root, load_taskwarrior_module, plans_module
from coach_local_plans import fitness_workout_logs_for_uid

AUTO_SYNC_PATH = Path('coach/taskwarrior-auto-sync.json')
CLIENT_ID = re.compile(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}\Z')
_LOCK_PATH = Path.home() / '.local/state/coach/taskwarrior-sync.lock'
_ROOT = Path(__file__).resolve().parent
_FITNESS_PULL_INTERVAL = 300
_FITNESS_PULL_ATTEMPTS: dict[str, float] = {}


def _fitness_workout_pull_origin() -> str | None:
    origin = os.environ.get('COACH_FITNESS_API_URL') or os.environ.get('COACH_API_URL')
    if not origin:
        config_path = Path(os.environ.get('COACH_BACKENDS_FILE', _ROOT / 'coach-backends.json'))
        try:
            origins = json.loads(config_path.read_text(encoding='utf-8'))
            origin = origins.get('fitness') if isinstance(origins, dict) else None
        except (OSError, ValueError):
            return None
    if not isinstance(origin, str):
        return None
    parsed = urlsplit(origin)
    if parsed.scheme != 'http' or parsed.hostname not in {'127.0.0.1', 'localhost', '::1'} or parsed.username or parsed.password or parsed.query or parsed.fragment:
        logging.warning('Skipping Fitness auto-pull: backend must be a loopback HTTP URL')
        return None
    return origin.rstrip('/')


def refresh_fitness_workouts(uid: str, now: float | None = None) -> bool | None:
    """Refresh cloud metadata only for an explicitly opted-in client UID, at most every 5m."""
    if not isinstance(uid, str) or not uid.strip():
        return None
    now = time.monotonic() if now is None else now
    if now - _FITNESS_PULL_ATTEMPTS.get(uid, float('-inf')) < _FITNESS_PULL_INTERVAL:
        return None
    origin = _fitness_workout_pull_origin()
    if not origin:
        return False
    _FITNESS_PULL_ATTEMPTS[uid] = now
    target = f"{origin}/firestore/pull-workout-logs?{urlencode({'uid': uid})}"
    try:
        request = Request(target, method='POST', headers={'Accept': 'application/json'})
        with urlopen(request, timeout=15) as response:
            result = json.loads(response.read().decode('utf-8'))
        return isinstance(result, dict) and result.get('ok') is True
    except Exception as error:
        logging.info('Fitness cloud workout refresh unavailable for local UID: %s', error)
        return False


def enabled_plan_ids(workspace: Path) -> list[str]:
    path = workspace / AUTO_SYNC_PATH
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return []
    ids = value.get('enabledPlanIds') if isinstance(value, dict) else []
    if not isinstance(ids, list):
        return []
    return sorted({item for item in ids if isinstance(item, str) and CLIENT_ID.fullmatch(item)})


def set_plan_enabled(workspace: Path, plan_id: str, enabled: bool) -> list[str]:
    ids = set(enabled_plan_ids(workspace))
    if enabled:
        ids.add(plan_id)
    else:
        ids.discard(plan_id)
    path = workspace / AUTO_SYNC_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.taskwarrior-auto-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump({'enabledPlanIds': sorted(ids)}, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return sorted(ids)


def _client_visible(profile: dict) -> bool:
    status = profile.get('status') or ''
    role = profile.get('role') or ('contact' if status in {'freund', 'interessent', 'lead', 'kontakt'} else 'client')
    return profile.get('coach_visible') is not False and role in {'client', 'contact'}


def with_taskwarrior_lock(function, *args, **kwargs):
    """Serialize Coach Taskwarrior access across the service and local pilots."""
    _LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _LOCK_PATH.open('a', encoding='utf-8') as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        return function(*args, **kwargs)


def _reconcile_opted_in(root: Path | None = None) -> dict[str, int]:
    summary = {'clients': 0, 'plans': 0, 'created': 0, 'updated': 0, 'completed': 0, 'deleted': 0, 'workouts': 0, 'cloudPulls': 0}
    store = plans_module.LocalPlans(root or clients_root())
    taskwarrior = load_taskwarrior_module()
    users_root = fitness_runtime_root() / 'users'
    users_resolved = users_root.resolve()
    for profile_path in store.root.glob('*/client.json'):
        client_id = profile_path.parent.name
        if not CLIENT_ID.fullmatch(client_id):
            continue
        profile = plans_module.read(profile_path) or {}
        if not isinstance(profile, dict) or not _client_visible(profile):
            continue
        workspace = profile_path.parent
        uids = profile.get('firebase_uids') if isinstance(profile.get('firebase_uids'), list) else []
        if profile.get('firebase_uid'):
            uids = [profile['firebase_uid'], *uids]
        uid = next((value for value in uids if isinstance(value, str) and value.strip()), None)
        if not uid:
            continue
        user_root = (users_root / uid).resolve()
        if not user_root.is_relative_to(users_resolved):
            continue
        plan_ids = enabled_plan_ids(workspace)
        if not plan_ids:
            continue
        if refresh_fitness_workouts(uid) is True:
            summary['cloudPulls'] += 1
        try:
            workouts, _available, _updated = fitness_workout_logs_for_uid(uid)
        except ValueError:
            logging.warning('Taskwarrior auto-sync skipped client %s: invalid Fitness log file', client_id)
            continue
        try:
            workout_report = taskwarrior.sync_workspace_workouts(workspace, workouts)
            summary['workouts'] += int(workout_report.get('created', 0))
        except Exception:
            logging.exception('Workout Taskwarrior sync failed for local client %s', client_id)
        for plan_id in plan_ids:
            try:
                plan = store.get(client_id, plan_id)
                published = plan.get('published') if isinstance(plan.get('published'), dict) else plan
                if not any(isinstance(item, dict) and item.get('weekdays') for item in published.get('routines', [])):
                    continue
                report = taskwarrior.sync_workspace_plan(workspace, plan, None, workouts)
                summary['clients'] += 1
                summary['plans'] += 1
                for key in ('created', 'updated', 'completed', 'deleted'):
                    summary[key] += int(report.get(key, 0))
            except Exception:
                logging.exception('Taskwarrior auto-sync failed for local client %s, plan %s', client_id, plan_id)
    return summary


def reconcile_opted_in(root: Path | None = None) -> dict[str, int]:
    """Reconcile only explicitly enabled visible client-plan pairs under a process lock."""
    _LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _LOCK_PATH.open('a', encoding='utf-8') as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'clients': 0, 'plans': 0, 'created': 0, 'updated': 0, 'completed': 0, 'deleted': 0, 'workouts': 0, 'cloudPulls': 0}
        return _reconcile_opted_in(root)


async def run_scheduler(stop_event, interval_seconds: int = 60) -> None:
    """Reconcile opted-in local Taskwarrior workspaces and refresh Fitness via loopback."""
    import asyncio

    interval = max(15, min(3600, int(interval_seconds)))
    while not stop_event.is_set():
        try:
            summary = await asyncio.to_thread(reconcile_opted_in)
            if summary['plans']:
                logging.info('Taskwarrior local auto-sync: %s', summary)
        except Exception:
            logging.exception('Taskwarrior local auto-sync tick failed')
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass
