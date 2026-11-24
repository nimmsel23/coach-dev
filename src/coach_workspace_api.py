"""Read-only, authenticated projection of the existing local client workspaces."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from coach_local_plans import clients_root, local_only, plans_module

router = APIRouter()
OWNER_UID = '59ole36uNpNwml5H6VDYCXyCME92'


def require_coach(token):
    from coach_plan_push import get_db
    from firebase_admin import auth

    try:
        db = get_db()
    except Exception as exc:
        raise HTTPException(503, 'Coach-Anmeldung am Server nicht verfügbar.') from exc
    try:
        claims = auth.verify_id_token(token, check_revoked=True)
    except Exception as exc:
        raise HTTPException(401, 'Coach-Anmeldung ungültig oder abgelaufen.') from exc
    uid = claims.get('uid')
    if not uid:
        raise HTTPException(401, 'Coach-Anmeldung ungültig.')
    if uid == OWNER_UID or claims.get('coach') is True:
        return
    try:
        role = db.collection('roles').document(uid).get()
        if role.exists and (role.to_dict() or {}).get('role') == 'coach':
            return
    except Exception as exc:
        raise HTTPException(503, 'Coach-Berechtigung konnte nicht geprüft werden.') from exc
    raise HTTPException(403, 'Nur für Coach-Konten verfügbar.')


def workspace_summary(root):
    if not root.is_dir():
        raise HTTPException(503, 'Lokale Klientenablage nicht verfügbar.')
    store = plans_module.LocalPlans(root)
    result = []
    for item in store.clients():
        folder = store.client(item['id'])
        profile = plans_module.read(folder / 'client.json') or {}
        status = profile.get('status') or ''
        role = profile.get('role') or ('contact' if status in {'freund', 'interessent', 'lead', 'kontakt'} else 'client')
        if role not in {'client', 'contact'} or profile.get('coach_visible') is False:
            continue
        uids = profile.get('firebase_uids') if isinstance(profile.get('firebase_uids'), list) else []
        uids = [*uids, profile.get('firebase_uid')]
        uids = sorted({uid for uid in uids if isinstance(uid, str) and plans_module.IDENTIFIER.fullmatch(uid)})
        # Project only plan metadata; no exercises, notes, filesystem paths or raw profiles.
        plans = [{
            'id': plan['id'], 'name': plan['name'], 'status': plan.get('status', 'draft'),
            'version': plan.get('headVersion', 0), 'updatedAt': plan.get('updatedAt'),
            'deliveredAt': (plan.get('delivery') or {}).get('at'),
            'deliveredVersion': (plan.get('delivery') or {}).get('localVersion'),
        } for plan in store.list(item['id'])]
        result.append({
            'id': item['id'], 'name': item['name'], 'uids': uids, 'plans': plans,
            'legacyPlan': item['hasLegacyPlan'],
            'taskwarriorConfigured': (folder / 'tw-data/taskrc').is_file(),
        })
    return {'workspaces': result, 'checkedAt': datetime.now(timezone.utc).isoformat()}


@router.get('/api/clients/workspaces', include_in_schema=False)
async def read_workspaces(request: Request):
    local_only(request)
    scheme, _, token = request.headers.get('authorization', '').partition(' ')
    if scheme.lower() != 'bearer' or not token.strip():
        raise HTTPException(401, 'Coach-Anmeldung erforderlich.')
    await asyncio.to_thread(require_coach, token.strip())
    try:
        payload = await asyncio.to_thread(workspace_summary, clients_root())
    except HTTPException:
        raise
    except Exception as exc:
        logging.exception('Workspace summary unavailable')
        raise HTTPException(503, 'Workspace-Übersicht konnte nicht gelesen werden.') from exc
    from fastapi.responses import JSONResponse
    return JSONResponse(payload, headers={'Cache-Control': 'no-store'})


@router.get('/api/clients/{uid}/nutrition-preferences', include_in_schema=False)
async def nutrition_preferences(uid: str, request: Request):
    local_only(request)
    scheme, _, token = request.headers.get('authorization', '').partition(' ')
    if scheme.lower() != 'bearer' or not token.strip():
        raise HTTPException(401, 'Coach-Anmeldung erforderlich.')
    await asyncio.to_thread(require_coach, token.strip())
    def read():
        from src.coach_nutrition_preferences import read_preferences
        root = clients_root()
        matches = [item for item in workspace_summary(root)['workspaces'] if uid in item['uids']]
        if len(matches) != 1:
            raise HTTPException(409 if matches else 404, 'Klienten-Workspace nicht eindeutig zugeordnet.' if matches else 'Kein Klienten-Workspace zugeordnet.')
        try:
            return read_preferences(root, matches[0]['id'])
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
    from fastapi.responses import JSONResponse
    return JSONResponse(await asyncio.to_thread(read), headers={'Cache-Control': 'no-store'})
