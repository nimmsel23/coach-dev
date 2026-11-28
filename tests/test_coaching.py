"""coach_coaching.person gegen ein temporäres Session-Verzeichnis."""
import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import coach_coaching
from fitness.log.clients.models import ClientMeta


class PersonTest(unittest.TestCase):
    def test_merges_staged_and_app_and_finds_due_block(self):
        with tempfile.TemporaryDirectory() as tmp:
            sdir = Path(tmp) / "sessions"
            sdir.mkdir()
            (sdir / "2026-11-20.json").write_text(json.dumps({"block": "LEGS", "effort": 8}))
            app = [{"date": "2026-11-25", "block": "Pull", "effort": 7}]
            meta = ClientMeta(uid="u", uids=["u"], name="Test", slug="test", client_dir=Path(tmp), status="freund")
            with patch("fitness.log.clients.service.load_client_sessions", return_value=app):
                r = coach_coaching.person(meta, date(2026, 11, 28))
        self.assertEqual(r["spur"], "Freund")
        self.assertEqual((r["last"], r["last_block"], r["pause"], r["lage"]), ("2026-11-25", "Pull", 3, "im Rhythmus"))
        self.assertEqual(r["faellig"], {"block": "Legs", "seit": 8})
        self.assertEqual(r["einheiten"], 2)
        self.assertEqual(r["rpe"], 7.5)


if __name__ == "__main__":
    unittest.main()
