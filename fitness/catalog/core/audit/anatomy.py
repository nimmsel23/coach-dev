from __future__ import annotations

from typing import Any

from fitness.catalog.coverage import load_muscle_taxonomy, normalize_muscle_id
from fitness.catalog.core.resolver import build_exercise_index
from .loaders import load_all_anatomy_lessons, load_legacy_lesson_ids, load_body_regions
from .types import AuditLine, AuditReport, AnatomyAuditResult, ok, warn, fail
from .utils import text_value, as_list, is_empty_structure, extract_region_values, muscle_regions


MVP_EXERCISES = [
    "041", "103", "301", "501", "502", "045", "021", "043", "042",
    "303", "302", "506", "080", "081", "082", "402", "701", "064",
    "104", "020", "061",
]


def run_anatomy_audit() -> AuditReport:
    lines: list[AuditLine] = []
    exercise_index = {record.exercise_id: record for record in build_exercise_index()}
    exercise_ids = set(exercise_index)
    muscles_taxonomy = load_muscle_taxonomy()
    body_regions = load_body_regions()
    lessons = load_all_anatomy_lessons()
    legacy_lesson_ids = load_legacy_lesson_ids()
    seen_lesson_ids: set[str] = set()
    missing_mvp: list[str] = []

    for lesson in lessons:
        exercise_id = str(lesson.get("exercise_id", "")).strip()
        if not exercise_id:
            lines.append(fail("lesson missing exercise_id"))
            continue
        if exercise_id in seen_lesson_ids:
            lines.append(fail(f"duplicate lesson exercise_id: {exercise_id}"))
            continue
        seen_lesson_ids.add(exercise_id)
        lesson_lines = validate_lesson(lesson, exercise_ids, body_regions, muscles_taxonomy)
        lines.extend(lesson_lines)

    present_ids = seen_lesson_ids | legacy_lesson_ids
    for exercise_id in MVP_EXERCISES:
        if exercise_id not in present_ids:
            missing_mvp.append(exercise_id)

    if missing_mvp:
        lines.append(warn("missing MVP lessons: " + ", ".join(missing_mvp)))
    else:
        lines.append(ok("all MVP exercises have lessons"))

    return AuditReport(lines)


def audit_anatomy() -> AnatomyAuditResult:
    lessons = load_all_anatomy_lessons()
    exercise_ids = {record.exercise_id for record in build_exercise_index()}
    body_regions = load_body_regions()
    missing_required_fields: list[str] = []
    lessons_for_missing_exercise_ids: list[str] = []
    lessons_without_quiz: list[str] = []
    lessons_without_common_errors: list[str] = []
    lessons_with_unmapped_body_regions: list[str] = []
    lessons_by_region: dict[str, int] = {}
    lines: list[AuditLine] = []
    seen: set[str] = set()

    for lesson in lessons:
        exercise_id = str(lesson.get("exercise_id", "")).strip()
        region = str(lesson.get("region", "")).strip()
        if region:
            lessons_by_region[region] = lessons_by_region.get(region, 0) + 1
        if exercise_id in seen:
            missing_required_fields.append(f"duplicate:{exercise_id}")
        seen.add(exercise_id)
        if not exercise_id or exercise_id not in exercise_ids:
            lessons_for_missing_exercise_ids.append(exercise_id or "<missing>")
        for key in [
            "exercise_id", "title", "region", "learning_goal", "movement_pattern",
            "joint_actions", "muscle_roles", "body_highlighter_regions", "trainer_explanation",
            "feel_cues", "coaching_cues", "common_errors", "variations_teach", "quiz"
        ]:
            if key not in lesson or lesson.get(key) in (None, "", []):
                missing_required_fields.append(f"{exercise_id}.{key}")
        if not lesson.get("quiz"):
            lessons_without_quiz.append(exercise_id)
        if not lesson.get("common_errors"):
            lessons_without_common_errors.append(exercise_id)
        regions = extract_region_values(lesson.get("body_highlighter_regions"))
        if body_regions is not None and any(r not in body_regions for r in regions):
            lessons_with_unmapped_body_regions.append(exercise_id)
        lines.append(ok(f"{exercise_id} anatomy valid"))

    exercises_without_lessons = sorted(
        exercise_ids - {lesson.get("exercise_id") for lesson in lessons if lesson.get("exercise_id")}
    )
    return AnatomyAuditResult(
        total_lessons=len(lessons),
        lessons_by_region=dict(sorted(lessons_by_region.items())),
        missing_required_fields=sorted(set(missing_required_fields)),
        lessons_for_missing_exercise_ids=sorted(set(lessons_for_missing_exercise_ids)),
        exercises_without_lessons=exercises_without_lessons,
        lessons_without_quiz=sorted(set(x for x in lessons_without_quiz if x)),
        lessons_without_common_errors=sorted(set(x for x in lessons_without_common_errors if x)),
        lessons_with_unmapped_body_regions=sorted(set(lessons_with_unmapped_body_regions)),
        lines=lines,
    )


def validate_lesson(
    lesson: dict[str, Any],
    exercise_ids: set[str],
    body_regions: set[str] | None,
    muscles_taxonomy: dict[str, Any],
) -> list[AuditLine]:
    lines: list[AuditLine] = []
    exercise_id = str(lesson.get("exercise_id", "")).strip()
    if not exercise_id:
        lines.append(fail("lesson missing exercise_id"))
        return lines
    if exercise_id not in exercise_ids:
        lines.append(fail(f"{exercise_id} references unknown exercise"))
        return lines

    for key, label in [("title", "title"), ("region", "region")]:
        if not text_value(lesson.get(key)):
            lines.append(fail(f"{exercise_id} missing {label}"))

    learning_goal = lesson.get("learning_goal")
    if not isinstance(learning_goal, dict) or not text_value(learning_goal.get("short")):
        lines.append(fail(f"{exercise_id} missing learning_goal.short"))

    movement_pattern = lesson.get("movement_pattern")
    if isinstance(movement_pattern, dict):
        if not text_value(movement_pattern.get("primary")):
            lines.append(fail(f"{exercise_id} missing movement_pattern.primary"))
    elif not text_value(movement_pattern):
        lines.append(fail(f"{exercise_id} missing movement_pattern.primary"))

    joint_actions = lesson.get("joint_actions")
    if not joint_actions:
        lines.append(fail(f"{exercise_id} missing joint_actions"))
    elif is_empty_structure(joint_actions):
        lines.append(fail(f"{exercise_id} has empty joint_actions"))

    muscle_roles = lesson.get("muscle_roles")
    if not isinstance(muscle_roles, dict):
        lines.append(fail(f"{exercise_id} missing muscle_roles"))
        muscle_roles = {}
    else:
        prime = as_list(muscle_roles.get("prime_movers"))
        if not prime:
            lines.append(fail(f"{exercise_id} missing muscle_roles.prime_movers"))
        else:
            for muscle in prime:
                if normalize_muscle_id(muscle) not in muscles_taxonomy:
                    lines.append(warn(f"{exercise_id} prime mover not in taxonomy: {muscle}"))
        for field in ["synergists", "stabilizers"]:
            items = as_list(muscle_roles.get(field))
            if not items:
                lines.append(warn(f"{exercise_id} has empty muscle_roles.{field}"))
            else:
                for muscle in items:
                    if normalize_muscle_id(muscle) not in muscles_taxonomy:
                        lines.append(warn(f"{exercise_id} {field[:-1]} not in taxonomy: {muscle}"))

    if body_regions is not None:
        regions = lesson.get("body_highlighter_regions")
        if not regions:
            lines.append(fail(f"{exercise_id} missing body_highlighter_regions"))
        else:
            for region in extract_region_values(regions):
                if region not in body_regions:
                    lines.append(fail(f"{exercise_id} references unknown body region: {region}"))

    trainer = lesson.get("trainer_explanation")
    if not isinstance(trainer, dict) or not text_value(trainer.get("simple")):
        lines.append(fail(f"{exercise_id} missing trainer_explanation.simple"))
    if not isinstance(trainer, dict) or not text_value(trainer.get("client_friendly")):
        lines.append(fail(f"{exercise_id} missing trainer_explanation.client_friendly"))

    feel_cues = as_list(lesson.get("feel_cues"))
    if len(feel_cues) < 2:
        lines.append(warn(f"{exercise_id} has only {len(feel_cues)} feel cue(s)"))

    coaching_cues = as_list(lesson.get("coaching_cues"))
    if len(coaching_cues) < 3:
        lines.append(warn(f"{exercise_id} has only {len(coaching_cues)} coaching cue(s)"))

    common_errors = lesson.get("common_errors")
    if not isinstance(common_errors, list) or not common_errors:
        lines.append(warn(f"{exercise_id} has no common errors"))
    else:
        for error in common_errors:
            if not isinstance(error, dict):
                lines.append(fail(f"{exercise_id} has malformed common error entry"))
                continue
            for key in ["error", "anatomical_reason", "correction", "coaching_cue"]:
                if not text_value(error.get(key)):
                    lines.append(fail(f"{exercise_id} common error missing {key}"))

    quiz = lesson.get("quiz")
    if not quiz:
        lines.append(warn(f"{exercise_id} missing quiz"))

    if not any(line.level == "FAIL" for line in lines):
        lines.append(ok(f"{exercise_id} lesson valid"))
    return lines


def status_for_anatomy(result: AnatomyAuditResult) -> str:
    if (result.missing_required_fields or result.lessons_for_missing_exercise_ids
            or result.lessons_with_unmapped_body_regions):
        return "FAIL"
    if result.exercises_without_lessons or result.lessons_without_quiz or result.lessons_without_common_errors:
        return "WARN"
    return "OK"
