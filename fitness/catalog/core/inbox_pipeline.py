from __future__ import annotations

from copy import deepcopy
from typing import Any

from fitness.catalog.core.resolver import build_exercise_index, find_by_id, resolve_query
from fitness.catalog.core.source_merge import build_external_seed
from fitness.catalog.core.source_selection import apply_source_selection

QUEUE_OVERLAY_FIELDS = {
    "source_selection",
    "exercise_id",
    "id",
    "name",
    "display_name",
    "german",
    "english",
    "category",
    "type",
    "movements",
    "equipment",
    "primary_muscles",
    "secondary_muscles",
    "stabilizers",
    "instructions",
    "images",
    "coaching_notes",
    "common_errors",
    "original_description",
    "tags",
    "aliases",
    "search_aliases",
    "wger_id",
    "wger_muscle_ids",
    "yuhonas_id",
    "external_ids",
    "logged_by_uid",
}

REENRICH_OVERLAY_FIELDS = {
    "source_selection",
    "exercise_id",
    "id",
    "name",
    "display_name",
    "german",
    "english",
    "wger_id",
    "wger_muscle_ids",
    "yuhonas_id",
    "external_ids",
    "logged_by_uid",
    "aliases",
    "search_aliases",
    "origin",
    "source_snapshot",
}

REENRICH_PROVENANCE_FIELDS = {
    "source_selection",
    "wger_id",
    "wger_muscle_ids",
    "yuhonas_id",
    "external_ids",
    "origin",
    "source_snapshot",
    "original_description",
    "instructions",
    "images",
}


def _is_empty(value: Any) -> bool:
    return value in (None, "", [], {})


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return [deepcopy(item) for item in value if not _is_empty(item)]
    if _is_empty(value):
        return []
    return [deepcopy(value)]


def _merge_values(existing: Any, incoming: Any) -> Any:
    if _is_empty(incoming):
        return deepcopy(existing)
    if _is_empty(existing):
        return deepcopy(incoming)

    if isinstance(existing, dict) and isinstance(incoming, dict):
        merged = deepcopy(existing)
        for key, value in incoming.items():
            merged[key] = _merge_values(merged.get(key), value)
        return merged

    if isinstance(existing, list) or isinstance(incoming, list):
        merged: list[Any] = []
        seen: set[str] = set()
        for item in _as_list(existing) + _as_list(incoming):
            marker = repr(item)
            if marker in seen:
                continue
            seen.add(marker)
            merged.append(item)
        return merged

    return deepcopy(incoming)


def _merge_layers(*layers: dict[str, Any] | None) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for layer in layers:
        if not isinstance(layer, dict):
            continue
        for key, value in layer.items():
            merged[key] = _merge_values(merged.get(key), value)
    return {
        key: value
        for key, value in merged.items()
        if not _is_empty(value)
    }


def _pick_fields(payload: dict[str, Any] | None, allowed_fields: set[str]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    return {
        key: deepcopy(value)
        for key, value in payload.items()
        if key in allowed_fields and not _is_empty(value)
    }


def _canonical_record_seed(display_name: str, exercise_id: str | None = None) -> dict[str, Any]:
    records = build_exercise_index()
    record = find_by_id(str(exercise_id), records) if exercise_id else None
    if record is not None and getattr(record, "source", "") == "inbox":
        record = None

    if record is None and display_name:
        resolution = resolve_query(display_name, records)
        if resolution.matched and resolution.canonical_id:
            candidate = find_by_id(resolution.canonical_id, records)
            if candidate is not None and getattr(candidate, "source", "") != "inbox":
                record = candidate

    if record is None:
        return {}

    return {
        "exercise_id": record.exercise_id,
        "id": record.exercise_id,
        "name": record.display_name,
        "display_name": record.display_name,
        "german": record.german,
        "english": record.english,
        "category": record.category,
        "type": getattr(record, "type", None),
        "movements": record.movements,
        "equipment": record.equipment,
        "primary_muscles": record.primary_muscles,
        "secondary_muscles": record.secondary_muscles,
        "stabilizers": record.stabilizers,
        "instructions": record.instructions,
        "images": record.images,
        "coaching_notes": record.coaching_notes,
        "common_errors": record.common_errors,
        "original_description": record.original_description,
        "tags": record.tags,
        "aliases": record.aliases,
        "search_aliases": record.search_aliases,
        "wger_id": record.wger_id,
        "wger_muscle_ids": record.wger_muscle_ids,
        "yuhonas_id": record.yuhonas_id,
        "external_ids": record.external_ids,
        "logged_by_uid": record.logged_by_uid,
        "source_selection": getattr(record, "source_selection", None),
    }


def build_inbox_draft_seed(
    display_name: str,
    exercise_id: str | None = None,
    payload: dict[str, Any] | None = None,
    *,
    restart: bool = False,
) -> dict[str, Any]:
    overlay_fields = REENRICH_OVERLAY_FIELDS if restart else QUEUE_OVERLAY_FIELDS
    overlay = _pick_fields(payload, overlay_fields)
    canonical_seed = _canonical_record_seed(display_name, exercise_id)
    selection = (payload or {}).get("source_selection") or canonical_seed.get("source_selection")
    if restart and (payload or {}).get("source_review_required"):
        canonical_seed = {}  # A corrected source must not seed stale, mixed expert content.
    external_seed = (build_external_seed(display_name, exercise_id, source_selection=selection) if selection else build_external_seed(display_name, exercise_id)) or {}
    if restart:
        merged = _merge_layers(overlay, canonical_seed, external_seed)
        if not _is_empty(external_seed.get("external_ids")):
            merged["external_ids"] = deepcopy(external_seed["external_ids"])
        elif not _is_empty(canonical_seed.get("external_ids")):
            merged["external_ids"] = deepcopy(canonical_seed["external_ids"])
    else:
        merged = _merge_layers(canonical_seed, external_seed, overlay)

    merged = apply_source_selection(merged, selection)
    explicit_id = str(exercise_id or merged.get("exercise_id") or merged.get("id") or "").strip()
    explicit_name = str(
        display_name
        or merged.get("display_name")
        or merged.get("name")
        or merged.get("german")
        or explicit_id
    ).strip()

    if explicit_id:
        merged["exercise_id"] = explicit_id
        merged["id"] = explicit_id
    if explicit_name:
        merged.setdefault("name", explicit_name)
        merged.setdefault("display_name", explicit_name)

    return {
        key: value
        for key, value in merged.items()
        if not _is_empty(value)
    }


def preserve_reenrich_provenance(enriched: dict[str, Any] | None, seed: dict[str, Any] | None) -> dict[str, Any]:
    """Keep confirmed source/provenance fields when rebuilding an old draft.

    Re-enrichment should refresh AI-authored coach text and schema fields, but
    the model must not be the authority on whether a draft is linked to wger or
    yuhonas. Those links come from the seed/current draft and confirmed source
    merge actions.
    """
    out = deepcopy(enriched or {})
    if not isinstance(seed, dict):
        return out
    for field in REENRICH_PROVENANCE_FIELDS:
        value = seed.get(field)
        if not _is_empty(value):
            out[field] = deepcopy(value)
    return apply_source_selection(out, seed.get("source_selection"))
