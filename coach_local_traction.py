"""Loopback-only usage summary for the Coach-visible Fitness roster."""
from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request

from coach_local_plans import clients_root, local_only

router = APIRouter()
LOCAL_ZONE = ZoneInfo('Europe/Vienna')


def _as_utc(value):
    if value is None:
        return None
    if hasattr(value, 'timestamp'):
        return datetime.fromtimestamp(value.timestamp(), timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
            return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
        except ValueError:
            return None
    return None


def _count(value):
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _read_summary(days: int):
    import json
    import re

    root = clients_root()
    identifiers = re.compile(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}\Z')
    candidates = {}
    ambiguous = set()
    for profile_path in root.glob('*/client.json'):
        try:
            profile = json.loads(profile_path.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            continue
        status = profile.get('status') or ''
        role = profile.get('role') or ('contact' if status in {'freund', 'interessent', 'lead', 'kontakt'} else 'client')
        if role not in {'client', 'contact'} or profile.get('coach_visible') is False:
            continue
        workspace = {
            'id': profile_path.parent.name,
            'name': profile.get('name') or profile.get('displayName') or profile_path.parent.name,
            'status': status,
        }
        uids = list(profile.get('firebase_uids') if isinstance(profile.get('firebase_uids'), list) else [])
        if profile.get('firebase_uid'):
            uids.append(profile['firebase_uid'])
        for uid in set(uid for uid in uids if isinstance(uid, str) and identifiers.fullmatch(uid)):
            if uid in candidates and candidates[uid]['id'] != workspace['id']:
                ambiguous.add(uid)
            else:
                candidates[uid] = workspace
    uid_to_client = {uid: workspace for uid, workspace in candidates.items() if uid not in ambiguous}

    now_local = datetime.now(LOCAL_ZONE)
    first_date = now_local.date() - timedelta(days=days - 1)
    date_keys = [(first_date + timedelta(days=offset)).isoformat() for offset in range(days)]
    from coach_plan_push import get_db
    db = get_db()
    by_client = {}
    by_section = {}
    daily_clients = {key: set() for key in date_keys}
    total_opens = 0
    total_views = 0
    latest_seen = None
    for uid, workspace in uid_to_client.items():
        query = (db.collection('fitness').document(uid).collection('tractionDaily')
            .where('date', '>=', date_keys[0]))
        for snapshot in query.stream():
            item = snapshot.to_dict() or {}
            day = str(item.get('date') or snapshot.id)
            if day not in daily_clients:
                continue
            user = by_client.setdefault(workspace['id'], {
                **workspace, 'appOpens': 0, 'views': 0, 'lastSeenAt': None, 'lastSection': '',
            })
            opens = _count(item.get('appOpens'))
            sections = item.get('sections') if isinstance(item.get('sections'), dict) else {}
            view_count = 0
            for section, raw_count in sections.items():
                count = _count(raw_count)
                view_count += count
                by_section[section] = by_section.get(section, 0) + count
            seen = _as_utc(item.get('lastSeenAt'))
            user['appOpens'] += opens
            user['views'] += view_count
            total_opens += opens
            total_views += view_count
            daily_clients[day].add(workspace['id'])
            if seen and (not latest_seen or seen > latest_seen):
                latest_seen = seen
            if seen and (not user['lastSeenAt'] or seen > datetime.fromisoformat(user['lastSeenAt'])):
                user['lastSeenAt'] = seen.isoformat()
                user['lastSection'] = str(item.get('lastSection') or '')

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    users = sorted(by_client.values(), key=lambda item: item.get('lastSeenAt') or '', reverse=True)
    for user in users:
        seen = _as_utc(user.get('lastSeenAt'))
        user['activeNow'] = bool(seen and seen >= cutoff)
    return {
        'available': True,
        'days': days,
        'from': date_keys[0],
        'to': date_keys[-1],
        'queriedAt': datetime.now(timezone.utc).isoformat(),
        'selectedClients': len({workspace['id'] for workspace in uid_to_client.values()}),
        'clientsWithEvents': len(users),
        'activeNow': sum(user['activeNow'] for user in users),
        'appOpens': total_opens,
        'views': total_views,
        'latestSeenAt': latest_seen.isoformat() if latest_seen else None,
        'users': users,
        'sections': [{'id': key, 'views': value} for key, value in sorted(by_section.items(), key=lambda pair: pair[1], reverse=True)],
        'daily': [{'date': key, 'clients': len(daily_clients[key])} for key in date_keys],
    }


@router.get('/api/coach/local/traction')
async def local_traction(request: Request, days: int = 7):
    local_only(request)
    if days < 1 or days > 30:
        raise HTTPException(400, 'Der Zeitraum muss zwischen 1 und 30 Tagen liegen.')
    try:
        return await asyncio.to_thread(_read_summary, days)
    except Exception:
        logging.exception('Unable to read local Fitness traction summary')
        raise HTTPException(503, 'Fitness-Nutzung lokal nicht verfügbar. Coach-Serverprotokoll prüfen.')
