from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

import yaml

from fitness.catalog.agent.inbox_actions import (
    approve_inbox_entry,
    delete_inbox_entry,
    is_inbox_tombstoned,
    list_inbox_tombstones,
    reenrich_inbox_entry,
    restore_inbox_tombstone,
)
from fitness.api.routers.exercises_inbox import _link_source


class InboxActionsTest(unittest.TestCase):
    def test_approve_preserves_wger_source_ref_from_filename(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            inbox = root / "inbox"
            exercises = root / "exercises"
            inbox.mkdir()
            exercises.mkdir()
            draft = inbox / "inbox_wger_1570.yml"
            draft.write_text("name: inbox_wger_1570\nexercises: []\n", encoding="utf-8")
            ex = {
                "exercise_id": "lateral_raise_machine",
                "display_name": "Seitheben an der Maschine",
                "primary_muscles": ["302_lateral_deltoid"],
            }

            with mock.patch("fitness.catalog.agent.inbox_actions.exercises_dir", return_value=exercises):
                approved_id = approve_inbox_entry(draft, ex)

            self.assertEqual(approved_id, "lateral_raise_machine")
            self.assertFalse(draft.exists())
            doc = yaml.safe_load((exercises / "lateral_raise_machine.yml").read_text(encoding="utf-8"))
            approved = doc["exercises"][0]
            self.assertEqual(approved["source"], "expert")
            self.assertEqual(approved["wger_id"], 1570)
            self.assertEqual(approved["external_ids"]["wger"], [1570])
            self.assertIn("wger_1570", approved["search_aliases"])

    def test_approve_preserves_yuhonas_source_ref(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            inbox = root / "inbox"
            exercises = root / "exercises"
            inbox.mkdir()
            exercises.mkdir()
            draft = inbox / "inbox_yuhonas_pullups.yml"
            draft.write_text("name: inbox_yuhonas_pullups\nexercises: []\n", encoding="utf-8")
            ex = {
                "exercise_id": "020",
                "display_name": "Klimmzug im Obergriff",
                "yuhonas_id": "Pullups",
                "primary_muscles": ["201_latissimus_dorsi"],
            }

            with mock.patch("fitness.catalog.agent.inbox_actions.exercises_dir", return_value=exercises):
                approve_inbox_entry(draft, ex)

            doc = yaml.safe_load((exercises / "020.yml").read_text(encoding="utf-8"))
            approved = doc["exercises"][0]
            self.assertEqual(approved["external_ids"]["yuhonas"], ["Pullups"])
            self.assertIn("yuhonas_pullups", approved["search_aliases"])
            self.assertIn("Pullups", approved["search_aliases"])

    def test_delete_writes_tombstone(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            inbox = root / "inbox"
            registry = root / "registry"
            inbox.mkdir()
            registry.mkdir()
            draft = inbox / "inbox_wger_1257.yml"
            draft.write_text("name: inbox_wger_1257\nexercises: []\n", encoding="utf-8")
            ex = {
                "exercise_id": "wger_1257",
                "display_name": "Stehende Bizepsdehnung",
            }

            with mock.patch("fitness.catalog.agent.inbox_actions.DATA_DIR", root):
                delete_inbox_entry(draft, ex)
                self.assertTrue(is_inbox_tombstoned("inbox_wger_1257", ex))
                self.assertTrue(is_inbox_tombstoned("wger_1257", ex))

            self.assertFalse(draft.exists())
            self.assertTrue((registry / "inbox_tombstones.yml").exists())

    def test_restore_tombstone_recreates_inbox_draft_from_unreviewed_source(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            inbox = root / "inbox"
            exercises = root / "exercises"
            registry = root / "registry"
            inbox.mkdir()
            exercises.mkdir()
            registry.mkdir()
            (exercises / "unreviewed_wger.yml").write_text(
                yaml.dump({
                    "exercises": [{
                        "exercise_id": "wger_206",
                        "display_name": "Ausfallschritte im Gehen",
                        "primary_muscles": ["601_quadriceps_femoris"],
                        "wger_id": 206,
                    }]
                }, allow_unicode=True),
                encoding="utf-8",
            )
            (registry / "inbox_tombstones.yml").write_text(
                yaml.dump({
                    "version": 1,
                    "tombstones": [{
                        "id": "inbox_wger_206",
                        "exercise_id": "wger_206",
                        "display_name": "Ausfallschritte im Gehen",
                        "reason": "deleted_inbox",
                        "keys": ["inbox_wger_206", "wger_206", "wger:206"],
                    }],
                }, allow_unicode=True),
                encoding="utf-8",
            )

            with mock.patch("fitness.catalog.agent.inbox_actions.DATA_DIR", root):
                restored = restore_inbox_tombstone("inbox_wger_206")
                self.assertEqual(restored, inbox / "inbox_wger_206.yml")
                self.assertEqual(list_inbox_tombstones(), [])

            doc = yaml.safe_load((inbox / "inbox_wger_206.yml").read_text(encoding="utf-8"))
            ex = doc["exercises"][0]
            self.assertEqual(ex["exercise_id"], "wger_206")
            self.assertEqual(ex["source"], "unreviewed")
            self.assertEqual(doc["graveyard_entry"]["id"], "inbox_wger_206")

    def test_reenrich_uses_codex_review_when_haiku_unavailable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            draft = Path(tmp) / "inbox_wger_206.yml"
            draft.write_text(
                yaml.dump({
                    "name": "inbox_wger_206",
                    "exercises": [{
                        "exercise_id": "wger_206",
                        "display_name": "Ausfallschritte im Gehen",
                    }],
                }, allow_unicode=True),
                encoding="utf-8",
            )
            ex = {
                "exercise_id": "wger_206",
                "display_name": "Ausfallschritte im Gehen",
            }
            gemini_result = {
                "exercise_id": "wger_206",
                "display_name": "Ausfallschritte im Gehen",
                "primary_muscles": ["quadriceps"],
            }
            codex_result = {
                "exercise_id": "wger_206",
                "display_name": "Ausfallschritte im Gehen",
                "primary_muscles": ["601_quadriceps_femoris"],
            }

            with (
                mock.patch("fitness.catalog.agent.inbox_actions.load_gemini_key", return_value="key"),
                mock.patch("fitness.catalog.agent.inbox_actions.call_enrichment", return_value=gemini_result),
                mock.patch("fitness.catalog.agent.inbox_actions.review_with_haiku", return_value=None),
                mock.patch("fitness.catalog.agent.inbox_actions.review_with_codex", return_value=codex_result),
            ):
                result = reenrich_inbox_entry(draft, ex, "Ausfallschritte im Gehen")

            self.assertEqual(result["review_provider"], "codex")
            self.assertFalse(result["haiku_applied"])
            doc = yaml.safe_load(draft.read_text(encoding="utf-8"))
            restored = doc["exercises"][0]
            self.assertEqual(restored["primary_muscles"], ["601_quadriceps_femoris"])
            self.assertEqual(restored["source"], "unreviewed")

    def test_link_source_adds_second_external_reference(self) -> None:
        ex = {
            "exercise_id": "wger_206",
            "display_name": "Ausfallschritte im Gehen",
            "wger_id": 206,
            "external_ids": {"wger": [206]},
            "origin": {
                "type": "external",
                "source_refs": {"wger": ["206"]},
                "wger": {"wger_id": 206, "display_name": "Walking Lunges"},
            },
        }
        yuhonas_entry = {
            "exercise_id": "yuhonas_walking_lunges",
            "yuhonas_id": "Walking_Lunges",
            "display_name": "Walking Lunges",
            "instructions": ["Step forward into a lunge."],
        }

        linked = _link_source(ex, "yuhonas", yuhonas_entry)

        self.assertEqual(linked["wger_id"], 206)
        self.assertEqual(linked["yuhonas_id"], "Walking_Lunges")
        self.assertEqual(linked["external_ids"]["wger"], [206])
        self.assertEqual(linked["external_ids"]["yuhonas"], ["Walking_Lunges"])
        self.assertEqual(linked["origin"]["source_refs"]["wger"], ["206"])
        self.assertEqual(linked["origin"]["source_refs"]["yuhonas"], ["Walking_Lunges"])
        self.assertEqual(linked["origin"]["yuhonas"], yuhonas_entry)

    def test_reenrich_normalizes_coarse_shoulder_label_by_name(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            draft = Path(tmp) / "inbox_frontheben.yml"
            draft.write_text(
                yaml.dump({
                    "name": "inbox_frontheben",
                    "exercises": [{
                        "exercise_id": "frontheben",
                        "display_name": "Frontheben",
                    }],
                }, allow_unicode=True),
                encoding="utf-8",
            )
            ex = {
                "exercise_id": "frontheben",
                "display_name": "Frontheben",
            }
            gemini_result = {
                "exercise_id": "frontheben",
                "display_name": "Frontheben",
                "primary_muscles": ["shoulders"],
            }

            with (
                mock.patch("fitness.catalog.agent.inbox_actions.load_gemini_key", return_value="key"),
                mock.patch("fitness.catalog.agent.inbox_actions.call_enrichment", return_value=gemini_result),
            ):
                reenrich_inbox_entry(draft, ex, "Frontheben", use_haiku_review=False)

            doc = yaml.safe_load(draft.read_text(encoding="utf-8"))
            restored = doc["exercises"][0]
            self.assertEqual(restored["primary_muscles"], ["301_anterior_deltoid"])

    def test_approve_normalizes_coarse_shoulder_label_by_name(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            inbox = root / "inbox"
            exercises = root / "exercises"
            inbox.mkdir()
            exercises.mkdir()
            draft = inbox / "inbox_frontheben.yml"
            draft.write_text("name: inbox_frontheben\nexercises: []\n", encoding="utf-8")
            ex = {
                "exercise_id": "frontheben",
                "display_name": "Frontheben",
                "primary_muscles": ["shoulders"],
            }

            with mock.patch("fitness.catalog.agent.inbox_actions.exercises_dir", return_value=exercises):
                approved_id = approve_inbox_entry(draft, ex)

            self.assertEqual(approved_id, "frontheben")
            doc = yaml.safe_load((exercises / "frontheben.yml").read_text(encoding="utf-8"))
            approved = doc["exercises"][0]
            self.assertEqual(approved["primary_muscles"], ["301_anterior_deltoid"])


if __name__ == "__main__":
    unittest.main()
