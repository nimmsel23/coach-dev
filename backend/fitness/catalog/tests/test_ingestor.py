from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fitness.catalog.agent.ingestor import ingest_all_sessions
from fitness.catalog.bootstrap import bootstrap
from fitness.catalog.history import ensure_history_db


class IngestorTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)
        self.runtime = self.root / "runtime"
        env = {
            "HOME": str(self.root),
            "FITNESS_AGENT_HOME": str(self.runtime),
            "FITNESS_RUNTIME": str(self.runtime),
        }
        self.patcher = mock.patch.dict(os.environ, env, clear=False)
        self.patcher.start()
        bootstrap()

    def tearDown(self) -> None:
        self.patcher.stop()
        self.tempdir.cleanup()

    def test_ingest_skips_empty_template_exercises(self) -> None:
        sessions = self.runtime / "users" / "u1" / "sessions"
        sessions.mkdir(parents=True)
        (sessions / "2026-07-12.json").write_text(
            json.dumps({
                "block": "",
                "exercises": [
                    {
                        "id": "wger_206",
                        "name": "Ausfallschritte im Gehen",
                        "setsArray": [{"reps": "", "weight": ""}],
                    }
                ],
            }),
            encoding="utf-8",
        )

        self.assertEqual(ingest_all_sessions(), 0)
        with sqlite3.connect(ensure_history_db()) as conn:
            count = conn.execute("select count(*) from training_history").fetchone()[0]
        self.assertEqual(count, 0)

    def test_ingest_uses_stable_workout_id_for_blank_block(self) -> None:
        sessions = self.runtime / "users" / "u1" / "sessions"
        sessions.mkdir(parents=True)
        (sessions / "2026-07-12.json").write_text(
            json.dumps({
                "block": "",
                "exercises": [
                    {
                        "id": "041",
                        "name": "Schrägbankdrücken mit Kurzhanteln",
                        "setsArray": [{"reps": "10", "weight": "24"}],
                    }
                ],
            }),
            encoding="utf-8",
        )

        self.assertEqual(ingest_all_sessions(), 1)
        self.assertEqual(ingest_all_sessions(), 0)
        with sqlite3.connect(ensure_history_db()) as conn:
            rows = conn.execute(
                "select workout_id, exercise_id, sets, reps, weight from training_history"
            ).fetchall()
        self.assertEqual(rows, [("u1:2026-07-12", "041", 1, 10, 24.0)])

    def test_ingest_keeps_note_only_training_signal(self) -> None:
        sessions = self.runtime / "users" / "u1" / "sessions"
        sessions.mkdir(parents=True)
        (sessions / "2026-07-04.json").write_text(
            json.dumps({
                "block": "",
                "exercises": [
                    {
                        "id": "wger_348",
                        "name": "Seitheben KH",
                        "note": "4kg jeweils, ca. 20x",
                        "setsArray": [{"reps": "", "weight": ""}],
                    }
                ],
            }),
            encoding="utf-8",
        )

        self.assertEqual(ingest_all_sessions(), 1)
        with sqlite3.connect(ensure_history_db()) as conn:
            rows = conn.execute(
                "select workout_id, exercise_id, sets, reps, weight from training_history"
            ).fetchall()
        self.assertEqual(rows, [("u1:2026-07-04", "dumbbell_lateral_raise", 1, 20, 4.0)])


if __name__ == "__main__":
    unittest.main()
