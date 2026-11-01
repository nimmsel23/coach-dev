"""Isolated Coach gateway checks; never use a live catalog backend or user data."""
from contextlib import asynccontextmanager
import gzip
import json
from unittest.mock import patch
import tempfile
import unittest
from pathlib import Path

import httpx

from server import create_app


class CoachServerTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="coach-server-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.catalog = self.root / "catalog"
        self.coach = self.root / "coach"
        for path, text in [(self.catalog, "catalog"), (self.coach, "coach")]:
            path.mkdir()
            (path / "index.html").write_text(text)
        self.requests = []

    @asynccontextmanager
    async def client(self, handler=None, backend_urls=None):
        def backend(request):
            self.requests.append(request)
            return handler(request) if handler else httpx.Response(200, stream=httpx.ByteStream(b'{"ok":true}'))
        app = create_app(catalog_directory=self.catalog, coach_directory=self.coach,
                         upstream_url="http://catalog.test:9150", backend_urls=backend_urls, transport=httpx.MockTransport(backend))
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://testserver", follow_redirects=True) as client:
                yield client

    async def test_ui_mounts_and_missing_assets(self):
        async with self.client() as client:
            self.assertEqual((await client.get("/")).text, "catalog")
            self.assertEqual((await client.get("/catalog-ui/")).text, "catalog")
            self.assertEqual((await client.get("/coach/")).text, "coach")
            self.assertEqual((await client.get("/coach", follow_redirects=False)).headers["location"], "/coach/")
            self.assertEqual((await client.head("/")).content, b"")
            self.assertEqual((await client.get("/assets/missing.js")).status_code, 404)
            self.assertEqual((await client.get("/coach/assets/missing.js")).status_code, 404)
            self.assertTrue((await client.get("/_coach/health")).json()["catalog_ready"])
        self.assertFalse(self.requests)

    async def test_proxy_preserves_payload_query_status_and_cookies(self):
        def reply(request):
            return httpx.Response(409, headers=[("set-cookie", "a=1"), ("set-cookie", "b=2")],
                                  stream=httpx.ByteStream(b'{"detail":"conflict"}'))
        async with self.client(reply) as client:
            response = await client.post("/fitness/inbox/item/approve?source=a%2Fb", content=b'{"approved":true}',
                                   headers={"content-type": "application/json", "connection": "x-private", "x-private": "drop"})
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.headers.get_list("set-cookie"), ["a=1", "b=2"])
            request = self.requests[0]
            self.assertEqual(str(request.url), "http://catalog.test:9150/fitness/inbox/item/approve?source=a%2Fb")
            self.assertEqual(request.content, b'{"approved":true}')
            self.assertNotIn("x-private", request.headers)

    async def test_compressed_response_is_not_corrupted(self):
        packed = gzip.compress(b'{"ok":true}')
        async with self.client(lambda request: httpx.Response(200, headers={"content-encoding": "gzip", "content-length": str(len(packed))},
                                                      stream=httpx.ByteStream(packed))) as client:
            self.assertEqual((await client.get("/api/fitness/health")).json(), {"ok": True})

    async def test_backend_failure_does_not_hide_local_health(self):
        def unavailable(request):
            raise httpx.ConnectError("unavailable", request=request)
        async with self.client(unavailable) as client:
            self.assertEqual((await client.get("/api/fitness/health")).status_code, 502)
            self.assertEqual((await client.get("/_coach/health")).status_code, 200)

    async def test_static_paths_cannot_escape_build_or_follow_external_symlinks(self):
        (self.root / "secret.txt").write_text("secret")
        (self.catalog / "leak.txt").symlink_to(self.root / "secret.txt")
        async with self.client() as client:
            for path in ["/leak.txt", "/%2e%2e%2fsecret.txt", "/coach/%2e%2e%2fsecret.txt"]:
                self.assertEqual((await client.get(path)).status_code, 403, path)

    async def test_missing_catalog_does_not_fall_back_to_cloud_ui(self):
        (self.catalog / "index.html").unlink()
        async with self.client() as client:
            self.assertEqual((await client.get("/")).status_code, 503)
            self.assertEqual((await client.get("/coach/")).text, "coach")

    async def test_domains_route_to_their_own_backend_and_preserve_suffix(self):
        origins = {"fuel": "http://fuel.test:4000", "relax": "http://relax.test:9123"}
        async with self.client(backend_urls=origins) as client:
            for incoming, outgoing in [
                ("/api/fuel/nutrition?date=2026-10-21", "http://fuel.test:4000/nutrition?date=2026-10-21"),
                ("/fuel-api/journal", "http://fuel.test:4000/journal"),
                ("/api/relax/techniques", "http://relax.test:9123/techniques"),
                ("/relax-api/health", "http://relax.test:9123/health"),
                ("/api/fitness/exercise/a%2Fb", "http://catalog.test:9150/exercise/a%2Fb"),
                ("/api/%66uel/nutrition", "http://fuel.test:4000/nutrition"),
                ("/api/workouts", "http://catalog.test:9150/api/workouts"),
                ("/session?uid=fixture", "http://catalog.test:9150/session?uid=fixture"),
            ]:
                self.assertEqual((await client.get(incoming)).status_code, 200)
                self.assertEqual(str(self.requests[-1].url), outgoing)

    async def test_readiness_reports_each_domain_without_changing_liveness(self):
        def reply(request):
            return httpx.Response(503 if request.url.host == "relax.test" else 200,
                                  stream=httpx.ByteStream(b'{}'))
        async with self.client(reply, {"relax": "http://relax.test:9123"}) as client:
            response = (await client.get("/_coach/backends")).json()
            self.assertFalse(response["ok"])
            self.assertTrue(response["backends"]["fitness"]["ready"])
            self.assertFalse(response["backends"]["relax"]["ready"])
            self.assertEqual((await client.get("/health")).json()["service"], "coach")

    async def test_registry_can_add_a_domain_without_server_code_changes(self):
        async with self.client(backend_urls={"skills": "http://skills.test:9300"}) as client:
            self.assertEqual((await client.get("/api/skills/health")).status_code, 200)
            self.assertEqual(str(self.requests[-1].url), "http://skills.test:9300/health")

    async def test_client_entry_and_api_precede_gateway(self):
        clients=self.root/'clients'
        (clients/'fixture').mkdir(parents=True)
        (clients/'fixture/client.json').write_text(json.dumps({'name':'Fixture'}))
        ui=self.root/'legacy-ui'/'dist-klienten'
        ui.mkdir(parents=True)
        (ui/'klienten.html').write_text('<html><head></head><body>Legacy ClientForge</body></html>')
        with patch.dict('os.environ',{'CLIENTS_ROOT':str(clients),'KLIENTEN_UI_ROOT':str(ui.parent)}):
            async with self.client() as client:
                for path in ['/fixture','/fixture/','/k/fixture','/k/fixture/']:
                    response=await client.get('http://localhost'+path+'?embed=1&client=wrong',follow_redirects=False)
                    self.assertEqual(response.status_code,200)
                    self.assertIn('Legacy ClientForge',response.text)
                    self.assertIn('<base href="/_klienten/">',response.text)
                response=await client.get('http://localhost/api/client/fixture/plans')
                self.assertEqual(response.json(),{'plans':[]})
                self.assertEqual(response.headers['cache-control'],'no-store')
                self.assertEqual((await client.get('http://localhost/missing')).status_code,404)
                legacy=await client.get('http://localhost/k/fixture/plan')
                self.assertEqual(legacy.status_code,200)
                self.assertIn('data',legacy.json())
                self.assertEqual((await client.get('http://localhost/k/unknown/plan')).status_code,404)
        self.assertFalse(self.requests)

    async def test_self_proxy_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "points back to Coach"):
            create_app(backend_urls={"fitness": "http://127.0.0.1:9150"})


if __name__ == "__main__":
    unittest.main()
