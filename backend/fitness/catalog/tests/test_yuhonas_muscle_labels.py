"""Die yuhonas-Muskel-Labels müssen auf die im Registry-File dokumentierten Ziele auflösen."""

from pathlib import Path

import yaml

from fitness.catalog.core.muscle_normalization import canonicalize_muscle_id

REGISTRY = Path(__file__).resolve().parents[1] / "kb" / "registry" / "yuhonas_muscle_labels.yml"


def _labels():
    doc = yaml.safe_load(REGISTRY.read_text(encoding="utf-8"))
    return doc["labels"]


def test_registry_lists_all_17_yuhonas_labels():
    assert len(_labels()) == 17


def test_direct_and_group_labels_resolve_to_registry_target():
    for entry in _labels():
        if entry["status"] in ("direct", "group"):
            assert canonicalize_muscle_id(entry["label"]) == entry["target"], entry["label"]


def test_context_and_unmapped_labels_stay_unresolved():
    by_label = {e["label"]: e for e in _labels()}
    assert canonicalize_muscle_id("shoulders") == "shoulders"
    assert canonicalize_muscle_id("neck") == by_label["neck"]["label"]


def test_fma_ids_match_muscle_files():
    fma_by_target = {e["target"]: e["fma_id"] for e in _labels() if e["fma_id"]}
    muscles_root = Path(__file__).resolve().parents[1] / "kb" / "muscles"
    for target, fma_id in fma_by_target.items():
        matches = [p for p in muscles_root.rglob("*.yml") if p.stem == target]
        assert len(matches) == 1, target
        data = yaml.safe_load(matches[0].read_text(encoding="utf-8"))
        assert data.get("fma_id") == fma_id, target
