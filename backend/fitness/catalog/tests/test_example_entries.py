from __future__ import annotations

import unittest
from pathlib import Path

import yaml

from fitness.catalog.core.loader import catalog_path
from fitness.catalog.core.resolver import build_exercise_index, find_by_id, resolve_query

EXAMPLE_IDS = ["back_squat", "machine_chest_press", "incline_chest_press_machine", "samurai_extension"]

# Namen so, wie sie in echten Sessions stehen -> erwartete Kanon-ID
SESSION_NAMES = {
    "Back Squat": "back_squat",
    "Brustmaschine": "machine_chest_press",
    "Schrägbrustpresse (Maschine)": "incline_chest_press_machine",
    "Samurai Extension": "samurai_extension",
}


def _muscle_ids() -> set[str]:
    root = catalog_path("muscles")
    return {p.stem for p in Path(root).rglob("*.yml") if p.stem[:1].isdigit()}


class ExampleEntriesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.records = build_exercise_index()

    def test_session_names_resolve_to_the_examples(self) -> None:
        for name, expected in SESSION_NAMES.items():
            with self.subTest(name=name):
                result = resolve_query(name, self.records)
                self.assertTrue(result.matched)
                self.assertEqual(result.canonical_id, expected)
                self.assertEqual(result.confidence, "high")

    def test_legacy_session_ids_resolve(self) -> None:
        self.assertEqual(find_by_id("inbox_back_squat", self.records).exercise_id, "back_squat")
        self.assertEqual(find_by_id("manual_samurai_extension", self.records).exercise_id, "samurai_extension")

    def test_examples_are_never_expert(self) -> None:
        for ex_id in EXAMPLE_IDS:
            with self.subTest(ex_id=ex_id):
                record = find_by_id(ex_id, self.records)
                self.assertEqual(record.source, "inbox")
                self.assertNotIn("expert", record.tags or [])

    def test_schema_rules(self) -> None:
        valid = _muscle_ids()
        for ex_id in EXAMPLE_IDS:
            record = find_by_id(ex_id, self.records)
            with self.subTest(ex_id=ex_id):
                roles = [record.primary_muscles or [], record.secondary_muscles or [], record.stabilizers or []]
                flat = [m for role in roles for m in role]
                self.assertTrue(record.primary_muscles)
                self.assertEqual(len(flat), len(set(flat)), "Muskel in mehreren Rollen")
                self.assertTrue(set(flat) <= valid, set(flat) - valid)
                self.assertLessEqual(len(record.stabilizers or []), 3)
                self.assertTrue(record.german and record.english)

    def test_examples_file_state_is_draft(self) -> None:
        for ex_id in EXAMPLE_IDS:
            path = catalog_path(f"inbox/inbox_{ex_id}.yml")
            entry = yaml.safe_load(path.read_text(encoding="utf-8"))["exercises"][0]
            self.assertEqual(entry["review_state"]["status"], "draft")
            self.assertEqual(entry["source"], "unreviewed")
            self.assertIn("NICHT von Daniel geprüft", entry["draft_note"])


if __name__ == "__main__":
    unittest.main()
