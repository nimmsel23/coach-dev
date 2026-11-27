"""Read-only COO projection of the existing client registry, plans and Fitness mirror."""
import hashlib
import json
from datetime import datetime, timezone

from fastapi import HTTPException
from coach_local_plans import clients_root, plans_module, fitness_workout_logs_for_uid


def stamp():
    return datetime.now(timezone.utc).isoformat()


class CooOperations:
    def __init__(self, root=None, workouts=None, calendar=None):
        self.root = root if root is not None else clients_root()
        self.store = plans_module.LocalPlans(self.root)
        self.workouts = workouts or fitness_workout_logs_for_uid
        self.calendar_reader = calendar

    def clients(self):
        if not self.store.root.is_dir():
            raise HTTPException(503, 'Klientenablage nicht verfügbar.')
        result = []
        for item in self.store.clients():
            profile = plans_module.read(self.store.client(item['id']) / 'client.json') or {}
            status = str(profile.get('status') or '')
            role = profile.get('role') or ('contact' if status in {'freund', 'interessent', 'lead', 'kontakt'} else 'client')
            result.append({'id': item['id'], 'name': item['name'], 'role': role, 'status': status})
        return result

    def overview(self, jobs):
        rows = self.clients()
        for row in rows:
            row['openJobs'] = sum(item.get('context', {}).get('clientId') == row['id'] and item['status'] in {'queued', 'running', 'pending_approval', 'approved'} for item in jobs)
            row['workspaceUrl'] = f'/k/{row["id"]}'
        return {'clients': rows, 'calendar': {'status': 'loading', 'message': 'Google-Kalender wird separat geladen.'}, 'checkedAt': stamp()}

    def calendar(self, refresh=False):
        from coach_coo_calendar import read_calendar
        return (self.calendar_reader or read_calendar)(refresh=refresh)

    def appointment(self, event_id, revision):
        calendar = self.calendar(refresh=True)
        if calendar['status'] != 'connected':
            raise HTTPException(503, 'Kalenderstand nicht verfügbar. Termin neu laden oder ohne Termin vorbereiten.')
        event = next((item for item in calendar['events'] if item['id'] == event_id), None)
        if event is None or event['revision'] != revision:
            raise HTTPException(409, 'Termin wurde geändert oder entfernt. Bitte den Kalender neu laden.')
        return event

    def context(self, client_id):
        client = next((row for row in self.clients() if row['id'] == client_id), None)
        if not client:
            raise HTTPException(404, 'Person nicht in der Klientenablage gefunden.')
        folder = self.store.client(client_id)
        profile = plans_module.read(folder / 'client.json') or {}
        sources = []

        def section(key, label, reader):
            try:
                data = reader()
                sources.append({'id': key, 'label': label, 'status': 'available' if data else 'empty'})
                return data
            except (OSError, ValueError, TypeError, KeyError, plans_module.PlanError):
                sources.append({'id': key, 'label': label, 'status': 'error', 'message': 'Quelle konnte nicht zuverlässig gelesen werden.'})
                return []

        def safe(path):
            if not path.resolve().is_relative_to(folder):
                raise ValueError('Quelle außerhalb des Klienten-Workspace')
            return path

        def notes_reader():
            notes = []
            for path in sorted(safe(folder / 'coaching-notes').glob('*.json'), reverse=True)[:5]:
                raw = plans_module.read(safe(path))
                if not isinstance(raw, dict):
                    raise ValueError('Ungültige Coaching-Notiz')
                notes.append({'date': raw.get('date') or path.stem, 'text': str(raw.get('note') or '')[:8000], 'updatedAt': raw.get('updated_at')})
            return notes

        def memo_reader():
            path = safe(folder / 'KLIENT.md')
            if not path.is_file():
                return []
            text = path.read_text(encoding='utf-8')
            return [{'name': 'KLIENT.md', 'text': text[:16000], 'truncated': len(text) > 16000}]

        def plans_reader():
            safe(folder / 'data/training-plans')
            return [{
                'id': plan['id'], 'name': plan['name'], 'status': plan.get('status', 'draft'),
                'version': plan.get('headVersion', 0), 'updatedAt': plan.get('updatedAt'),
                'deliveredAt': (plan.get('delivery') or {}).get('at'),
                'routines': [{'name': routine.get('name'), 'exercises': [exercise.get('name') or exercise.get('exerciseName') or exercise.get('exerciseId') for exercise in routine.get('exercises', [])[:12]]} for routine in plan.get('routines', [])[:7]],
            } for plan in self.store.list(client_id)[:5]]

        notes = section('notes', 'Coaching-Notizen', notes_reader)
        memo = section('memo', 'Klienten-Merkblatt', memo_reader)
        plans = section('plans', 'Lokale Trainingspläne', plans_reader)
        uids = profile.get('firebase_uids') if isinstance(profile.get('firebase_uids'), list) else []
        uids = sorted({uid for uid in [*uids, profile.get('firebase_uid')] if isinstance(uid, str) and plans_module.IDENTIFIER.fullmatch(uid)})

        has_mirror = False
        def workouts_reader():
            nonlocal has_mirror
            merged = {}
            for uid in uids:
                records, available, updated_at = self.workouts(uid)
                if not available:
                    continue
                has_mirror = True
                for row in records:
                    if not isinstance(row, dict) or not row.get('finished_at') or row.get('sessionState') in {'running', 'started', 'draft'}:
                        continue
                    # UID plus concrete ID keeps distinct sessions on the same day.
                    key = (uid, row.get('id'))
                    merged[key] = {'id': row.get('id'), 'name': row.get('name') or 'Training', 'finishedAt': row['finished_at'], 'state': row.get('sessionState'), 'source': row.get('sourceType'), 'sourceUpdatedAt': updated_at}
            return sorted(merged.values(), key=lambda row: str(row['finishedAt']), reverse=True)[:10]

        workouts = section('workouts', 'Gespeicherte Fitness-Trainings', workouts_reader)
        if uids and not has_mirror and sources[-1]['status'] != 'error':
            sources[-1].update(status='not-synced', message='Fitness-Konto zugeordnet, aber kein lokaler Trainingsstand vorhanden.')
        if not uids:
            sources[-1].update(status='not-linked', message='Kein Fitness-Konto zugeordnet.')
        followups = []
        for doc in [*memo, *notes]:
            for line in doc.get('text', '').splitlines():
                if line.strip().startswith(('- [ ] ', '* [ ] ')):
                    followups.append({'text': line.strip()[6:][:500], 'source': doc.get('name') or doc.get('date')})
        data = {'client': client, 'notes': notes, 'memo': memo, 'plans': plans, 'workouts': workouts, 'followups': followups[:30], 'sources': sources}
        data['revision'] = hashlib.sha256(json.dumps(data, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        data['checkedAt'] = stamp()
        return data
