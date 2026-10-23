import gzip
import json
import os
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import coach_sixpack as sp


class FakeSnap:
    def __init__(self, id, data):
        self.id, self._data = id, data
        self.exists = data is not None

    def to_dict(self):
        return self._data


class FakeColl:
    def __init__(self, docs): self.docs = docs
    def document(self, id): return FakeDoc(self.docs.get(id))
    def stream(self): return [FakeSnap(k, v) for k, v in self.docs.items()]


class FakeDoc:
    def __init__(self, data, subs=None): self.data, self.subs = data, subs or {}
    def collection(self, name): return FakeColl(self.subs.get(name, {})) if not isinstance(self.data, FakeColl) else self.data
    def get(self): return FakeSnap("x", self.data)


class FakeDb:
    """users/{uid}/meta/sixpack und fitness/{uid}/{sessions,workoutIndex}."""
    def __init__(self, program=None, sessions=None, index=None):
        self.program, self.sessions, self.index = program, sessions or {}, index or {}

    def collection(self, name):
        db = self
        if name == "users":
            return type("U", (), {"document": lambda _, uid: type("UD", (), {"collection": lambda _, m: type("M", (), {"document": lambda _, d: FakeDoc(db.program)})()})()})()
        return type("F", (), {"document": lambda _, uid: type("FD", (), {"collection": lambda _, c: FakeColl(db.sessions if c == "sessions" else db.index)})()})()


def d(s): return date.fromisoformat(s)


class StreakTests(unittest.TestCase):
    def test_leer(self):
        self.assertEqual(sp.compute_streaks(set(), d("2026-10-23"))["current"], 0)

    def test_aktuelle_und_laengste(self):
        days = {d(x) for x in ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-20", "2026-10-21", "2026-10-22"]}
        s = sp.compute_streaks(days, d("2026-10-22"))
        self.assertEqual((s["current"], s["longest"], s["longestEnd"]), (3, 4, "2026-10-04"))

    def test_heute_noch_offen_haelt_streak(self):
        days = {d("2026-10-21"), d("2026-10-22")}
        self.assertEqual(sp.compute_streaks(days, d("2026-10-23"))["current"], 2)

    def test_gestern_leer_reisst_streak(self):
        s = sp.compute_streaks({d("2026-10-21")}, d("2026-10-23"))
        self.assertEqual((s["current"], s["daysSinceActive"]), (0, 2))


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        env = patch.dict(os.environ, {"COACH_SIXPACK_ARCHIVE_DIR": self.tmp.name}); env.start(); self.addCleanup(env.stop)

    def db(self):
        return FakeDb(
            program={"currentDay": 3, "completedDays": [1, 2], "completedOn": {"1": "2026-10-20", "2": "2026-10-21"}, "lastCompletedOn": "2026-10-21", "updatedAt": 1},
            sessions={
                "2026-10-21__sixpack-b": {"date": "2026-10-21", "source": {"app": "sixpack"}, "sessionGate": {"endedAt": "2026-10-21T08:00:00Z"}},
                "2026-10-20__sixpack-a": {"date": "2026-10-20", "source": {"app": "sixpack"}, "sessionGate": {"endedAt": "2026-10-20T08:00:00Z"}},
                "2026-10-22__fitness-x": {"date": "2026-10-22", "source": {"app": "fitness"}},
            },
            index={"2026-10": {"entries": {
                "2026-10-20__sixpack-a": {"id": "2026-10-20__sixpack-a", "date": "2026-10-20", "source": "sixpack"},
                "2026-10-05__sixpack-old": {"id": "2026-10-05__sixpack-old", "date": "2026-10-05", "source": "sixpack"},
            }}},
        )

    def test_chronologisch_und_gefiltert(self):
        events = sp.fetch_client(self.db(), "u1")
        keys = [(e["date"], e["type"]) for e in events[:-1]]
        self.assertEqual(keys, sorted(keys, key=lambda k: (k[0], sp._ORDER[k[1]])))
        self.assertEqual([e["id"] for e in events if e["type"] == "session"], ["2026-10-20__sixpack-a", "2026-10-21__sixpack-b"])
        self.assertEqual([e["id"] for e in events if e["type"] == "session_index"], ["2026-10-05__sixpack-old"])
        self.assertEqual(events[-1]["type"], "program")

    def test_sync_schreibt_gzip_jsonl(self):
        out = sp.sync_clients(["u1"], get_db=self.db)
        self.assertTrue(out["ok"])
        path = Path(self.tmp.name) / "u1" / "6pack.jsonl.gz"
        lines = gzip.decompress(path.read_bytes()).decode().splitlines()
        self.assertEqual(len(lines), len(sp.read_archive("u1")))
        self.assertEqual(json.loads(lines[0])["date"], "2026-10-05")
        self.assertEqual(out["synced"][0]["streaks"]["longest"], 2)
        self.assertFalse(list(path.parent.glob(".6pack-*")))

    def test_klient_ohne_daten_wird_uebersprungen(self):
        out = sp.sync_clients(["u2"], get_db=lambda: FakeDb())
        self.assertEqual(out["synced"][0]["skipped"], "no_sixpack_data")
        self.assertFalse((Path(self.tmp.name) / "u2").exists())

    def test_fehler_stoppt_andere_nicht(self):
        calls = {"n": 0}
        def flaky(db, uid):
            calls["n"] += 1
            if uid == "bad": raise RuntimeError("boom")
            return [{"type": "program", "uid": uid, "date": "2026-10-21", "ts": "", "data": {}}]
        with patch.object(sp, "fetch_client", flaky):
            out = sp.sync_clients(["bad", "good"], get_db=lambda: FakeDb())
        self.assertFalse(out["ok"])
        self.assertEqual((len(out["synced"]), len(out["errors"])), (1, 1))


class DigestTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        kl = Path(self.tmp.name) / "Klienten"
        for slug, uid in [("anna", "uA"), ("ben", "uB"), ("cleo", "uC")]:
            (kl / slug).mkdir(parents=True)
            (kl / slug / "client.json").write_text(json.dumps({"name": slug.title(), "firebase_uid": uid}))
        env = patch.dict(os.environ, {"COACH_SIXPACK_ARCHIVE_DIR": self.tmp.name + "/clients", "COACH_KLIENTEN_DIR": str(kl)})
        env.start(); self.addCleanup(env.stop)
        def archive(uid, days):
            sp.write_archive(uid, [{"type": "day_completed", "uid": uid, "date": x, "ts": "", "day": i + 1} for i, x in enumerate(days)])
        archive("uA", ["2026-10-21", "2026-10-22", "2026-10-23"])   # heute aktiv
        archive("uB", ["2026-10-14", "2026-10-15", "2026-10-16"])   # seit 7 Tagen weg, Streak war 3
        # uC ohne Archiv
        for uid, status in [("uA", "client"), ("uB", "client")]:
            sp.meta_path(uid).write_text(json.dumps({"clientStatus": status}))

    def test_status_und_alerts(self):
        digest = sp.build_digest(d("2026-10-23"))
        self.assertEqual([(c["name"], c["status"]) for c in digest["clients"]], [("Anna", "active"), ("Ben", "lapsed")])
        self.assertEqual([c["name"] for c in digest["alerts"]], ["Ben"])
        self.assertEqual(digest["alerts"][0]["streaks"]["lastRun"], 3)

    def test_freund_wird_angezeigt_aber_nicht_gemeldet(self):
        sp.meta_path("uB").write_text(json.dumps({"clientStatus": "friend"}))
        digest = sp.build_digest(d("2026-10-23"))
        self.assertEqual(digest["alerts"], [])
        self.assertIn("Ben (Freund): seit 7 Tagen nichts geloggt", sp.render_digest(digest))

    def test_fehlender_status_gilt_als_freund(self):
        sp.meta_path("uB").unlink()
        self.assertEqual(sp.build_digest(d("2026-10-23"))["alerts"], [])

    def test_status_aus_firestore_profil(self):
        db = type("D", (), {"collection": lambda _, n: type("C", (), {"document": lambda _, u: type("X", (), {"collection": lambda _, c: type("P", (), {"document": lambda _, m: FakeDoc({"clientStatus": "client"})})()})()})()})()
        self.assertEqual(sp.fetch_client_status(db, "uA"), "client")
        db2 = type("D", (), {"collection": lambda _, n: type("C", (), {"document": lambda _, u: type("X", (), {"collection": lambda _, c: type("P", (), {"document": lambda _, m: FakeDoc(None)})()})()})()})()
        self.assertEqual(sp.fetch_client_status(db2, "uA"), "friend")

    def test_kein_alert_an_nicht_meldetagen(self):
        self.assertEqual(sp.build_digest(d("2026-10-21"))["alerts"], [])  # Ben: 5 Tage -> still

    def test_offen_bevor_heute_gemacht(self):
        digest = sp.build_digest(d("2026-10-24"))
        self.assertEqual(digest["clients"][0]["status"], "open")

    def test_text(self):
        text = sp.render_digest(sp.build_digest(d("2026-10-23")), only_alerts=True)
        self.assertIn("Ben: seit 7 Tagen nichts geloggt (letzte Streak 3 Tage)", text)
        self.assertNotIn("Anna", text)


if __name__ == "__main__":
    unittest.main()
