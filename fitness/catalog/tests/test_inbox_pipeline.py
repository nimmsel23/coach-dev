from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest import mock

from fitness.catalog.core.inbox_pipeline import build_inbox_draft_seed, preserve_reenrich_provenance


class InboxPipelineTest(unittest.TestCase):
    def test_reenrich_restart_ignores_stale_ai_payload_fields(self) -> None:
        external_seed = {
            "exercise_id": "sit_ups",
            "id": "sit_ups",
            "display_name": "Sit-Ups",
            "german": "Sit-Ups",
            "english": "Sit-Ups",
            "category": "carry",
            "primary_muscles": ["501_rectus_abdominis"],
            "instructions": ["Original source instruction"],
            "images": ["situp.jpg"],
            "original_description": "Originalquelle",
            "wger_id": 591,
            "external_ids": {"wger": [591]},
        }
        stale_payload = {
            "exercise_id": "sit_ups",
            "id": "sit_ups",
            "display_name": "Sit-Ups",
            "category": "twist",
            "primary_muscles": ["999_fake"],
            "coaching_notes": ["Alter KI-Text"],
            "original_description": "Alter KI-Text",
            "wger_id": 123,
            "external_ids": {"wger": [123]},
        }

        with mock.patch("fitness.catalog.core.inbox_pipeline.build_external_seed", return_value=external_seed), \
             mock.patch("fitness.catalog.core.inbox_pipeline.build_exercise_index", return_value=[]), \
             mock.patch("fitness.catalog.core.inbox_pipeline.resolve_query") as resolve_query, \
             mock.patch("fitness.catalog.core.inbox_pipeline.find_by_id", return_value=None):
            resolve_query.return_value = SimpleNamespace(matched=False, canonical_id=None)
            seed = build_inbox_draft_seed("Sit-Ups", "sit_ups", stale_payload, restart=True)

        self.assertEqual(seed["wger_id"], 591)
        self.assertEqual(seed["external_ids"]["wger"], [591])
        self.assertEqual(seed["original_description"], "Originalquelle")
        self.assertEqual(seed["instructions"], ["Original source instruction"])
        self.assertEqual(seed["images"], ["situp.jpg"])
        self.assertEqual(seed["category"], "carry")
        self.assertEqual(seed["primary_muscles"], ["501_rectus_abdominis"])
        self.assertNotIn("coaching_notes", seed)

    def test_manual_draft_without_external_match_can_restart(self) -> None:
        payload = {"exercise_id": "inbox_yoga_headstand", "display_name": "Yoga Headstand",
                   "origin": {"type": "manual", "source_refs": {}}, "coaching_notes": ["Stale AI text"]}
        with mock.patch("fitness.catalog.core.inbox_pipeline.build_external_seed", return_value=None), \
             mock.patch("fitness.catalog.core.inbox_pipeline._canonical_record_seed", return_value={}):
            seed = build_inbox_draft_seed("Yoga Headstand", "inbox_yoga_headstand", payload, restart=True)
        self.assertEqual(seed["exercise_id"], "inbox_yoga_headstand")
        self.assertEqual(seed["origin"], payload["origin"])
        self.assertNotIn("coaching_notes", seed)

    def test_canonical_provenance_survives_missing_external_match(self) -> None:
        canonical = {"external_ids": {"wger": [17]}, "wger_id": 17}
        with mock.patch("fitness.catalog.core.inbox_pipeline.build_external_seed", return_value=None), \
             mock.patch("fitness.catalog.core.inbox_pipeline._canonical_record_seed", return_value=canonical):
            seed = build_inbox_draft_seed("Manual", "manual", {}, restart=True)
        self.assertEqual(seed["external_ids"], {"wger": [17]})

    def test_queue_overlay_can_keep_explicit_payload_fields(self) -> None:
        external_seed = {
            "exercise_id": "plank",
            "display_name": "Plank",
            "category": "carry",
            "primary_muscles": ["501_rectus_abdominis"],
        }
        payload = {
            "exercise_id": "plank",
            "display_name": "Unterarmstütz",
            "category": "twist",
            "coaching_notes": ["Coach note"],
        }

        with mock.patch("fitness.catalog.core.inbox_pipeline.build_external_seed", return_value=external_seed), \
             mock.patch("fitness.catalog.core.inbox_pipeline.build_exercise_index", return_value=[]), \
             mock.patch("fitness.catalog.core.inbox_pipeline.resolve_query") as resolve_query, \
             mock.patch("fitness.catalog.core.inbox_pipeline.find_by_id", return_value=None):
            resolve_query.return_value = SimpleNamespace(matched=False, canonical_id=None)
            seed = build_inbox_draft_seed("Unterarmstütz", "plank", payload, restart=False)

        self.assertEqual(seed["display_name"], "Unterarmstütz")
        self.assertEqual(seed["category"], "twist")
        self.assertEqual(seed["coaching_notes"], ["Coach note"])

    def test_reenrich_preserves_confirmed_source_links_after_ai_rebuild(self) -> None:
        seed = {
            "exercise_id": "walking_lunges",
            "wger_id": 206,
            "yuhonas_id": "Walking_Lunges",
            "external_ids": {"wger": [206], "yuhonas": ["Walking_Lunges"]},
            "origin": {
                "type": "external",
                "source_refs": {"wger": ["206"], "yuhonas": ["Walking_Lunges"]},
                "wger": {"wger_id": 206, "display_name": "Walking Lunges"},
                "yuhonas": {"yuhonas_id": "Walking_Lunges", "display_name": "Walking Lunges"},
            },
            "original_description": "Raw wger description",
        }
        ai_rebuild = {
            "exercise_id": "walking_lunges",
            "display_name": "Ausfallschritte im Gehen",
            "coaching_notes": ["Neuer Coach-Text"],
        }

        rebuilt = preserve_reenrich_provenance(ai_rebuild, seed)

        self.assertEqual(rebuilt["coaching_notes"], ["Neuer Coach-Text"])
        self.assertEqual(rebuilt["wger_id"], 206)
        self.assertEqual(rebuilt["yuhonas_id"], "Walking_Lunges")
        self.assertEqual(rebuilt["external_ids"], {"wger": [206], "yuhonas": ["Walking_Lunges"]})
        self.assertEqual(rebuilt["origin"]["source_refs"]["wger"], ["206"])
        self.assertEqual(rebuilt["origin"]["source_refs"]["yuhonas"], ["Walking_Lunges"])
        self.assertEqual(rebuilt["original_description"], "Raw wger description")


if __name__ == "__main__":
    unittest.main()
