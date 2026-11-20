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


def _text_block(body: dict[str, Any], existing: dict[str, Any], key: str, fields: tuple[str, ...], flat_prefix: str) -> dict[str, str]:
    """Nested Textblock (learning_goal / trainer_explanation) übernehmen.

    Akzeptiert die verschachtelte Form (``{"learning_goal": {"short": ...}}``)
    und die alte flache Form (``learning_goal_short``). Ein im Body vorhandener
    Schlüssel gewinnt auch dann, wenn er leer ist — sonst ließe sich ein Feld
    nie leeren.
    """
    nested = body.get(key) if isinstance(body.get(key), dict) else {}
    old = existing.get(key) if isinstance(existing.get(key), dict) else {}
    out: dict[str, str] = {}
    for field in fields:
        flat = f"{flat_prefix}{field}"
        if field in nested:
            value = nested.get(field)
        elif flat in body:
            value = body.get(flat)
        else:
            value = old.get(field)
        out[field] = str(value or "").strip()
    return out


def _normalize_quiz(value: Any) -> list[dict[str, str]]:
    items = value if isinstance(value, list) else [value] if isinstance(value, dict) else []
    quiz = []
    for item in items:
        if not isinstance(item, dict):
            continue
        question = str(item.get("question") or "").strip()
        answer = str(item.get("answer") or "").strip()
        if question or answer:
            quiz.append({"question": question, "answer": answer})
    return quiz


def _normalize_variations(value: Any) -> list[dict[str, str]]:
    variations = []
    for item in value if isinstance(value, list) else []:
        if not isinstance(item, dict):
            continue
        variation = str(item.get("variation") or "").strip()
        lesson = str(item.get("lesson") or "").strip()
        if variation or lesson:
            variations.append({"variation": variation, "lesson": lesson})
    return variations


def normalize_lesson_payload(exercise_id: str, body: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
    """Lesson aus Coach-Sheet-Payload + bestehender Lesson bauen.

    Unbekannte Felder der bestehenden Lesson (``region``, ``variations_teach``,
    ``quiz_prompts``, ``simple_explanation`` …) bleiben erhalten — das Sheet
    editiert nur einen Teil der Lesson und darf den Rest nicht wegwerfen.
    """
    existing = existing or {}

    def pick(key: str) -> Any:
        return body[key] if key in body else existing.get(key)

    movement_pattern = pick("movement_pattern")
    if isinstance(movement_pattern, dict):
        primary = str(movement_pattern.get("primary") or "").strip()
        secondary = as_list(movement_pattern.get("secondary"))
        movement_pattern = {"primary": primary, "secondary": secondary} if secondary else primary
    elif movement_pattern not in (None, ""):
        movement_pattern = str(movement_pattern).strip()
    else:
        movement_pattern = ""

    def pick_struct(key: str, types: tuple[type, ...], default: Any) -> Any:
        value = body.get(key)
        if isinstance(value, types):
            return value
        return existing.get(key, default)

    lesson = {
        **existing,
        "exercise_id": exercise_id,
        "title": str(body.get("title") or existing.get("title") or exercise_id.replace("_", " ").title()).strip(),
        "learning_goal": _text_block(body, existing, "learning_goal", ("short", "detailed"), "learning_goal_"),
        "movement_pattern": movement_pattern,
        "trainer_explanation": _text_block(body, existing, "trainer_explanation", ("simple", "technical", "client_friendly"), "trainer_"),
        "coaching_cues": as_list(pick("coaching_cues")),
        "feel_cues": as_list(pick("feel_cues")),
        "joint_actions": pick_struct("joint_actions", (dict,), {}),
        "body_highlighter_regions": pick_struct("body_highlighter_regions", (dict, list), {}),
        "muscle_roles": pick_struct("muscle_roles", (dict,), {}),
        "muscle_anatomy": pick_struct("muscle_anatomy", (dict,), {}),
        "common_errors": normalize_common_errors(pick("common_errors")),
        "variations_teach": _normalize_variations(pick("variations_teach")),
        "quiz": _normalize_quiz(pick("quiz")),
        "updated_at": utc_now(),
    }
    if not lesson["variations_teach"] and "variations_teach" not in existing and "variations_teach" not in body:
        lesson.pop("variations_teach")
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
