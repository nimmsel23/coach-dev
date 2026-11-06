from __future__ import annotations

import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fitness.catalog.api.sync_gateway import sync_session
from fitness.catalog.bootstrap import bootstrap
from fitness.catalog.history import ensure_history_db


class SyncGatewayTest(unittest.TestCase):
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

    def test_sync_parses_note_only_training_signal(self) -> None:
        # Jede Übung in exercises[] gilt als geloggt, sobald sie per "+"-Klick
        # zur Session hinzugefügt wurde — unabhängig davon, ob Sätze/Gewicht
        # ausgefüllt wurden (siehe session_signal.py::exercise_has_training_signal,
        # Fix 2026-08-23 nach Fund einer spurlos aus der History verschwundenen
        # Pull-Session). "wger_empty" bleibt daher NICHT mehr ungesynct, nur
        # ihre Sets/Reps/Gewicht bleiben 0.
        count = sync_session(
            "2026-07-12",
            {
                "block": "",
                "exercises": [
                    {
                        "id": "wger_206",
                        "name": "Ausfallschritte im Gehen",
                        "note": "8kg jeweils, ca. 40 Schritte",
                        "setsArray": [{"reps": "", "weight": ""}],
                    },
                    {
                        "id": "wger_empty",
                        "name": "Empty Template",
                        "setsArray": [{"reps": "", "weight": ""}],
                    },
                ],
            },
        )

        self.assertEqual(count, 2)
        with sqlite3.connect(ensure_history_db()) as conn:
            rows = conn.execute(
                "select workout_id, exercise_id, sets, reps, weight, notes from training_history order by exercise_id"
            ).fetchall()
        self.assertEqual(
            rows,
            [
                ("2026-07-12", "wger_206", 1, 40, 8.0, "8kg jeweils, ca. 40 Schritte"),
                ("2026-07-12", "wger_empty", 0, 0, 0.0, ""),
            ],
        )


if __name__ == "__main__":
    unittest.main()
