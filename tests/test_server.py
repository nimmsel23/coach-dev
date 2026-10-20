"""Isolated Coach gateway checks; never use a live catalog backend or user data."""
from contextlib import asynccontextmanager
import gzip
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
    async def client(self, handler=None):
        def backend(request):
            self.requests.append(request)
            return handler(request) if handler else httpx.Response(200, stream=httpx.ByteStream(b'{"ok":true}'))
        app = create_app(catalog_directory=self.catalog, coach_directory=self.coach,
                         upstream_url="http://catalog.test:9150", transport=httpx.MockTransport(backend))
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
            self.assertEqual((await client.get("/health")).json(), {"ok": True})

    async def test_backend_failure_does_not_hide_local_health(self):
        def unavailable(request):
            raise httpx.ConnectError("unavailable", request=request)
        async with self.client(unavailable) as client:
            self.assertEqual((await client.get("/health")).status_code, 502)
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


if __name__ == "__main__":
    unittest.main()
