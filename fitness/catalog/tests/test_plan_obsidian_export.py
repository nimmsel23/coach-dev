from __future__ import annotations

import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fitness.catalog.bootstrap import bootstrap
from fitness.catalog.agent.obsidian import export_plan_note, load_runtime_config
from fitness.catalog.planner import build_plan


class PlanObsidianExportTest(unittest.TestCase):
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

    def test_plan_markdown_generation_uses_configured_export_path_and_includes_coverage_summary(self) -> None:
        plan = build_plan(template="push_day", goal="hypertrophy")
        result = export_plan_note(plan)
        config = load_runtime_config()
        export_path = Path(config["obsidian"]["export_path"]).expanduser()

        self.assertEqual(result.path.parent, export_path)
        self.assertTrue(result.path.exists())
        self.assertEqual(result.path.name, "push_day-hypertrophy.md")

        content = result.path.read_text(encoding="utf-8")
        self.assertIn("# Push Day – Hypertrophy", content)
        self.assertIn("## Übungen", content)
        self.assertIn("| # | Übung | Sätze | Wdh | RPE | Pause |", content)
        self.assertIn("## Coverage Summary", content)
        self.assertIn("coverage_summary:", content)

    def test_plan_export_uses_timestamped_filename_without_force_when_target_exists(self) -> None:
        plan = build_plan(template="pull_day", goal="hypertrophy")
        first = export_plan_note(plan)
        second = export_plan_note(plan)

        self.assertTrue(first.path.exists())
        self.assertTrue(second.path.exists())
        self.assertFalse(first.used_fallback_name)
        self.assertTrue(second.used_fallback_name)
        self.assertNotEqual(first.path, second.path)
        self.assertIn("pull_day-hypertrophy", second.path.name)
        self.assertIn("Preserved existing file", second.warning or "")

    def test_plan_export_can_write_legs_day(self) -> None:
        plan = build_plan(template="legs_day", goal="hypertrophy")
        result = export_plan_note(plan)

        content = result.path.read_text(encoding="utf-8")
        self.assertIn("# Legs Day – Hypertrophy", content)
        self.assertIn("front_squat", content)
        self.assertIn("hanging_leg_raise", content)


if __name__ == "__main__":
    unittest.main()
