from __future__ import annotations

import unittest

from fitness.catalog.core.exercise_schema import apply_exercise_schema, default_review_status


class ExerciseSchemaTest(unittest.TestCase):
    def test_manual_exercise_gets_manual_origin(self) -> None:
        ex = apply_exercise_schema(
            {
                "exercise_id": "jefferson_curl",
                "display_name": "Jefferson Curl",
            },
            review_status="approved",
            ai_reviewed=True,
        )
        self.assertEqual(ex["origin"]["type"], "manual")
        self.assertEqual(ex["review_state"]["status"], "approved")

    def test_external_exercise_preserves_wger_snapshot(self) -> None:
        ex = apply_exercise_schema(
            {
                "exercise_id": "wger_206",
                "display_name": "Ausfallschritte im Gehen",
                "wger_id": 206,
                "wger_muscle_ids": {"primary": [10]},
                "original_description": "raw",
            },
            review_status="draft",
            ai_reviewed=False,
        )
        self.assertEqual(ex["origin"]["type"], "external")
        self.assertEqual(ex["origin"]["source_refs"]["wger"], ["206"])
        self.assertNotIn("source_snapshot", ex)
        self.assertEqual(ex["review_state"]["status"], "draft")

    def test_expert_source_defaults_to_approved(self) -> None:
        self.assertEqual(default_review_status({"source": "expert"}), "approved")


if __name__ == "__main__":
    unittest.main()
