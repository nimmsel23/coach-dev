from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from fitness.catalog.core.exercise_schema import apply_exercise_schema
from fitness.catalog.core.paths import DATA_DIR


def catalog_exercise_path(exercise_id: str) -> Path:
    return DATA_DIR / "exercises" / f"{exercise_id}.yml"


def catalog_lesson_path(exercise_id: str) -> Path:
    return DATA_DIR / "anatomy_teaching" / f"{exercise_id}.yaml"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def as_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if value in (None, ""):
        return []
    return [str(value).strip()]


def normalize_common_errors(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    errors: list[dict[str, str]] = []
    for item in value:
        if isinstance(item, dict):
            error = {
                "error": str(item.get("error") or "").strip(),
                "anatomical_reason": str(item.get("anatomical_reason") or item.get("reason") or "").strip(),
                "correction": str(item.get("correction") or "").strip(),
                "coaching_cue": str(item.get("coaching_cue") or item.get("fix") or "").strip(),
            }
            if any(error.values()):
                errors.append(error)
        elif item not in (None, ""):
            errors.append({"error": str(item).strip()})
    return errors


def normalize_lesson_payload(exercise_id: str, body: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
    existing = existing or {}
    movement_pattern = body.get("movement_pattern", existing.get("movement_pattern"))
    if isinstance(movement_pattern, dict):
        primary = str(movement_pattern.get("primary") or "").strip()
        secondary = as_list(movement_pattern.get("secondary"))
        movement_pattern = {"primary": primary, "secondary": secondary} if secondary else primary
    elif movement_pattern not in (None, ""):
        movement_pattern = str(movement_pattern).strip()
    else:
        movement_pattern = ""

    lesson = {
        "exercise_id": exercise_id,
        "title": str(body.get("title") or existing.get("title") or exercise_id.replace("_", " ").title()).strip(),
        "learning_goal": {
            "short": str(body.get("learning_goal_short") or existing.get("learning_goal", {}).get("short") or "").strip(),
            "detailed": str(body.get("learning_goal_detailed") or existing.get("learning_goal", {}).get("detailed") or "").strip(),
        },
        "movement_pattern": movement_pattern,
        "trainer_explanation": {
            "simple": str(body.get("trainer_simple") or existing.get("trainer_explanation", {}).get("simple") or "").strip(),
            "technical": str(body.get("trainer_technical") or existing.get("trainer_explanation", {}).get("technical") or "").strip(),
            "client_friendly": str(body.get("trainer_client_friendly") or existing.get("trainer_explanation", {}).get("client_friendly") or "").strip(),
        },
        "coaching_cues": as_list(body.get("coaching_cues", existing.get("coaching_cues"))),
        "feel_cues": as_list(body.get("feel_cues", existing.get("feel_cues"))),
        "joint_actions": body.get("joint_actions") if isinstance(body.get("joint_actions"), dict) else existing.get("joint_actions", {}),
        "body_highlighter_regions": body.get("body_highlighter_regions") if isinstance(body.get("body_highlighter_regions"), (dict, list)) else existing.get("body_highlighter_regions", {}),
        "muscle_roles": body.get("muscle_roles") if isinstance(body.get("muscle_roles"), dict) else existing.get("muscle_roles", {}),
        "muscle_anatomy": body.get("muscle_anatomy") if isinstance(body.get("muscle_anatomy"), dict) else existing.get("muscle_anatomy", {}),
        "common_errors": normalize_common_errors(body.get("common_errors", existing.get("common_errors"))),
        "quiz": body.get("quiz") if isinstance(body.get("quiz"), (dict, list)) else existing.get("quiz", {}),
        "updated_at": utc_now(),
    }
    if not lesson["learning_goal"]["short"] and lesson["learning_goal"]["detailed"]:
        lesson["learning_goal"]["short"] = lesson["learning_goal"]["detailed"]
    return lesson


def save_exercise_document(exercise_id: str, payload: dict[str, Any]) -> Path:
    exercise_path = catalog_exercise_path(exercise_id)
    exercise_path.parent.mkdir(parents=True, exist_ok=True)
    existing_doc = yaml.safe_load(exercise_path.read_text(encoding="utf-8")) if exercise_path.exists() else {}
    existing_ex = ((existing_doc or {}).get("exercises") or [{}])[0] if isinstance(existing_doc, dict) else {}

    merged = {
        **(existing_ex if isinstance(existing_ex, dict) else {}),
        **{k: v for k, v in payload.items() if v not in (None, "", [], {})},
    }
    merged["exercise_id"] = exercise_id
    merged["id"] = exercise_id
    merged["updated_at"] = utc_now()
    merged = apply_exercise_schema(merged, review_status="approved", ai_reviewed=True)

    wrapper = {
        "exercise_id": exercise_id,
        "description": f"Expert details for {merged.get('display_name') or exercise_id}",
        "updated_at": merged["updated_at"],
        "exercises": [merged],
    }
    exercise_path.write_text(yaml.safe_dump(wrapper, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return exercise_path


def save_lesson_document(exercise_id: str, payload: dict[str, Any]) -> tuple[Path, dict[str, Any]]:
    lesson_path = catalog_lesson_path(exercise_id)
    lesson_path.parent.mkdir(parents=True, exist_ok=True)
    existing_doc = yaml.safe_load(lesson_path.read_text(encoding="utf-8")) if lesson_path.exists() else {}
    existing_lessons = (existing_doc or {}).get("lessons") if isinstance(existing_doc, dict) else None
    existing_lesson = existing_lessons[0] if isinstance(existing_lessons, list) and existing_lessons else None
    normalized = normalize_lesson_payload(exercise_id, payload, existing_lesson if isinstance(existing_lesson, dict) else None)
    wrapper = {
        "name": f"{exercise_id}_lesson",
        "description": f"Coach lesson for {exercise_id}",
        "updated_at": normalized["updated_at"],
        "lessons": [normalized],
    }
    lesson_path.write_text(yaml.safe_dump(wrapper, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return lesson_path, normalized
