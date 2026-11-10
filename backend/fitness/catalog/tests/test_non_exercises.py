from __future__ import annotations

import unittest

from fitness.catalog.core.non_exercises import is_non_exercise, load_non_exercise_ids
from fitness.catalog.core.resolver import build_exercise_index, resolve_query
from fitness.catalog.core.source_merge import find_source_entries


class NonExerciseTest(unittest.TestCase):
    """HIIT ist eine Aktivität (Activity-Finisher), keine Exercise (Daniel, 2026-11-01)."""

    def test_registry_blocks_wger_529_by_id_only(self) -> None:
        blocked = load_non_exercise_ids()
        self.assertIn("wger_529", blocked["ids"])
        self.assertTrue(is_non_exercise({"exercise_id": "wger_529"}, blocked))
        self.assertTrue(is_non_exercise({"wger_id": 529}, blocked))
        # nie über Namen: eine echte Übung mit "HIIT" im Namen wäre nicht gesperrt
        self.assertFalse(is_non_exercise({"exercise_id": "x", "display_name": "HIIT"}, blocked))

    def test_index_has_no_hiit_entry(self) -> None:
        records = build_exercise_index()
        self.assertFalse([r for r in records if r.exercise_id == "wger_529"])
        self.assertFalse([r for r in records if r.wger_id in (529, "529")])

    def test_core_hiit_finisher_no_longer_resolves_to_hiit(self) -> None:
        result = resolve_query("Core HIIT Finisher")
        self.assertNotEqual(result.canonical_id, "wger_529")
        self.assertNotEqual(result.display_name, "HIIT")

    def test_source_lookup_skips_blocked_entries(self) -> None:
        found = find_source_entries("HIIT", "wger_529")
        wger = found.get("wger")
        self.assertTrue(wger is None or str(wger.get("wger_id")) != "529")


if __name__ == "__main__":
    unittest.main()
