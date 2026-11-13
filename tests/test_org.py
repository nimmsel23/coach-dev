"""/api/org gegen ein temporäres workspace-Repo; ruft den echten Coaching-Bericht nicht auf."""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

import coach_org


class OrgRouterTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        ws = Path(self.temp.name)
        subprocess.run(["git", "-C", str(ws), "init", "-q"], check=True)
        env = patch.dict(os.environ, {"COACH_WORKSPACE_DIR": str(ws), "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
                                      "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"})
        env.start()
        self.addCleanup(env.stop)
        nopush = patch.object(coach_org.threading, "Thread")
        nopush.start()
        self.addCleanup(nopush.stop)
        stub = patch.object(coach_org, "coaching", return_value={"belegt": 1})
        stub.start()
        self.addCleanup(stub.stop)
        app = FastAPI()
        app.include_router(coach_org.create_router())
        self.ws = ws
        self.local = TestClient(app, base_url="http://127.0.0.1:9150")
        self.remote = TestClient(app, base_url="http://alpha.tail.ts.net")

    def test_state_and_answers_roundtrip(self):
        ok = self.local.post("/api/org/decision", json={"id": "kapazitaet", "status": "angenommen"},
                             headers={"Origin": "https://nimmsel23.github.io"})
        self.assertEqual(ok.status_code, 200)
        self.local.post("/api/org/line", json={"text": "Freitag bleibt der Fokus liegen."})
        state = self.local.get("/api/org/state").json()
        self.assertTrue(state["live"])
        self.assertEqual(state["coaching"], {"belegt": 1})
        self.assertEqual([a["kind"] for a in state["answers"]], ["Zeile", "Entscheid"])
        log = subprocess.run(["git", "-C", str(self.ws), "log", "--oneline"], capture_output=True, text=True).stdout
        self.assertEqual(len(log.splitlines()), 2)

    def test_rejects_foreign_origin_proxy_and_remote_host(self):
        self.assertEqual(self.local.post("/api/org/line", json={"text": "x"},
                                         headers={"Origin": "https://evil.example"}).status_code, 403)
        self.assertEqual(self.local.get("/api/org/state", headers={"X-Forwarded-For": "1.2.3.4"}).status_code, 403)
        self.assertEqual(self.remote.get("/api/org/state").status_code, 403)

    def test_validates_input(self):
        self.assertEqual(self.local.post("/api/org/decision", json={"id": "x", "status": "vielleicht"}).status_code, 400)
        self.assertEqual(self.local.post("/api/org/line", json={"text": "  "}).status_code, 400)
        self.assertEqual(self.local.post("/api/org/line", json={"text": "a" * 501}).status_code, 413)


if __name__ == "__main__":
    unittest.main()
