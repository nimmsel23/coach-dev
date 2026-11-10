from __future__ import annotations

from typing import Any


def text_value(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def as_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def is_empty_structure(value: Any) -> bool:
    if isinstance(value, dict):
        return all(is_empty_structure(item) for item in value.values())
    if isinstance(value, list):
        return all(is_empty_structure(item) for item in value)
    return not bool(str(value).strip())


def extract_region_values(value: Any) -> list[str]:
    regions: list[str] = []
    if isinstance(value, list):
        for item in value:
            if isinstance(item, str) and item.strip():
                regions.append(item.strip())
        return regions
    if isinstance(value, dict):
        for item in value.values():
            regions.extend(extract_region_values(item))
    elif isinstance(value, str) and value.strip():
        regions.append(value.strip())
    return regions


def muscle_regions(muscle_id: str, region_index: dict[str, str]) -> list[str]:
    region = region_index.get(muscle_id)
    return [region] if region else []


def count_aliases_per_exercise(raw_aliases: dict[Any, Any], exercise_ids: set[str]) -> dict[str, int]:
    counts = {exercise_id: 0 for exercise_id in exercise_ids}
    for alias, canonical_id in raw_aliases.items():
        if isinstance(alias, str) and isinstance(canonical_id, str) and canonical_id in counts:
            counts[canonical_id] += 1
    return counts
