from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fitness.catalog.agent.inbox_actions import write_inbox_tombstone
from fitness.catalog.api.watcher import process_inbox_file


class WatcherTombstoneTest(unittest.TestCase):
    def test_runtime_json_is_removed_without_draft_when_tombstoned(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            kb = root / "kb"
            inbox = kb / "inbox"
            runtime_inbox = root / "runtime" / "users" / "u1" / "inbox"
            inbox.mkdir(parents=True)
            runtime_inbox.mkdir(parents=True)

            runtime_file = runtime_inbox / "abc_Stehende Bizepsdehnung.json"
            runtime_file.write_text(json.dumps({"name": "Stehende Bizepsdehnung"}), encoding="utf-8")

            with mock.patch("fitness.catalog.agent.inbox_actions.DATA_DIR", kb):
                write_inbox_tombstone(
                    "inbox_stehende_bizepsdehnung",
                    {"exercise_id": "stehende_bizepsdehnung", "display_name": "Stehende Bizepsdehnung"},
                )

            with (
                mock.patch("fitness.catalog.api.watcher.DATA_DIR", kb),
                mock.patch("fitness.catalog.agent.inbox_actions.DATA_DIR", kb),
                mock.patch("fitness.catalog.api.watcher.call_gemini") as call_gemini,
            ):
                process_inbox_file(runtime_file, api_key=None)

            call_gemini.assert_not_called()
            self.assertFalse(runtime_file.exists())
            self.assertFalse((inbox / "inbox_stehende_bizepsdehnung.yml").exists())


if __name__ == "__main__":
    unittest.main()
