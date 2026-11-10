from __future__ import annotations

from copy import deepcopy
from typing import Any

from fitness.catalog.core.source_selection import apply_source_selection


SCHEMA_VERSION = "2026-08-12.exercise-v1"


def _as_text_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item)]
    if value in (None, ""):
        return []
    return [str(value)]


def _non_empty_dict(values: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in values.items()
        if value not in (None, "", [], {})
    }


def infer_origin_type(exercise: dict[str, Any]) -> str:
    has_wger = bool(exercise.get("wger_id")) or bool(_as_text_list((exercise.get("external_ids") or {}).get("wger")))
    has_yuhonas = bool(exercise.get("yuhonas_id")) or bool(_as_text_list((exercise.get("external_ids") or {}).get("yuhonas")))
    if has_wger and has_yuhonas:
        return "merged_external"
    if has_wger or has_yuhonas:
        return "external"
    return "manual"


def build_review_state(
    exercise: dict[str, Any],
    *,
    status: str,
    review_provider: str | None = None,
    ai_reviewed: bool | None = None,
) -> dict[str, Any]:
    existing = deepcopy(exercise.get("review_state")) if isinstance(exercise.get("review_state"), dict) else {}
    state = _non_empty_dict({
        **existing,
        "status": status,
        "review_provider": review_provider or existing.get("review_provider"),
        "ai_reviewed": ai_reviewed if ai_reviewed is not None else existing.get("ai_reviewed"),
        "enriched_at": exercise.get("enriched_at") or existing.get("enriched_at"),
        "approved_at": exercise.get("approved_at") or existing.get("approved_at"),
    })
    return state


def apply_exercise_schema(
    exercise: dict[str, Any],
    *,
    review_status: str,
    review_provider: str | None = None,
    ai_reviewed: bool | None = None,
) -> dict[str, Any]:
    ex = apply_source_selection(exercise)
    external_ids = ex.get("external_ids") if isinstance(ex.get("external_ids"), dict) else {}
    source_refs = _non_empty_dict({
        "wger": _as_text_list(external_ids.get("wger")) or _as_text_list(ex.get("wger_id")),
        "yuhonas": _as_text_list(external_ids.get("yuhonas")) or _as_text_list(ex.get("yuhonas_id")),
    })
    ex["schema_version"] = SCHEMA_VERSION
    ex["origin"] = {
        "type": infer_origin_type(ex),
        "source_refs": source_refs,
    }
    ex["review_state"] = build_review_state(
        ex,
        status=review_status,
        review_provider=review_provider,
        ai_reviewed=ai_reviewed,
    )
    return ex


def default_review_status(exercise: dict[str, Any]) -> str:
    source = str(exercise.get("source") or "").strip().lower()
    if exercise.get("approved_at") or source in {"expert", "approved"}:
        return "approved"
    return "draft"
