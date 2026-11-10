from __future__ import annotations

import contextlib
import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fitness.catalog.bootstrap import bootstrap
from fitness.catalog.cli import main
from fitness.catalog.agent.teaching import find_lesson, load_chest_lessons, teach_exercise


class TeachingTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.home = Path(self.tempdir.name)
        self.patcher = mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False)
        self.patcher.start()
        bootstrap()

    def tearDown(self) -> None:
        self.patcher.stop()
        self.tempdir.cleanup()

    def test_lesson_loads(self) -> None:
        lessons = load_chest_lessons()
        self.assertEqual(len(lessons), 10)
        self.assertEqual(lessons[0]["exercise_id"], "dips_chest")
        self.assertIsNotNone(find_lesson("dips_chest"))
        self.assertIsNotNone(find_lesson("front_squat"))

    def test_teach_command_finds_dips_chest(self) -> None:
        output = teach_exercise("dips_chest", mode="trainer")
        self.assertIn("Lernziel", output)
        self.assertIn("Brust vs Trizeps", output)
        self.assertIn("Körperneigung", output)

    def test_trainer_mode_output_includes_coaching_cues_and_common_errors(self) -> None:
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = main(["teach", "dips_chest", "--mode", "trainer"])
        output = buffer.getvalue()
        self.assertEqual(code, 0)
        self.assertIn("## Coaching Cues", output)
        self.assertIn("## Häufige Fehler", output)
        self.assertIn("Schulterdumping", output)
        self.assertIn("## Anatomische Erklärung", output)

    def test_unknown_lesson_returns_helpful_error(self) -> None:
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = main(["teach", "unknown_exercise", "--mode", "trainer"])
        output = buffer.getvalue()
        self.assertEqual(code, 1)
        self.assertIn("FAIL: Unknown anatomy lesson: unknown_exercise", output)

    def test_client_mode_is_available(self) -> None:
        output = teach_exercise("dips_chest", mode="client")
        self.assertIn("Klientensprache", output)
        self.assertIn("Brust-fokussierte Dips", output)


if __name__ == "__main__":
    unittest.main()
