from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fitness.catalog.bootstrap import bootstrap
from fitness.catalog.history import ensure_history_db
from fitness.runtime.sqlite_history import apply_history_patches, find_history_backfill_patches
from fitness.runtime.user_data import iter_session_signals, list_runtime_users


class UserDataTest(unittest.TestCase):
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

    def test_user_inventory_and_session_signals(self) -> None:
        sessions = self.runtime / "users" / "u1" / "sessions"
        sessions.mkdir(parents=True)
        (sessions / "2026-07-12.json").write_text(
            json.dumps(
                {
                    "exercises": [
                        {
                            "id": "wger_206",
                            "name": "Ausfallschritte im Gehen",
                            "note": "8kg jeweils, ca. 40 Schritte",
                            "setsArray": [{"reps": "", "weight": ""}],
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )

        users = list_runtime_users()
        self.assertEqual([(u.user_id, u.sessions) for u in users], [("u1", 1)])
        signals = iter_session_signals(user_id="u1")
        self.assertEqual(len(signals), 1)
        self.assertEqual(signals[0].values, {"sets": 1, "reps": 40, "weight": 8.0, "rpe": 0})

    def test_backfill_history_patches_only_zero_rows_and_apply(self) -> None:
        sessions = self.runtime / "users" / "u1" / "sessions"
        sessions.mkdir(parents=True)
        (sessions / "2026-07-12.json").write_text(
            json.dumps(
                {
                    "exercises": [
                        {
                            "id": "wger_206",
                            "name": "Ausfallschritte im Gehen",
                            "note": "8kg jeweils, ca. 40 Schritte",
                            "setsArray": [{"reps": "", "weight": ""}],
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )
        with sqlite3.connect(ensure_history_db()) as conn:
            conn.execute(
                "insert into training_history (date, workout_id, exercise_id, display_name, sets, reps, weight, rpe, done, notes, pain, completion_status) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                ("2026-07-12", "old-sync", "wger_206", "Ausfallschritte im Gehen", 0, 0, 0.0, 0, 0, "", "", "completed"),
            )
            conn.commit()

        patches = find_history_backfill_patches(user_id="u1", exercise_ids={"wger_206"})
        self.assertEqual(len(patches), 1)
        self.assertEqual(patches[0].after, {"sets": 1, "reps": 40, "weight": 8.0, "rpe": 0, "notes": "8kg jeweils, ca. 40 Schritte"})
        self.assertEqual(apply_history_patches(patches), 1)
        with sqlite3.connect(ensure_history_db()) as conn:
            row = conn.execute(
                "select sets, reps, weight, rpe, notes from training_history where exercise_id='wger_206'"
            ).fetchone()
        self.assertEqual(row, (1, 40, 8.0, 0, "8kg jeweils, ca. 40 Schritte"))

    def test_backfill_skips_zero_duplicate_when_matching_row_exists(self) -> None:
        sessions = self.runtime / "users" / "u1" / "sessions"
        sessions.mkdir(parents=True)
        (sessions / "2026-07-12.json").write_text(
            json.dumps(
                {
                    "exercises": [
                        {
                            "id": "wger_206",
                            "name": "Ausfallschritte im Gehen",
                            "note": "8kg jeweils, ca. 40 Schritte",
                            "setsArray": [{"reps": "", "weight": ""}],
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )
        with sqlite3.connect(ensure_history_db()) as conn:
            conn.execute(
                "insert into training_history (date, workout_id, exercise_id, display_name, sets, reps, weight, rpe, done, notes, pain, completion_status) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                ("2026-07-12", "already-patched", "wger_206", "Ausfallschritte im Gehen", 1, 40, 8.0, 0, 0, "8kg jeweils, ca. 40 Schritte", "", "completed"),
            )
            conn.execute(
                "insert into training_history (date, workout_id, exercise_id, display_name, sets, reps, weight, rpe, done, notes, pain, completion_status) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                ("2026-07-12", "duplicate-zero", "wger_206", "Ausfallschritte im Gehen", 0, 0, 0.0, 0, 0, "", "", "completed"),
            )
            conn.commit()

        patches = find_history_backfill_patches(user_id="u1", exercise_ids={"wger_206"})
        self.assertEqual(patches, [])


if __name__ == "__main__":
    unittest.main()
