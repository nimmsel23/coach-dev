from __future__ import annotations

from fitness.catalog.core.resolver import build_exercise_index
from .types import AuditLine, ExerciseAuditResult, ok


def audit_exercises() -> ExerciseAuditResult:
    exercise_index = build_exercise_index()
    seen_ids: set[str] = set()
    exercises_by_category: dict[str, int] = {}
    missing_required_fields: list[str] = []
    duplicate_ids: list[str] = []
    unknown_categories: list[str] = []
    empty_primary_muscles: list[str] = []
    empty_coaching_notes: list[str] = []
    empty_common_errors: list[str] = []
    lines: list[AuditLine] = []
    samples: list[str] = []

    known_categories = {
        "chest", "back", "shoulders", "arms", "legs", "core",
        "quadriceps", "hamstrings", "triceps-surae", "none",
        "bulk", "expert", "inbox"
    }
    required_fields = [
        "display_name", "german", "category", "equipment",
        "primary_muscles", "coaching_notes", "common_errors",
    ]

    for record in exercise_index:
        exercise_id = record.exercise_id
        if exercise_id in seen_ids:
            duplicate_ids.append(exercise_id)
        seen_ids.add(exercise_id)

        categories = record.categories if record.categories else ["none"]
        for cat in categories:
            exercises_by_category[cat] = exercises_by_category.get(cat, 0) + 1
            if cat not in known_categories and not cat.isdigit():
                unknown_categories.append(f"{exercise_id}:{cat}")

        if record.source == "expert":
            if not record.primary_muscles:
                empty_primary_muscles.append(exercise_id)
            if not record.coaching_notes:
                empty_coaching_notes.append(exercise_id)
            if not record.common_errors:
                empty_common_errors.append(exercise_id)
            for field in required_fields:
                value = getattr(record, field)
                if value in (None, "", []):
                    missing_required_fields.append(f"{exercise_id}.{field}")

        samples.append(exercise_id)
        lines.append(ok(f"{exercise_id} exercise valid"))

    return ExerciseAuditResult(
        total_exercises=len(seen_ids),
        exercises_by_category=dict(sorted(exercises_by_category.items())),
        missing_required_fields=sorted(set(missing_required_fields)),
        duplicate_ids=sorted(set(duplicate_ids)),
        unknown_categories=sorted(set(unknown_categories)),
        empty_primary_muscles=sorted(set(empty_primary_muscles)),
        empty_coaching_notes=sorted(set(empty_coaching_notes)),
        empty_common_errors=sorted(set(empty_common_errors)),
        lines=lines,
        samples=samples[:5],
    )


def status_for_exercises(result: ExerciseAuditResult) -> str:
    if result.missing_required_fields or result.duplicate_ids or result.unknown_categories:
        return "FAIL"
    if result.empty_primary_muscles or result.empty_coaching_notes or result.empty_common_errors:
        return "WARN"
    return "OK"
