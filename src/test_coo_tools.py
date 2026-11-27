"""The browser adapter reuses CLI services with exact client identity."""
import sys
import types
import unittest
from dataclasses import dataclass
from unittest.mock import patch
from coach_coo_tools import client_log
from fastapi import HTTPException


@dataclass
class Stats:
    total_sessions: int = 2


@dataclass
class Session:
    date: str = '2026-11-27'
    raw: str = 'NEVER RETURN'


class ToolsTests(unittest.TestCase):
    def test_exact_slug_and_uid_scoping_and_no_source_writes(self):
        calls = []
        alice = types.SimpleNamespace(slug='alice', uids=['uid-a'])
        other = types.SimpleNamespace(slug='alice-other', uids=['uid-other'])
        service = types.ModuleType('fitness.log.clients.service')
        service.get_clients_registry = lambda: [other, alice]
        service.load_client_sessions = lambda meta, **kw: calls.append(('sessions', meta.slug, kw)) or [{}]
        service.compute_client_stats = lambda *a, **kw: Stats()
        service.parse_session_item = lambda row: Session()
        drafts = types.ModuleType('fitness.log.console.drafts')
        drafts.list_drafts = lambda uid: calls.append(('drafts', uid)) or [{'text': 'selected only', 'secret': 'excluded'}]
        ops = types.SimpleNamespace(context=lambda cid: calls.append(('guard', cid)))
        with patch.dict(sys.modules, {'fitness.log.clients.service': service, 'fitness.log.console.drafts': drafts}):
            result = client_log(ops, 'alice')
            self.assertEqual(calls[0], ('guard', 'alice'))
            self.assertEqual(calls[-1], ('drafts', 'uid-a'))
            self.assertEqual(result['sessions'], [{'date': '2026-11-27'}])
            self.assertNotIn('secret', result['drafts'][0])
            self.assertEqual(client_log(ops, 'unknown')['status'], 'not-linked')
            ops.context = lambda cid: (_ for _ in ()).throw(HTTPException(404, 'hidden'))
            with self.assertRaises(HTTPException):
                client_log(ops, 'hidden')
