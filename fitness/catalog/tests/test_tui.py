from __future__ import annotations

import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from typer.testing import CliRunner

from fitness.catalog.bootstrap import bootstrap
from fitness.catalog.cli import app as catalog_app
from fitness.catalog.history import read_history
from fitness.catalog.agent.obsidian import load_runtime_config
from fitness.catalog.app_tui import (
    TuiState,
    browser_selected_record,
    build_screen_model,
    handle_export_action,
    handle_preview_action,
    handle_log_action,
    previous_screen,
    render_screen_model,
    move_browser_selection,
)


class TuiTest(unittest.TestCase):
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

    def test_parser_exposes_tui_command(self) -> None:
        runner = CliRunner()
        with mock.patch("fitness.catalog.cli.run_tui") as run_tui_mock:
            result = runner.invoke(catalog_app, ["tui"])
        self.assertEqual(result.exit_code, 0)
        run_tui_mock.assert_called_once_with(initial_screen="dashboard")

    def test_browser_screen_resolves_alias(self) -> None:
        state = TuiState(active_screen="browser", browser_query="kh schrägbank")
        model = build_screen_model("browser", state)
        output = render_screen_model(model)

        self.assertIn("Exercise Browser", output)
        self.assertIn("incline_dumbbell_press", output)
        self.assertIn("Schrägbankdrücken mit Kurzhanteln", output)
        self.assertIn("## Main Actions", output)

    def test_browser_selection_moves_within_results(self) -> None:
        state = TuiState(active_screen="browser", browser_query="pull")
        first = browser_selected_record(state)
        move_browser_selection(state, 1)
        second = browser_selected_record(state)

        self.assertIsNotNone(first)
        self.assertIsNotNone(second)
        if first is not None and second is not None:
            self.assertNotEqual(first.exercise_id, second.exercise_id)

    def test_plan_screen_contains_coverage_summary(self) -> None:
        state = TuiState(active_screen="plan", plan_template="push_day", plan_goal="hypertrophy")
        model = build_screen_model("plan", state)
        output = render_screen_model(model)

        self.assertIn("Plan Builder", output)
        self.assertIn("Coverage Summary", output)
        self.assertIn("Selected exercises:", output)

    def test_body_highlighter_screen_contains_bars(self) -> None:
        state = TuiState(active_screen="highlighter", browser_query="dips_chest")
        model = build_screen_model("highlighter", state)
        output = render_screen_model(model)

        self.assertIn("Body Highlighter", output)
        self.assertIn("Body Regions", output)
        self.assertIn("[", output)

    def test_highlighter_returns_to_browser_via_previous_navigation(self) -> None:
        self.assertEqual(previous_screen("highlighter"), "browser")

    def test_coach_screen_handles_missing_lesson(self) -> None:
        state = TuiState(active_screen="coach", coach_exercise="lat_pulldown")
        model = build_screen_model("coach", state)
        output = render_screen_model(model)

        self.assertIn("Coach Sheet", output)
        self.assertIn("Keine Anatomy-Lesson vorhanden", output)

    def test_coach_export_action_writes_obsidian_file(self) -> None:
        state = TuiState(active_screen="coach", coach_exercise="dips_chest")
        result = handle_export_action(state)

        self.assertIn("Exported coach sheet", result.message)
        export_path = Path(load_runtime_config()["obsidian"]["export_path"]).expanduser()
        target = export_path / "Coach Sheets" / "dips_mit_brustfokus.md"
        self.assertTrue(target.exists())

    def test_preview_action_opens_dedicated_preview_screen(self) -> None:
        state = TuiState(active_screen="coach", coach_exercise="dips_chest")

        result = handle_preview_action(mock.Mock(), state)

        self.assertEqual(state.active_screen, "preview")
        self.assertEqual(state.preview_source_screen, "coach")
        self.assertIn("Preview opened for Coach Sheet", result.message)

    def test_preview_screen_launches_glow_from_dedicated_flow(self) -> None:
        state = TuiState(active_screen="preview", preview_source_screen="coach")
        stdscr = mock.Mock()

        with mock.patch("fitness.catalog.app_tui.shutil.which", return_value="/usr/bin/glow"):
            with mock.patch("fitness.catalog.app_tui.curses.def_prog_mode") as def_mock:
                with mock.patch("fitness.catalog.app_tui.curses.endwin") as end_mock:
                    with mock.patch("fitness.catalog.app_tui.curses.reset_prog_mode") as reset_mock:
                        with mock.patch("fitness.catalog.app_tui.preview_file") as preview_mock:
                            preview_mock.return_value.used_glow = True
                            preview_mock.return_value.message = "Previewed sample.md with glow."
                            result = handle_preview_action(stdscr, state)

        self.assertIn("Source preview stays on Coach Sheet", result.message)
        self.assertTrue(result.message.startswith("Previewed"))
        def_mock.assert_called_once()
        end_mock.assert_called_once()
        reset_mock.assert_called_once()
        preview_mock.assert_called_once()

    def test_preview_screen_handles_missing_glow_gracefully(self) -> None:
        state = TuiState(active_screen="preview", preview_source_screen="coach")

        with mock.patch("fitness.catalog.app_tui.shutil.which", return_value=None):
            result = handle_preview_action(mock.Mock(), state)

        self.assertIn("glow is not installed", result.message)

    def test_log_action_writes_history(self) -> None:
        state = TuiState(
            active_screen="log",
            log_exercise="incline_dumbbell_press",
            log_sets=3,
            log_reps=10,
            log_weight=24,
            log_rpe=8,
            log_workout_id="workout-tui",
        )
        result = handle_log_action(state)

        self.assertIn("Logged 041", result.message)
        entries = read_history("incline_dumbbell_press")
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["workout_id"], "workout-tui")


if __name__ == "__main__":
    unittest.main()
