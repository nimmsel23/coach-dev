from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fitness.catalog.bootstrap import bootstrap
from fitness.catalog.core.resolver import resolve_query


class ResolverTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.home = Path(self.tempdir.name)
        self.home.mkdir(parents=True, exist_ok=True)
        self.patcher = mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False)
        self.patcher.start()
        bootstrap()

    def tearDown(self) -> None:
        self.patcher.stop()
        self.tempdir.cleanup()

    def test_incline_dumbbell_press_source_id_prefers_expert_record(self) -> None:
        result = resolve_query("incline_dumbbell_press")
        self.assertTrue(result.matched)
        self.assertEqual(result.canonical_id, "041")
        self.assertEqual(result.source, "name")
        self.assertEqual(result.confidence, "high")

    def test_alias_match(self) -> None:
        result = resolve_query("Schrägbankdrücken Kurzhantel")
        self.assertTrue(result.matched)
        self.assertEqual(result.canonical_id, "041")
        self.assertEqual(result.source, "name")
        self.assertEqual(result.confidence, "high")

    def test_german_name_match(self) -> None:
        result = resolve_query("Klimmzug im Obergriff")
        self.assertTrue(result.matched)
        self.assertEqual(result.canonical_id, "020")
        self.assertEqual(result.source, "name")
        self.assertEqual(result.confidence, "high")

    def test_pull_up_alias_prefers_expert_record(self) -> None:
        result = resolve_query("Pull-Up")
        self.assertTrue(result.matched)
        self.assertEqual(result.canonical_id, "020")
        self.assertEqual(result.source, "name")
        self.assertEqual(result.confidence, "high")

    def test_yuhonas_generic_pullups_name_prefers_expert_record(self) -> None:
        result = resolve_query("Pullups")
        self.assertTrue(result.matched)
        self.assertEqual(result.canonical_id, "020")
        self.assertEqual(result.source, "name")
        self.assertEqual(result.confidence, "high")

    def test_wger_pull_up_name_prefers_expert_record(self) -> None:
        result = resolve_query("Klimmzug an Leiste")
        self.assertTrue(result.matched)
        self.assertEqual(result.canonical_id, "020")
        self.assertEqual(result.source, "name")
        self.assertEqual(result.confidence, "high")

    def test_chin_up_external_names_prefer_expert_record(self) -> None:
        for query in ["Klimmzug im Untergriff", "Chin-Up", "chin_up", "yuhonas_chin-up", "wger_152"]:
            result = resolve_query(query)
            self.assertTrue(result.matched)
            self.assertEqual(result.canonical_id, "021")
            self.assertEqual(result.confidence, "high")

    def test_unknown_curl_query_does_not_fuzzy_match_barbell_curl(self) -> None:
        result = resolve_query("totally unknown curl")
        self.assertFalse(result.matched)

    def test_jefferson_curl_is_expert_record(self) -> None:
        from fitness.catalog.core.resolver import build_exercise_index

        record = next(r for r in build_exercise_index() if r.exercise_id == "jefferson_curl")
        self.assertEqual(record.source, "expert")

    def test_front_squat_external_names_prefer_expert_record(self) -> None:
        for query in ["Front Squat", "Front Kniebeuge", "front_squat", "wger_257"]:
            result = resolve_query(query)
            self.assertTrue(result.matched)
            self.assertEqual(result.canonical_id, "061")
            self.assertEqual(result.confidence, "high")

    def test_deadlift_external_names_prefer_expert_record(self) -> None:
        for query in ["Kreuzheben", "Deadlift", "deadlift", "wger_184"]:
            result = resolve_query(query)
            self.assertTrue(result.matched)
            self.assertEqual(result.canonical_id, "080")
            self.assertEqual(result.confidence, "high")

    def test_rdl_external_names_prefer_expert_record(self) -> None:
        for query in ["Rumänisches Kreuzheben", "Romanian Deadlift", "RDL", "rdl", "wger_507"]:
            result = resolve_query(query)
            self.assertTrue(result.matched)
            self.assertEqual(result.canonical_id, "081")
            self.assertEqual(result.confidence, "high")

    def test_leg_extension_external_names_prefer_expert_record(self) -> None:
        for query in ["Beinstrecken", "Beinstrecker", "leg_extension", "wger_851", "Leg_Extensions"]:
            result = resolve_query(query)
            self.assertTrue(result.matched)
            self.assertEqual(result.canonical_id, "401")
            self.assertEqual(result.confidence, "high")

    def test_leg_curl_external_names_prefer_expert_record(self) -> None:
        for query in ["Beinbeuger", "Leg Curl", "leg_curl", "wger_364"]:
            result = resolve_query(query)
            self.assertTrue(result.matched)
            self.assertEqual(result.canonical_id, "402")
            self.assertEqual(result.confidence, "high")

    def test_machine_lateral_raise_wger_name_prefers_expert_record(self) -> None:
        for query in ["Seitheben an der Maschine", "Machine Side Lateral Raises", "wger_1570"]:
            result = resolve_query(query)
            self.assertTrue(result.matched)
            self.assertEqual(result.canonical_id, "lateral_raise_machine")
            self.assertEqual(result.confidence, "high")

    def test_cable_lateral_raise_wger_name_prefers_expert_record(self) -> None:
        for query in ["Seitheben am Seilzug", "Side Lateral Raise (Cable)", "wger_1556"]:
            result = resolve_query(query)
            self.assertTrue(result.matched)
            self.assertEqual(result.canonical_id, "cable_lateral_raise")
            self.assertEqual(result.confidence, "high")

    def test_unknown_returns_suggestions(self) -> None:
        result = resolve_query("irgendwas unbekanntes")
        self.assertFalse(result.matched)
        self.assertEqual(result.canonical_id, None)
        self.assertGreater(len(result.suggestions), 0)


if __name__ == "__main__":
    unittest.main()
