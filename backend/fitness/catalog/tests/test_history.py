from __future__ import annotations

import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from contextlib import closing
from unittest import mock

from fitness.catalog.bootstrap import bootstrap
from fitness.catalog.cli import main
from fitness.catalog.history import ensure_history_db, history_db_path, log_training_entry, progress_hint, read_history


class HistoryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.home = Path(self.tempdir.name)
        self.patcher = mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False)
        self.patcher.start()
        bootstrap()

    def tearDown(self) -> None:
        self.patcher.stop()
        self.tempdir.cleanup()

    def test_sqlite_creation(self) -> None:
        db_path = ensure_history_db()
        self.assertEqual(db_path, history_db_path())
        self.assertTrue(db_path.exists())

        with closing(sqlite3.connect(db_path)) as connection:
            row = connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='training_history'"
            ).fetchone()
        self.assertIsNotNone(row)

    def test_log_insert(self) -> None:
        result = log_training_entry(
            "incline_dumbbell_press",
            sets=3,
            reps=10,
            weight=24,
            rpe=8,
            workout_id="workout-001",
            date="2026-05-09",
            notes="felt good",
            pain="",
            completion_status="completed",
        )
        self.assertEqual(result.exercise_id, "incline_dumbbell_press")
        self.assertEqual(result.workout_id, "workout-001")

        entries = read_history("incline_dumbbell_press")
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["reps"], 10)
        self.assertEqual(entries[0]["weight"], 24.0)
        self.assertEqual(entries[0]["notes"], "felt good")

    def test_history_read(self) -> None:
        log_training_entry("incline_dumbbell_press", sets=3, reps=8, weight=22, rpe=8, date="2026-05-08")
        log_training_entry("incline_dumbbell_press", sets=3, reps=10, weight=24, rpe=8, date="2026-05-09")

        entries = read_history("incline_dumbbell_press", limit=2)
        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0]["date"], "2026-05-09")
        self.assertEqual(entries[1]["date"], "2026-05-08")

    def test_basic_progress_suggestion(self) -> None:
        log_training_entry("incline_dumbbell_press", sets=3, reps=10, weight=24, rpe=8, date="2026-05-09")
        hint = progress_hint("incline_dumbbell_press")

        self.assertEqual(hint["suggestion"], "Increase load slightly")
        self.assertIn("Top reps", hint["reason"])

    def test_cli_log_history_progress(self) -> None:
        code = main(
            [
                "log",
                "--exercise",
                "incline_dumbbell_press",
                "--sets",
                "3",
                "--reps",
                "10",
                "--weight",
                "24",
                "--rpe",
                "8",
                "--workout-id",
                "workout-002",
            ]
        )
        self.assertEqual(code, 0)

        history_code = main(["history", "--exercise", "incline_dumbbell_press"])
        self.assertEqual(history_code, 0)

        progress_code = main(["progress", "--exercise", "incline_dumbbell_press"])
        self.assertEqual(progress_code, 0)


if __name__ == "__main__":
    unittest.main()
