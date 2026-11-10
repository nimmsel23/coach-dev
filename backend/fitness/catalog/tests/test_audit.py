from __future__ import annotations

import contextlib
import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import yaml

from fitness.catalog.core.audit import run_anatomy_audit
from fitness.catalog.bootstrap import bootstrap
from fitness.catalog.cli import main
from fitness.catalog.coverage import calculate_coverage


class AnatomyAuditTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.home = Path(self.tempdir.name)
        self.env = {
            "HOME": str(self.home),
            "FITNESS_AGENT_HOME": str(self.home / ".fitness-agent"),
        }
        self.patcher = mock.patch.dict(os.environ, self.env, clear=False)
        self.patcher.start()
        bootstrap()

    def tearDown(self) -> None:
        self.patcher.stop()
        self.tempdir.cleanup()

    def test_audit_passes_on_valid_fixture(self) -> None:
        report = run_anatomy_audit()
        self.assertEqual(report.fail_count, 0)
        self.assertGreater(report.ok_count, 0)

    def test_command_prints_usable_status(self) -> None:
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = main(["audit", "anatomy"])
        output = buffer.getvalue()
        self.assertEqual(code, 0)
        self.assertIn("Fitness Agent Anatomy Audit", output)
        self.assertIn("Status: ANATOMY_LAYER_USABLE", output)

    def test_audit_fails_when_lesson_exercise_is_missing_from_library(self) -> None:
        lesson_file = self.home / ".fitness-agent" / "anatomy_teaching" / "broken_lesson.yml"
        lesson_file.write_text(
            yaml.safe_dump(
                {
                    "lessons": [
                        {
                            "exercise_id": "not_in_library",
                            "title": "Broken",
                            "region": "chest",
                            "learning_goal": {"short": "x"},
                            "movement_pattern": {"primary": "press"},
                            "joint_actions": {"shoulder": {"concentric": ["press"]}},
                            "muscle_roles": {"prime_movers": ["chest"]},
                            "body_highlighter_regions": {"primary": ["torso"]},
                            "trainer_explanation": {"simple": "x", "client_friendly": "x"},
                            "feel_cues": ["x", "y"],
                            "coaching_cues": ["x", "y", "z"],
                            "common_errors": [
                                {
                                    "error": "x",
                                    "anatomical_reason": "x",
                                    "correction": "x",
                                    "coaching_cue": "x",
                                }
                            ],
                            "quiz": [{"question": "x", "answer": "x"}],
                        }
                    ]
                },
                sort_keys=False,
                allow_unicode=True,
            ),
            encoding="utf-8",
        )
        report = run_anatomy_audit()
        self.assertGreater(report.fail_count, 0)
        self.assertTrue(any("references unknown exercise" in line.message for line in report.lines))

    def test_audit_fails_on_duplicate_lesson_exercise_id(self) -> None:
        lesson_file = self.home / ".fitness-agent" / "anatomy_teaching" / "duplicate_lesson.yml"
        lesson_file.write_text(
            yaml.safe_dump(
                {
                    "lessons": [
                        {
                            "exercise_id": "dips_chest",
                            "title": "Dup",
                            "region": "chest",
                            "learning_goal": {"short": "x"},
                            "movement_pattern": {"primary": "press"},
                            "joint_actions": {"shoulder": {"concentric": ["press"]}},
                            "muscle_roles": {"prime_movers": ["chest"]},
                            "body_highlighter_regions": {"primary": ["torso"]},
                            "trainer_explanation": {"simple": "x", "client_friendly": "x"},
                            "feel_cues": ["x", "y"],
                            "coaching_cues": ["x", "y", "z"],
                            "common_errors": [
                                {
                                    "error": "x",
                                    "anatomical_reason": "x",
                                    "correction": "x",
                                    "coaching_cue": "x",
                                }
                            ],
                            "quiz": [{"question": "x", "answer": "x"}],
                        },
                        {
                            "exercise_id": "dips_chest",
                            "title": "Dup2",
                            "region": "chest",
                            "learning_goal": {"short": "x"},
                            "movement_pattern": {"primary": "press"},
                            "joint_actions": {"shoulder": {"concentric": ["press"]}},
                            "muscle_roles": {"prime_movers": ["chest"]},
                            "body_highlighter_regions": {"primary": ["torso"]},
                            "trainer_explanation": {"simple": "x", "client_friendly": "x"},
                            "feel_cues": ["x", "y"],
                            "coaching_cues": ["x", "y", "z"],
                            "common_errors": [
                                {
                                    "error": "x",
                                    "anatomical_reason": "x",
                                    "correction": "x",
                                    "coaching_cue": "x",
                                }
                            ],
                            "quiz": [{"question": "x", "answer": "x"}],
                        },
                    ]
                },
                sort_keys=False,
                allow_unicode=True,
            ),
            encoding="utf-8",
        )
        report = run_anatomy_audit()
        self.assertGreater(report.fail_count, 0)
        self.assertTrue(any("duplicate lesson exercise_id" in line.message for line in report.lines))

    def test_audit_warns_on_thin_optional_fields(self) -> None:
        lesson_file = self.home / ".fitness-agent" / "anatomy_teaching" / "thin_lesson.yml"
        lesson_file.write_text(
            yaml.safe_dump(
                {
                    "lessons": [
                        {
                            "exercise_id": "dips_chest",
                            "title": "Thin",
                            "region": "chest",
                            "learning_goal": {"short": "x"},
                            "movement_pattern": {"primary": "press"},
                            "joint_actions": {"shoulder": {"concentric": ["press"]}},
                            "muscle_roles": {
                                "prime_movers": ["chest"],
                                "synergists": [],
                                "stabilizers": [],
                            },
                            "body_highlighter_regions": {"primary": ["torso"]},
                            "trainer_explanation": {"simple": "x", "client_friendly": "x"},
                            "feel_cues": ["x"],
                            "coaching_cues": ["x", "y"],
                            "common_errors": [],
                        }
                    ]
                },
                sort_keys=False,
                allow_unicode=True,
            ),
            encoding="utf-8",
        )
        report = run_anatomy_audit()
        self.assertTrue(any("has only 1 feel cue" in line.message for line in report.lines))
        self.assertTrue(any("has only 2 coaching cue" in line.message for line in report.lines))
        self.assertTrue(any("has no common errors" in line.message for line in report.lines))

    def test_audit_fails_on_unknown_body_highlighter_region(self) -> None:
        lesson_file = self.home / ".fitness-agent" / "anatomy_teaching" / "bad_region.yml"
        lesson_file.write_text(
            yaml.safe_dump(
                {
                    "lessons": [
                        {
                            "exercise_id": "dips_chest",
                            "title": "Bad Region",
                            "region": "chest",
                            "learning_goal": {"short": "x"},
                            "movement_pattern": {"primary": "press"},
                            "joint_actions": {"shoulder": {"concentric": ["press"]}},
                            "muscle_roles": {"prime_movers": ["chest"]},
                            "body_highlighter_regions": {"primary": ["thigh_front_left"]},
                            "trainer_explanation": {"simple": "x", "client_friendly": "x"},
                            "feel_cues": ["x", "y"],
                            "coaching_cues": ["x", "y", "z"],
                            "common_errors": [
                                {
                                    "error": "x",
                                    "anatomical_reason": "x",
                                    "correction": "x",
                                    "coaching_cue": "x",
                                }
                            ],
                            "quiz": [{"question": "x", "answer": "x"}],
                        }
                    ]
                },
                sort_keys=False,
                allow_unicode=True,
            ),
            encoding="utf-8",
        )
        report = run_anatomy_audit()
        self.assertGreater(report.fail_count, 0)
        self.assertTrue(any("unknown body region" in line.message for line in report.lines))

    def test_audit_respects_catalog_home(self) -> None:
        self.assertEqual(Path(self.env["FITNESS_AGENT_HOME"]), self.home / ".fitness-agent")
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = main(["audit", "anatomy"])
        self.assertEqual(code, 0)


class CoverageAuditTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.home = Path(self.tempdir.name)
        self.env = {"HOME": str(self.home), "FITNESS_AGENT_HOME": str(self.home / ".fitness-agent")}
        self.patcher = mock.patch.dict(
            os.environ,
            self.env,
            clear=False,
        )
        self.patcher.start()
        bootstrap()

    def tearDown(self) -> None:
        self.patcher.stop()
        self.tempdir.cleanup()

    def test_audit_passes_on_valid_fixture(self) -> None:
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = main(["audit", "coverage"])
        output = buffer.getvalue()
        self.assertEqual(code, 0)
        self.assertIn("Fitness Agent Coverage Audit", output)
        self.assertIn("Status: COVERAGE_LAYER_USABLE", output)

    def test_audit_fails_when_muscle_missing_from_taxonomy(self) -> None:
        exercise_file = self.home / ".fitness-agent" / "exercises" / "broken.yml"
        exercise_file.write_text(
            yaml.safe_dump(
                {
                    "name": "broken",
                    "exercises": [
                        {
                            "exercise_id": "broken_push",
                            "display_name": "Broken Push",
                            "primary_muscles": ["mystery_muscle"],
                        }
                    ],
                },
                sort_keys=False,
                allow_unicode=True,
            ),
            encoding="utf-8",
        )
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = main(["audit", "coverage"])
        output = buffer.getvalue()
        self.assertEqual(code, 1)
        self.assertIn("unknown primary muscle", output)

    def test_audit_reports_zero_coverage(self) -> None:
        exercise_file = self.home / ".fitness-agent" / "exercises" / "zero.yml"
        exercise_file.write_text(
            yaml.safe_dump(
                {
                    "name": "zero",
                    "exercises": [
                        {
                            "exercise_id": "zero_push",
                            "display_name": "Zero Push",
                            "primary_muscles": [],
                            "secondary_muscles": [],
                            "stabilizers": [],
                        }
                    ],
                },
                sort_keys=False,
                allow_unicode=True,
            ),
            encoding="utf-8",
        )
        result = calculate_coverage("incline_dumbbell_press", 1, 8)
        self.assertGreater(sum(result["muscle_scores"].values()), 0)
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = main(["audit", "coverage"])
        output = buffer.getvalue()
        self.assertEqual(code, 0)
        self.assertIn("zero coverage exercises", output)


class AliasesAuditTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.home = Path(self.tempdir.name)
        self.env = {"HOME": str(self.home), "FITNESS_AGENT_HOME": str(self.home / ".fitness-agent")}
        self.patcher = mock.patch.dict(
            os.environ,
            self.env,
            clear=False,
        )
        self.patcher.start()
        bootstrap()

    def tearDown(self) -> None:
        self.patcher.stop()
        self.tempdir.cleanup()

    def test_audit_passes_on_valid_fixture(self) -> None:
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = main(["audit", "aliases"])
        output = buffer.getvalue()
        self.assertEqual(code, 0)
        self.assertIn("Fitness Agent Aliases Audit", output)
        self.assertIn("Status: ALIASES_LAYER_USABLE", output)

    def test_audit_fails_when_alias_points_to_missing_id(self) -> None:
        aliases_file = self.home / ".fitness-agent" / "maps" / "aliases.yml"
        aliases_file.write_text(
            yaml.safe_dump(
                {
                    "aliases": {
                        "broken alias": "missing_exercise",
                    }
                },
                sort_keys=False,
                allow_unicode=True,
            ),
            encoding="utf-8",
        )
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = main(["audit", "aliases"])
        output = buffer.getvalue()
        self.assertEqual(code, 1)
        self.assertIn("points to missing exercise_id", output)

    def test_audit_fails_on_duplicate_alias_after_normalization(self) -> None:
        aliases_file = self.home / ".fitness-agent" / "maps" / "aliases.yml"
        aliases_file.write_text(
            yaml.safe_dump(
                {
                    "aliases": {
                        "Face Pull": "face_pull",
                        "face pull": "rear_delt_fly",
                    }
                },
                sort_keys=False,
                allow_unicode=True,
            ),
            encoding="utf-8",
        )
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = main(["audit", "aliases"])
        output = buffer.getvalue()
        self.assertEqual(code, 1)
        self.assertIn("duplicate aliases after normalization", output)
        self.assertIn("suspicious aliases normalize to same string but map to different IDs", output)

    def test_audit_warns_on_exercises_without_alias(self) -> None:
        aliases_file = self.home / ".fitness-agent" / "maps" / "aliases.yml"
        aliases_file.write_text(
            yaml.safe_dump(
                {
                    "aliases": {
                        "kh schrägbank": "incline_dumbbell_press",
                    }
                },
                sort_keys=False,
                allow_unicode=True,
            ),
            encoding="utf-8",
        )
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = main(["audit", "aliases"])
        output = buffer.getvalue()
        self.assertEqual(code, 0)
        self.assertIn("exercise ids without any alias", output)

    def test_command_respects_catalog_home(self) -> None:
        self.assertEqual(Path(self.home / ".fitness-agent"), Path(self.env["FITNESS_AGENT_HOME"]))
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = main(["audit", "aliases"])
        self.assertIn(code, {0, 1})


if __name__ == "__main__":
    unittest.main()
