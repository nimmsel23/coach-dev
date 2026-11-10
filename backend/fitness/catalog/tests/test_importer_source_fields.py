from unittest.mock import patch

from fitness.catalog.importer import _wger_entry_from_api_item, wger_names


def test_wger_english_name_is_not_labeled_german():
    assert wger_names({"id": 9999, "translations": [{"language": 2, "name": "English Only"}]}) == (
        "English Only", None, "English Only",
    )


def test_single_leg_curl_source_errors_are_corrected():
    item = {
        "id": 1300,
        "translations": [{"language": 2, "name": "Single-leg hamstring curl", "description": "Hamstring curl"}],
        "muscles": [{"id": 8}, {"id": 12}],
        "muscles_secondary": [],
        "category": {"id": 12},
        "equipment": [],
    }
    taxonomy = {"wger_groups": {8: ["603_gluteus_maximus"], 12: ["201_latissimus_dorsi"]}}
    with patch("fitness.catalog.importer.load_catalog_yaml", return_value=taxonomy):
        entry = _wger_entry_from_api_item(item)

    assert entry["display_name"] == "Einbeiniger Beinbeuger"
    assert entry["german"] == "Einbeiniger Beinbeuger"
    assert entry["english"] == "Single-leg hamstring curl"
    assert entry["category"] == "legs"
    assert entry["primary_muscles"] == [
        "604a_biceps_femoris", "604b_semitendinosus", "604c_semimembranosus",
    ]
