from __future__ import annotations

import unittest

from fitness.catalog.coverage import (
    build_muscle_alias_map,
    calculate_coverage,
    load_muscle_region_index,
    load_muscle_taxonomy,
    resolve_muscle_id,
)
from fitness.catalog.core.resolver import ExerciseRecord


class CoverageTest(unittest.TestCase):
    def test_fine_muscles_roll_up_to_specific_buckets(self) -> None:
        records = [
            ExerciseRecord(
                exercise_id="front_squat_test",
                display_name="Front Squat Test",
                source_file="test.yml",
                primary_muscles=["601_quadriceps_femoris", "603_gluteus_maximus"],
                secondary_muscles=["604a_biceps_femoris", "701_gastrocnemius"],
                stabilizers=["206_erector_spinae"],
            )
        ]

        result = calculate_coverage("front_squat_test", 3, 8, records=records)

        self.assertEqual(result["body_region_scores"]["quadriceps"], 3.0)
        self.assertEqual(result["body_region_scores"]["glutes"], 3.0)
        self.assertEqual(result["body_region_scores"]["hamstrings"], 1.5)
        self.assertEqual(result["body_region_scores"]["calves"], 1.5)
        self.assertAlmostEqual(result["body_region_scores"]["lower_back"], 0.6)
        self.assertEqual(result["unmapped_muscles"], [])

    def test_bucket_names_count_as_regions(self) -> None:
        records = [
            ExerciseRecord(
                exercise_id="bucket_squat_test",
                display_name="Bucket Squat Test",
                source_file="test.yml",
                primary_muscles=["quadriceps"],
                secondary_muscles=["glutes", "hamstrings", "adductors"],
                stabilizers=["calves"],
            )
        ]

        result = calculate_coverage("bucket_squat_test", 2, 8, records=records)

        self.assertEqual(result["muscle_scores"]["quadriceps"], 2.0)
        self.assertEqual(result["body_region_scores"]["quadriceps"], 2.0)
        self.assertEqual(result["body_region_scores"]["glutes"], 1.0)
        self.assertEqual(result["body_region_scores"]["hamstrings"], 1.0)
        self.assertEqual(result["muscle_scores"]["adductors"], 1.0)
        self.assertEqual(result["body_region_scores"]["adductors"], 1.0)
        self.assertAlmostEqual(result["body_region_scores"]["calves"], 0.4)
        self.assertEqual(result["unmapped_muscles"], [])

    def test_current_id_mapping_and_legacy_slug_safety(self) -> None:
        region_index = load_muscle_region_index()
        alias_map = build_muscle_alias_map(load_muscle_taxonomy())

        self.assertEqual(region_index["601_quadriceps_femoris"], "quadriceps")
        self.assertEqual(region_index["601a_rectus_femoris"], "quadriceps")
        self.assertEqual(region_index["603_gluteus_maximus"], "glutes")
        self.assertEqual(region_index["604a_biceps_femoris"], "hamstrings")
        self.assertEqual(region_index["701_gastrocnemius"], "calves")
        self.assertEqual(resolve_muscle_id("601", alias_map), "601_quadriceps_femoris")
        self.assertEqual(resolve_muscle_id("603_rectus_femoris", alias_map), "603_rectus_femoris")

    def test_unmapped_muscle_handling(self) -> None:
        records = [
            ExerciseRecord(
                exercise_id="mystery_push",
                display_name="Mystery Push",
                source_file="test.yml",
                primary_muscles=["mystery_muscle"],
            )
        ]

        result = calculate_coverage("mystery_push", 2, 8, records=records)

        self.assertEqual(result["muscle_scores"]["mystery_muscle"], 2.0)
        self.assertEqual(result["unmapped_muscles"], ["mystery_muscle"])


if __name__ == "__main__":
    unittest.main()
