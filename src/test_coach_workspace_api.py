"""Isolated tests; no real workspace data, credentials or Firebase calls."""
import asyncio
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from src import coach_workspace_api as api


class WorkspaceTest(unittest.TestCase):
    def test_projection_and_missing_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            folder = root / 'client'
            folder.mkdir()
            (folder / 'client.json').write_text(json.dumps({'name': 'Test', 'firebase_uid': 'uid', 'firebase_uids': ['other'], 'secret': 'omit-me'}))
            (folder / 'data/training-plans').mkdir(parents=True)
            (folder / 'data/training-plans/p.json').write_text(json.dumps({'id': 'p', 'name': 'Plan', 'updatedAt': '2026-11-24', 'headVersion': 2, 'status': 'ready', 'routines': ['private'], 'delivery': {'localVersion': 1, 'at': '2026-11-23'}}))
            hidden = root / 'hidden'
            hidden.mkdir()
            (hidden / 'client.json').write_text(json.dumps({'name': 'Hidden', 'coach_visible': False}))
            result = api.workspace_summary(root)
            self.assertEqual(len(result['workspaces']), 1)
            item = result['workspaces'][0]
            self.assertEqual(item['uids'], ['other', 'uid'])
            self.assertEqual(item['plans'][0]['deliveredVersion'], 1)
            self.assertFalse(item['taskwarriorConfigured'])
            self.assertNotIn('private', json.dumps(result))
            self.assertNotIn('omit-me', json.dumps(result))
            self.assertNotIn(str(root), json.dumps(result))
            with self.assertRaises(HTTPException):
                api.workspace_summary(root / 'missing')

    def test_coach_token_and_role_checks(self):
        db = SimpleNamespace(collection=lambda _: SimpleNamespace(document=lambda _: SimpleNamespace(get=lambda: SimpleNamespace(exists=True, to_dict=lambda: {'role': 'coach'}))))
        with patch('coach_plan_push.get_db', return_value=db), patch('firebase_admin.auth.verify_id_token', return_value={'uid': 'coach'}) as verify:
            api.require_coach('token')
            verify.assert_called_once_with('token', check_revoked=True)
        denied = SimpleNamespace(collection=lambda _: SimpleNamespace(document=lambda _: SimpleNamespace(get=lambda: SimpleNamespace(exists=False))))
        with patch('coach_plan_push.get_db', return_value=denied), patch('firebase_admin.auth.verify_id_token', return_value={'uid': 'client'}):
            with self.assertRaises(HTTPException) as error:
                api.require_coach('token')
            self.assertEqual(error.exception.status_code, 403)
        with patch('coach_plan_push.get_db', return_value=db), patch('firebase_admin.auth.verify_id_token', side_effect=ValueError('bad token')):
            with self.assertRaises(HTTPException) as error:
                api.require_coach('token')
            self.assertEqual(error.exception.status_code, 401)

    def test_http_access_and_no_store(self):
        app = FastAPI()
        app.include_router(api.router)

        async def direct(function, *args):
            return function(*args)

        async def run():
            async with AsyncClient(transport=ASGITransport(app=app, client=('127.0.0.1', 123)), base_url='http://localhost') as client:
                with patch.object(api, 'require_coach') as verify, patch.object(api, 'workspace_summary', return_value={'workspaces': []}) as summary, patch.object(api.asyncio, 'to_thread', direct):
                    self.assertEqual((await client.get('/api/clients/workspaces')).status_code, 401)
                    summary.assert_not_called()
                    self.assertEqual((await client.get('/api/clients/workspaces', headers={'authorization': 'Bearer token', 'tailscale-funnel-request': '1'})).status_code, 403)
                    verify.assert_not_called()
                    response = await client.get('/api/clients/workspaces', headers={'authorization': 'Bearer token'})
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.headers['cache-control'], 'no-store')
                    verify.assert_called_once_with('token')
                    summary.assert_called_once()
        asyncio.run(run())


if __name__ == '__main__':
    unittest.main()
