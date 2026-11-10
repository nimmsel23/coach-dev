"""Expert-Ownership blendet Unreviewed nur per Source-ID aus — nicht per Alias."""
from __future__ import annotations

import unittest
from pathlib import Path

import yaml

from fitness.catalog.api.firestore_push import (
    _is_superseded_external_exercise,
    _reviewed_external_refs,
)


class SupersedeExternalTests(unittest.TestCase):
    def test_search_aliases_do_not_hide_yuhonas_pullups(self):
        docs = [
            (
                Path("exercises/020.yml"),
                {
                    "exercises": [
                        {
                            "exercise_id": "020",
                            "source": "expert",
                            "display_name": "Klimmzug im Obergriff",
                            "search_aliases": ["Pullups", "Klimmzug an Leiste", "Pull-Up"],
                        }
                    ]
                },
            )
        ]
        refs = _reviewed_external_refs(docs)
        self.assertNotIn("Pullups", refs["yuhonas"])
        self.assertFalse(
            _is_superseded_external_exercise(
                {
                    "exercise_id": "yuhonas_pullups",
                    "yuhonas_id": "Pullups",
                    "display_name": "Pullups",
                    "name": "Pullups",
                },
                refs,
            )
        )

    def test_linked_yuhonas_id_still_hides_bulk(self):
        docs = [
            (
                Path("exercises/020.yml"),
                {
                    "exercises": [
                        {
                            "exercise_id": "020",
                            "source": "expert",
                            "yuhonas_id": "Pullups",
                            "external_ids": {"yuhonas": ["Pullups"]},
                        }
                    ]
                },
            )
        ]
        refs = _reviewed_external_refs(docs)
        self.assertTrue(
            _is_superseded_external_exercise(
                {"yuhonas_id": "Pullups", "display_name": "Pullups"},
                refs,
            )
        )

    def test_explicit_unlink_keeps_bulk_visible(self):
        docs = [
            (
                Path("exercises/020.yml"),
                {
                    "exercises": [
                        {
                            "exercise_id": "020",
                            "source": "expert",
                            "source_selection": {"yuhonas": None},
                            "yuhonas_id": "Pullups",
                            "external_ids": {"yuhonas": ["Pullups"]},
                        }
                    ]
                },
            )
        ]
        refs = _reviewed_external_refs(docs)
        self.assertFalse(
            _is_superseded_external_exercise({"yuhonas_id": "Pullups"}, refs)
        )

    def test_deleting_expert_from_pool_reactivates_unreviewed(self):
        """Simulation: Expert weg → gleiche Source-ID nicht mehr in refs."""
        before = [
            (
                Path("exercises/020.yml"),
                {"exercises": [{"exercise_id": "020", "wger_id": 821, "yuhonas_id": "Pullups"}]},
            )
        ]
        after: list = []
        self.assertTrue(
            _is_superseded_external_exercise(
                {"wger_id": 821, "display_name": "Klimmzug an Leiste"},
                _reviewed_external_refs(before),
            )
        )
        self.assertFalse(
            _is_superseded_external_exercise(
                {"wger_id": 821, "display_name": "Klimmzug an Leiste"},
                _reviewed_external_refs(after),
            )
        )


if __name__ == "__main__":
    unittest.main()
