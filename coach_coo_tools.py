"""Read-only adapters to existing fitness-log services; no shell command endpoint."""
import hashlib
import json
from dataclasses import asdict
from datetime import date, timedelta

from fastapi import HTTPException


def client_log(operations, client_id):
    # Enforce the same visible registry and exact identity as COO generation.
    operations.context(client_id)
    from fitness.log.clients.service import get_clients_registry, load_client_sessions, compute_client_stats, parse_session_item
    from fitness.log.console.drafts import list_drafts
    meta = next((row for row in get_clients_registry() if row.slug == client_id), None)
    if meta is None:
        return {'status': 'not-linked', 'message': 'fitness-log hat keine Zuordnung für diesen Klienten.', 'sessions': [], 'drafts': []}
    cutoff = (date.today() - timedelta(days=90)).isoformat()
    sessions = load_client_sessions(meta, start_date=cutoff)
    drafts = [entry for uid in meta.uids for entry in list_drafts(uid)]
    result = {
        'status': 'available', 'source': 'fitness-log', 'windowDays': 90,
        'stats': asdict(compute_client_stats(meta, sessions, days_window=90)),
        # CLI deliberately rolls up multiple sessions into training days.
        'sessions': [{key: value for key, value in asdict(parse_session_item(row)).items() if key != 'raw'} for row in sessions[:30]],
        'drafts': [{key: row.get(key) for key in ('id', 'kind', 'text', 'created_at', 'status')} for row in sorted(drafts, key=lambda row: row.get('created_at', ''), reverse=True)[:20]],
    }
    result['revision'] = hashlib.sha256(json.dumps(result, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    return result
