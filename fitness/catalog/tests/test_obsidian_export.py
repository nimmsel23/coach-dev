from __future__ import annotations

import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fitness.catalog.bootstrap import bootstrap
from fitness.catalog.agent.obsidian import export_coverage_note, export_exercise_note


class ObsidianExportTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.home = Path(self.tempdir.name)
        self.patcher = mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False)
        self.patcher.start()
        shutil.rmtree(Path("/tmp/Obsidian/Vitaltrainer/Fitness-Agent"), ignore_errors=True)
        bootstrap()

    def tearDown(self) -> None:
        self.patcher.stop()
        self.tempdir.cleanup()

    def test_export_exercise_note_uses_fallback_filename_when_target_exists(self) -> None:
        first = export_exercise_note("kh schrägbank")
        self.assertTrue(first.path.exists())
        self.assertFalse(first.used_fallback_name)
        self.assertEqual(first.path.name, "incline_dumbbell_press.md")

        second = export_exercise_note("kh schrägbank")
        self.assertTrue(second.path.exists())
        self.assertTrue(second.used_fallback_name)
        self.assertNotEqual(second.path, first.path)
        self.assertIn("incline_dumbbell_press-", second.path.name)
        self.assertTrue(first.path.exists())

        content = first.path.read_text(encoding="utf-8")
        self.assertIn("canonical_id: incline_dumbbell_press", content)
        self.assertIn("german_name: Schrägbankdrücken mit Kurzhanteln", content)
        self.assertIn("primary_muscles:", content)

    def test_export_coverage_note_writes_markdown(self) -> None:
        result = export_coverage_note("incline_dumbbell_press", 3, 8)
        self.assertTrue(result.path.exists())
        self.assertEqual(result.path.name, "incline_dumbbell_press-3x8.md")

        content = result.path.read_text(encoding="utf-8")
        self.assertIn("exercise: incline_dumbbell_press", content)
        self.assertIn("sets: 3", content)
        self.assertIn("rpe: 8", content)
        self.assertIn("muscle_scores:", content)
        self.assertIn("body_region_scores:", content)


if __name__ == "__main__":
    unittest.main()
