from __future__ import annotations

import io
import os
import shutil
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

from fitness.catalog.bootstrap import bootstrap
from fitness.catalog.cli import main
from fitness.catalog.coach_sheet import build_coach_sheet, render_coach_sheet_markdown
from fitness.catalog.agent.obsidian import export_coach_sheet_note, load_runtime_config


class CoachSheetTest(unittest.TestCase):
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

    def test_coach_sheet_output_includes_exercise_data(self) -> None:
        sheet = build_coach_sheet("dips_chest")
        output = render_coach_sheet_markdown(sheet)

        self.assertIn("Coach Sheet – Dips mit Brustfokus", output)
        self.assertIn("## Zielmuskeln", output)
        self.assertIn("Brust", output)
        self.assertIn("Leicht nach vorne lehnen.", output)
        self.assertIn("Schultern stabil halten.", output)

    def test_coach_sheet_includes_anatomy_lesson_if_present(self) -> None:
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            code = main(["coach-sheet", "--exercise", "dips_chest"])

        self.assertEqual(code, 0)
        output = buffer.getvalue()
        self.assertIn("## Anatomische Erklärung", output)
        self.assertIn("Brust-fokussierte Dips brauchen eine leichte Vorneigung", output)
        self.assertIn("## Trainer-Checkliste", output)

    def test_coach_sheet_handles_missing_anatomy_lesson_gracefully(self) -> None:
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            code = main(["coach-sheet", "--exercise", "lat_pulldown"])

        self.assertEqual(code, 0)
        output = buffer.getvalue()
        self.assertIn("Coach Sheet – Latzug", output)
        self.assertIn("Keine Anatomy-Lesson vorhanden", output)

    def test_coach_sheet_export_to_obsidian(self) -> None:
        result = export_coach_sheet_note("dips_chest")
        export_path = Path(load_runtime_config()["obsidian"]["export_path"]).expanduser()

        self.assertEqual(result.path, export_path / "Coach Sheets" / "dips_mit_brustfokus.md")
        self.assertTrue(result.path.exists())
        content = result.path.read_text(encoding="utf-8")
        self.assertIn("## Coaching Points", content)
        self.assertIn("## Trainer-Checkliste", content)


if __name__ == "__main__":
    unittest.main()
