from __future__ import annotations

import os
import shutil
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest import mock

import yaml
from typer.testing import CliRunner

from fitness.catalog.bootstrap import bootstrap
from fitness.catalog.cli import app as catalog_app
from fitness.catalog.agent.obsidian import load_runtime_config
from fitness.catalog.history import log_training_entry
from fitness.catalog.weekly import build_weekly_coverage, iso_week_bounds


class WeeklyReportTest(unittest.TestCase):
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

    def _seed_logs_for_current_week(self) -> tuple[str, str]:
        fixed_today = date(2026, 5, 9)
        iso_year, iso_week, _ = fixed_today.isocalendar()
        week = iso_week_bounds(iso_year, iso_week)
        day_1 = week["date_from"]
        day_2 = (date.fromisoformat(week["date_from"]) + timedelta(days=1)).isoformat()

        log_training_entry("incline_dumbbell_press", sets=3, reps=10, weight=24, rpe=8, date=day_1)
        log_training_entry("front_squat", sets=2, reps=8, weight=60, rpe=8, date=day_2)
        return week["label"], fixed_today.isoformat()

    def test_weekly_aggregation_from_sample_logs(self) -> None:
        week_label, fixed_today = self._seed_logs_for_current_week()
        with mock.patch("fitness.catalog.weekly.datetime") as mocked_datetime:
            mocked_datetime.now.return_value.date.return_value = date.fromisoformat(fixed_today)
            summary = build_weekly_coverage("current")

        self.assertEqual(summary["week"], week_label)
        self.assertEqual(summary["entries_count"], 2)
        self.assertIn("torso", summary["body_region_scores"])
        self.assertIn("lower_body", summary["body_region_scores"])
        self.assertIn("chest", summary["muscle_scores"])
        self.assertIn("legs", summary["muscle_scores"])

    def test_missing_region_detection(self) -> None:
        fixed_today = date(2026, 5, 9)
        iso_year, iso_week, _ = fixed_today.isocalendar()
        week = iso_week_bounds(iso_year, iso_week)
        day_1 = week["date_from"]
        day_2 = (date.fromisoformat(week["date_from"]) + timedelta(days=1)).isoformat()
        log_training_entry("front_squat", sets=3, reps=8, weight=60, rpe=8, date=day_1)
        log_training_entry("leg_curl", sets=2, reps=10, weight=35, rpe=8, date=day_2)
        with mock.patch("fitness.catalog.weekly.datetime") as mocked_datetime:
            mocked_datetime.now.return_value.date.return_value = fixed_today
            summary = build_weekly_coverage("current")

        self.assertIn("upper_body", summary["missing_regions"])
        self.assertIn("Add work for missing regions", summary["recommendations"][0])

    def test_report_output(self) -> None:
        week_label, _ = self._seed_logs_for_current_week()
        with mock.patch("fitness.catalog.weekly.datetime") as mocked_datetime:
            mocked_datetime.now.return_value.date.return_value = date(2026, 5, 9)
            runner = CliRunner()
            result = runner.invoke(catalog_app, ["report", "--week", "current"])

        self.assertEqual(result.exit_code, 0)
        payload = yaml.safe_load(result.stdout)
        self.assertEqual(payload["weekly_coverage"]["week"], week_label)
        self.assertIn("recommendations", payload["weekly_coverage"])

    def test_optional_markdown_export(self) -> None:
        week_label, _ = self._seed_logs_for_current_week()
        with mock.patch("fitness.catalog.weekly.datetime") as mocked_datetime:
            mocked_datetime.now.return_value.date.return_value = date(2026, 5, 9)
            runner = CliRunner()
            result = runner.invoke(catalog_app, ["report", "--week", "current", "--export", "obsidian"])

        self.assertEqual(result.exit_code, 0)
        payload = yaml.safe_load(result.stdout)
        self.assertEqual(payload["weekly_coverage"]["week"], week_label)
        export_root = Path(load_runtime_config()["obsidian"]["export_path"]).expanduser()
        export_path = export_root / "Reports" / "Weekly" / f"{week_label}.md"
        self.assertTrue(export_path.exists())
        content = export_path.read_text(encoding="utf-8")
        self.assertIn("## Recommendations", content)
        self.assertIn("## Body Region Scores", content)


if __name__ == "__main__":
    unittest.main()
