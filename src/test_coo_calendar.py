import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import coach_coo_calendar as calendar


class CalendarTests(unittest.TestCase):
    def run_calendar(self, code, raw):
        with patch.object(calendar.shutil, 'which', return_value='/usr/bin/gog'), patch.object(calendar.subprocess, 'run', return_value=SimpleNamespace(returncode=code, stdout=json.dumps(raw))) as run:
            data = calendar.read_calendar(refresh=True)
            command = run.call_args.args[0]
            self.assertIn('--readonly', command)
            return data

    def test_login_failure_is_not_an_empty_calendar(self):
        data = self.run_calendar(4, {'error': {'class': 'auth_required'}})
        self.assertEqual(data['status'], 'auth-required')

    def test_events_keep_exact_ids_and_do_not_export_private_descriptions(self):
        data = self.run_calendar(0, {'events': [{'id': 'a', 'summary': 'Erstgespräch', 'description': 'PRIVATE-NOT-NEEDED', 'start': {'dateTime': '2026-11-27T10:00:00+01:00'}, 'end': {'dateTime': '2026-11-27T10:30:00+01:00'}}, {'id': 'cancelled', 'status': 'cancelled'}]})
        self.assertEqual(data['status'], 'connected')
        self.assertEqual([row['id'] for row in data['events']], ['a'])
        self.assertNotIn('PRIVATE-NOT-NEEDED', json.dumps(data))
        self.assertTrue(data['events'][0]['revision'])
