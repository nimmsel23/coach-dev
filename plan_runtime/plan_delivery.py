"""Publish a released local snapshot using an injected Firestore client."""
from copy import deepcopy
from datetime import datetime, timezone

def publish(payload, db):
    # Import only on an explicit delivery, never while editing locally.
    from google.cloud.firestore_v1.transaction import transactional
    ref = db.collection('fitness').document(payload['clientUid']).collection('macrocycles').document(payload['planId'])
    return transactional(_publish)(db.transaction(), ref, payload)

def _publish(tx, ref, payload):
    snap = ref.get(transaction=tx)
    current = snap.to_dict() if snap.exists else {}
    if current and current.get('source') != payload['source']:
        raise ValueError('Zielplan gehört nicht zur lokalen Planverwaltung.')
    if current.get('published') == payload['snapshot']:
        return {'planId': payload['planId'], 'version': current['headVersion'], 'unchanged': True}
    version = (current.get('headVersion') or 0) + 1
    version_ref = ref.collection('versions').document(f'v{version}')
    if version_ref.get(transaction=tx).exists: raise ValueError('Zielversion existiert bereits.')
    now = datetime.now(timezone.utc).isoformat()
    snapshot = deepcopy(payload['snapshot'])
    tx.set(version_ref, {'id': f'v{version}', 'number': version, 'message': f"Lokale Freigabe v{payload['localVersion']}", 'createdAt': now, 'author': 'local-coach', 'parent': f'v{version - 1}' if version > 1 else None, 'snapshot': snapshot})
    tx.set(ref, {**current, **snapshot, 'id': payload['planId'], 'clientUid': payload['clientUid'], 'coachUid': current.get('coachUid') or 'local-coach', 'source': payload['source'], 'sourceLocalVersion': payload['localVersion'], 'status': 'published', 'createdAt': current.get('createdAt') or now, 'updatedAt': now, 'publishedAt': now, 'published': snapshot, 'headVersion': version, 'headMessage': f"Lokale Freigabe v{payload['localVersion']}"})
    return {'planId': payload['planId'], 'version': version, 'unchanged': False}
