from __future__ import annotations

import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fitness.catalog.bootstrap import bootstrap
from fitness.catalog.cli import main
from fitness.catalog.agent.obsidian import export_teach_note, load_runtime_config


class TeachingObsidianExportTest(unittest.TestCase):
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

    def test_file_creation_uses_obsidian_export_path(self) -> None:
        result = export_teach_note("dips_chest", mode="trainer")
        config = load_runtime_config()
        export_path = Path(config["obsidian"]["export_path"]).expanduser()

        self.assertEqual(result.path, export_path / "Anatomy" / "dips_mit_brustfokus.md")
        self.assertTrue(result.path.exists())

        content = result.path.read_text(encoding="utf-8")
        self.assertIn("## Coaching Cues", content)
        self.assertIn("## Häufige Fehler", content)
        self.assertIn("## Anatomische Erklärung", content)

    def test_no_overwrite_without_force(self) -> None:
        first = export_teach_note("dips_chest", mode="trainer")
        second = export_teach_note("dips_chest", mode="trainer")

        self.assertTrue(first.path.exists())
        self.assertTrue(second.path.exists())
        self.assertFalse(first.used_fallback_name)
        self.assertTrue(second.used_fallback_name)
        self.assertNotEqual(first.path, second.path)
        self.assertIn("Preserved existing file", second.warning or "")

    def test_cli_export_command_writes_markdown(self) -> None:
        code = main(["teach", "dips_chest", "--mode", "trainer", "--export", "obsidian"])
        self.assertEqual(code, 0)
        target = Path(load_runtime_config()["obsidian"]["export_path"]).expanduser() / "Anatomy" / "dips_mit_brustfokus.md"
        self.assertTrue(target.exists())


if __name__ == "__main__":
    unittest.main()
