"""COO uses only the selected registered client's evidence and never writes source data."""
import json
import tempfile
import unittest
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient
from coach_coo_operations import CooOperations
from coach_csuite import create_router
from coach_csuite_runtime import Runtime


class CooTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / 'clients'
        for client_id, profile in {
            'alice': {'name': 'Alice', 'firebase_uid': 'uid-alice', 'role': 'client', 'secret': 'NEVER-PROJECT'},
            'bob': {'name': 'Bob', 'firebase_uid': 'uid-bob', 'role': 'client'},
            'hidden': {'name': 'Hidden', 'coach_visible': False},
            'owner': {'name': 'Owner', 'role': 'coach'},
            'tester': {'name': 'Tester', 'role': 'tester', 'status': 'freund'},
        }.items():
            folder = self.root / client_id
            folder.mkdir(parents=True)
            (folder / 'client.json').write_text(json.dumps(profile))
        self.note = self.root / 'alice/coaching-notes/2026-11-20.json'
        self.note.parent.mkdir()
        self.note.write_text(json.dumps({'date': '2026-11-20', 'note': 'ALICE-ONLY\n- [ ] Nach Schlaf fragen'}))
        (self.root / 'alice/KLIENT.md').write_text('Ziel: Regelmäßigkeit')
        (self.root / 'bob/KLIENT.md').write_text('BOB-ONLY')
        self.records = lambda uid: ([{'id': 'one', 'name': 'Trainiert', 'finished_at': '2026-11-21', 'sessionState': 'saved'}, {'id': 'two', 'name': 'Zweites Training', 'finished_at': '2026-11-21', 'sessionState': 'saved'}], True, '2026-11-21')
        self.ops = CooOperations(self.root, self.records)
        self.seen = []
        def runner(engine, system, user, *args):
            self.seen.append(user)
            return 'Vorbereitung aus den Quellen', engine
        self.runtime = Runtime(Path(self.tmp.name) / 'jobs.sqlite', runner, self.ops)
        app = FastAPI()
        app.include_router(create_router(self.runtime))
        self.client = TestClient(app)

    def tearDown(self):
        self.runtime.pool.shutdown()
        self.tmp.cleanup()

    def test_overview_and_context_are_read_only_and_client_scoped(self):
        before = {str(p): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        response = self.client.get('/api/csuite/coo/overview')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['cache-control'], 'no-store')
        self.assertEqual([row['id'] for row in response.json()['clients']], ['alice', 'bob', 'hidden', 'owner', 'tester'])
        context = self.ops.context('alice')
        serialized = json.dumps(context)
        self.assertIn('ALICE-ONLY', serialized)
        self.assertNotIn('BOB-ONLY', serialized)
        self.assertNotIn('NEVER-PROJECT', serialized)
        self.assertNotIn(str(self.root), serialized)
        self.assertEqual(len(context['workouts']), 2)
        self.assertEqual(context['followups'][0]['text'], 'Nach Schlaf fragen')
        self.assertEqual(self.seen, [])
        self.assertEqual(before, {str(p): p.read_bytes() for p in self.root.rglob('*') if p.is_file()})

    def test_server_binds_current_sources_and_rejects_stale_preview(self):
        context = self.ops.context('alice')
        payload = {'workspaceId': 'coo', 'engine': 'gemini', 'clientId': 'alice', 'expectedContextRevision': context['revision'], 'context': {'clientName': 'FORGED', 'clientContext': {'notes': 'FORGED'}}, 'message': 'Vorbereiten'}
        self.note.write_text(json.dumps({'note': 'Neue Alice-Notiz'}))
        self.assertEqual(self.client.post('/api/csuite/runs', json=payload).status_code, 409)
        self.assertEqual(self.seen, [])
        payload['expectedContextRevision'] = self.ops.context('alice')['revision']
        response = self.client.post('/api/csuite/runs', json=payload)
        self.assertEqual(response.status_code, 202, response.text)
        item = self.runtime.wait(response.json()['id'])
        self.assertEqual(item['context']['clientName'], 'Alice')
        self.assertEqual(item['context']['clientContext']['notes'][0]['text'], 'Neue Alice-Notiz')
        self.assertNotIn('FORGED', self.seen[0])
        self.assertNotIn('BOB-ONLY', self.seen[0])

    def test_explicit_cli_context_is_reloaded_and_revision_checked(self):
        from unittest.mock import patch
        context = self.ops.context('alice')
        payload = {'workspaceId': 'coo', 'clientId': 'alice', 'engine': 'gemini', 'expectedContextRevision': context['revision'], 'context': {'includeFitnessLog': True, 'expectedLogRevision': 'old', 'fitnessLog': 'forged'}, 'message': 'Prüfen'}
        with patch('coach_coo_tools.client_log', return_value={'status': 'available', 'revision': 'current', 'sessions': ['SERVER-CLI']}):
            self.assertEqual(self.client.post('/api/csuite/runs', json=payload).status_code, 409)
            payload['context']['expectedLogRevision'] = 'current'
            result = self.client.post('/api/csuite/runs', json=payload)
            self.assertEqual(result.status_code, 202)
            item = self.runtime.wait(result.json()['id'])
            self.assertEqual(item['context']['clientContext']['fitnessLog']['sessions'], ['SERVER-CLI'])
            self.assertIn('SERVER-CLI', self.seen[-1])

    def test_explicit_calendar_selection_is_refreshed_and_bound(self):
        event = {'id': 'appointment', 'title': 'Gespräch', 'start': '2026-11-27T10:00:00+01:00', 'revision': 'one'}
        self.ops.calendar_reader = lambda **kwargs: {'status': 'connected', 'events': [event]}
        snapshot = self.ops.context('alice')
        body = {'clientId': 'alice', 'expectedContextRevision': snapshot['revision'], 'eventId': 'appointment', 'expectedEventRevision': 'stale', 'engine': 'gemini', 'message': 'Vorbereitung'}
        self.assertEqual(self.client.post('/api/csuite/runs', json=body).status_code, 409)
        self.assertEqual(self.seen, [])
        body['expectedEventRevision'] = 'one'
        response = self.client.post('/api/csuite/runs', json=body)
        self.assertEqual(response.status_code, 202, response.text)
        item = self.runtime.wait(response.json()['id'])
        self.assertEqual(item['context']['clientContext']['appointment']['id'], 'appointment')
        self.assertIn('Gespräch', self.seen[0])

    def test_corrupt_source_and_missing_link_are_explicit(self):
        self.note.write_text('{broken')
        context = self.ops.context('alice')
        self.assertEqual(next(s['status'] for s in context['sources'] if s['id'] == 'notes'), 'error')
        profile = self.root / 'bob/client.json'
        profile.write_text(json.dumps({'name': 'Bob'}))
        self.assertEqual(next(s['status'] for s in self.ops.context('bob')['sources'] if s['id'] == 'workouts'), 'not-linked')

    def test_all_registered_roles_allowed_but_foreign_links_and_public_proxy_rejected(self):
        for client_id in ['hidden', 'owner', 'tester']:
            self.assertEqual(self.client.get(f'/api/csuite/coo/clients/{client_id}/context').status_code, 200)
        self.assertEqual(self.client.get('/api/csuite/coo/clients/unknown/context').status_code, 404)
        outside = Path(self.tmp.name) / 'outside.md'
        outside.write_text('OUTSIDE-SECRET')
        (self.root / 'alice/KLIENT.md').unlink()
        (self.root / 'alice/KLIENT.md').symlink_to(outside)
        context = self.ops.context('alice')
        self.assertNotIn('OUTSIDE-SECRET', json.dumps(context))
        self.assertEqual(next(s['status'] for s in context['sources'] if s['id'] == 'memo'), 'error')
        self.assertEqual(self.client.get('/api/csuite/coo/overview', headers={'tailscale-funnel-request': 'true'}).status_code, 403)
        self.assertEqual(self.client.get('/api/csuite/coo/overview', headers={'host': 'public.example'}).status_code, 403)


if __name__ == '__main__': unittest.main()
