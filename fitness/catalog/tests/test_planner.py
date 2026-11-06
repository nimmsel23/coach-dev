from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fitness.catalog.bootstrap import bootstrap
from fitness.catalog.planner import build_plan


class PlannerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.home = Path(self.tempdir.name)
        self.patcher = mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False)
        self.patcher.start()
        bootstrap()

    def tearDown(self) -> None:
        self.patcher.stop()
        self.tempdir.cleanup()

    def test_push_day_plan_selects_existing_exercise_and_summarizes_coverage(self) -> None:
        result = build_plan(template="push_day", goal="hypertrophy")

        self.assertEqual(result.template, "push_day")
        self.assertEqual(result.goal, "hypertrophy")
        self.assertEqual(len(result.slots), 5)
        self.assertEqual(result.slots[0]["selected_exercise"], "incline_dumbbell_press")
        self.assertEqual(
            [slot["selected_exercise"] for slot in result.slots],
            [
                "incline_dumbbell_press",
                "close_grip_bench_press",
                "overhead_press",
                "cable_fly",
                "cable_pushdown",
            ],
        )
        self.assertEqual(result.coverage_summary["sets"], 1)
        self.assertEqual(result.coverage_summary["rpe"], 8)
        self.assertIn("chest", result.coverage_summary["muscle_scores"])
        self.assertEqual(len(result.coverage_summary["selected_exercises"]), 5)

    def test_pull_day_plan_selects_existing_exercise_and_summarizes_coverage(self) -> None:
        result = build_plan(template="pull_day", goal="hypertrophy")

        self.assertEqual(result.template, "pull_day")
        self.assertEqual(result.goal, "hypertrophy")
        self.assertEqual(len(result.slots), 5)
        self.assertEqual(
            [slot["selected_exercise"] for slot in result.slots],
            [
                "pull_up",
                "barbell_row",
                "lat_pulldown",
                "face_pull",
                "barbell_curl",
            ],
        )
        self.assertEqual(result.coverage_summary["sets"], 1)
        self.assertEqual(result.coverage_summary["rpe"], 8)
        self.assertIn("back", result.coverage_summary["muscle_scores"])
        self.assertEqual(len(result.coverage_summary["selected_exercises"]), 5)

    def test_legs_day_plan_selects_existing_exercise_and_summarizes_coverage(self) -> None:
        result = build_plan(template="legs_day", goal="hypertrophy")

        self.assertEqual(result.template, "legs_day")
        self.assertEqual(result.goal, "hypertrophy")
        self.assertEqual(len(result.slots), 6)
        self.assertEqual(
            [slot["selected_exercise"] for slot in result.slots],
            [
                "front_squat",
                "romanian_deadlift",
                "bulgarian_split_squat",
                "leg_curl",
                "calf_raise",
                "hanging_leg_raise",
            ],
        )
        self.assertEqual(result.coverage_summary["sets"], 1)
        self.assertEqual(result.coverage_summary["rpe"], 8)
        self.assertIn("legs", result.coverage_summary["muscle_scores"])
        self.assertEqual(len(result.coverage_summary["selected_exercises"]), 6)


if __name__ == "__main__":
    unittest.main()
