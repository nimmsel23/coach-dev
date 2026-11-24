import tempfile
import unittest
import asyncio
from unittest.mock import patch
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from src import coach_workspace_api as api
from pathlib import Path
from src.coach_nutrition_preferences import read_preferences


class NutritionPreferencesTest(unittest.TestCase):
    def test_reads_rules_without_writing_or_exporting_profile(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            client = root / 'test'
            client.mkdir()
            (client / 'client.json').write_text('{"name":"Private Name"}')
            fuel = client / 'FUEL.md'
            content = '# Private Name\nE-Mail: private@example.test\n- kein Tofu\n- keine Nüsse\nVorlieben: österreichisch\n'
            fuel.write_text(content)
            value = read_preferences(root, 'test')
            self.assertEqual(value['source'], 'FUEL.md')
            self.assertIn('kein Tofu', value['context'])
            self.assertNotIn('Private Name', value['context'])
            self.assertNotIn('@', value['context'])
            self.assertEqual(fuel.read_text(), content)
            fuel.unlink()
            self.assertEqual(read_preferences(root, 'test'), {'source': None, 'context': ''})
            self.assertFalse(fuel.exists())
            (client / 'NUTRITION.md').write_text('- kein Tofu')
            self.assertEqual(read_preferences(root, 'test')['source'], 'NUTRITION.md')

    def test_context_cannot_escape_client_workspace(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            client = root / 'test'; client.mkdir()
            (client / 'client.json').write_text('{}')
            outside = root / 'private.md'; outside.write_text('secret')
            (client / 'FUEL.md').symlink_to(outside)
            with self.assertRaises(ValueError): read_preferences(root, 'test')

    def test_api_requires_coach_and_unique_client_assignment(self):
        async def direct(fn, *args): return fn(*args)
        async def run():
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); folder = root / 'client'; folder.mkdir()
                (folder / 'client.json').write_text('{"firebase_uid":"uid","name":"Test"}')
                (folder / 'FUEL.md').write_text('- kein Tofu')
                app = FastAPI(); app.include_router(api.router)
                with patch.object(api, 'clients_root', return_value=root), patch.object(api, 'require_coach') as verify, patch.object(api.asyncio, 'to_thread', direct):
                    async with AsyncClient(transport=ASGITransport(app=app, client=('127.0.0.1', 123)), base_url='http://localhost') as client:
                        self.assertEqual((await client.get('/api/clients/uid/nutrition-preferences')).status_code, 401)
                        verify.assert_not_called()
                        headers = {'authorization': 'Bearer test'}
                        response = await client.get('/api/clients/uid/nutrition-preferences', headers=headers)
                        self.assertEqual(response.status_code, 200)
                        self.assertEqual(response.json()['context'], 'kein Tofu')
                        self.assertEqual(response.headers['cache-control'], 'no-store')
                        self.assertEqual((await client.get('/api/clients/unknown/nutrition-preferences', headers=headers)).status_code, 404)
                        duplicate = root / 'duplicate'; duplicate.mkdir()
                        (duplicate / 'client.json').write_text('{"firebase_uid":"uid"}')
                        self.assertEqual((await client.get('/api/clients/uid/nutrition-preferences', headers=headers)).status_code, 409)
                        self.assertEqual((await client.get('/api/clients/uid/nutrition-preferences', headers={**headers, 'tailscale-funnel-request': '1'})).status_code, 403)
        asyncio.run(run())

if __name__ == '__main__': unittest.main()
