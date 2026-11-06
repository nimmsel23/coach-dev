from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

import yaml

from fitness.catalog.core.source_merge import build_external_seed


class SourceMergeTest(unittest.TestCase):
    def test_build_external_seed_merges_wger_and_yuhonas(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            exercises = root / "exercises"
            exercises.mkdir()
            (exercises / "unreviewed_wger.yml").write_text(
                yaml.dump({
                    "exercises": [{
                        "exercise_id": "wger_206",
                        "display_name": "Ausfallschritte im Gehen",
                        "german": "Ausfallschritte im Gehen",
                        "wger_id": 206,
                        "primary_muscles": ["601_quadriceps_femoris"],
                        "wger_muscle_ids": {"primary": [10]},
                    }]
                }, allow_unicode=True),
                encoding="utf-8",
            )
            (exercises / "unreviewed_yuhonas.yml").write_text(
                yaml.dump({
                    "exercises": [{
                        "exercise_id": "yuhonas_walking_lunges",
                        "display_name": "Walking Lunges",
                        "english": "Walking Lunges",
                        "yuhonas_id": "Walking Lunges",
                        "instructions": ["Step forward"],
                        "images": ["a.jpg"],
                        "secondary_muscles": ["603_gluteus_maximus"],
                    }]
                }, allow_unicode=True),
                encoding="utf-8",
            )

            with mock.patch("fitness.catalog.core.source_merge.load_catalog_yaml", side_effect=lambda rel: yaml.safe_load((root / rel).read_text())):
                seed = build_external_seed("Walking Lunges", "wger_206")

            self.assertIsNotNone(seed)
            self.assertEqual(seed["wger_id"], 206)
            self.assertEqual(seed["yuhonas_id"], "Walking Lunges")
            self.assertEqual(seed["instructions"], ["Step forward"])
            self.assertIn("wger", seed["external_ids"])
            self.assertIn("yuhonas", seed["external_ids"])

    def test_build_external_seed_uses_canonical_expert_aliases(self) -> None:
        seed = build_external_seed("Kreuzheben", "080")
        self.assertIsNotNone(seed)
        self.assertEqual(seed["exercise_id"], "080")
        self.assertEqual(seed["wger_id"], 184)
        self.assertEqual(seed["yuhonas_id"], "Barbell_Deadlift")
        self.assertEqual(seed["external_ids"]["wger"], [184])
        self.assertEqual(seed["external_ids"]["yuhonas"], ["Barbell_Deadlift"])

    def test_build_external_seed_uses_exact_external_ids_before_fuzzy_name_match(self) -> None:
        seed = build_external_seed("Schrägbankdrücken mit Kurzhanteln", "041")
        self.assertIsNotNone(seed)
        self.assertEqual(seed["wger_id"], 537)
        self.assertEqual(seed["yuhonas_id"], "Incline_Dumbbell_Press")
        self.assertTrue(seed["original_description"])
        self.assertTrue(seed["instructions"])


if __name__ == "__main__":
    unittest.main()
