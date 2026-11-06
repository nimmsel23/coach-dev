from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from fitness.catalog.coverage import calculate_coverage
from fitness.catalog.core.loader import load_catalog_yaml
from fitness.catalog.core.resolver import build_exercise_index


@dataclass
class PlanResult:
    template: str
    split: str | None
    day: str | None
    goal: str | None
    slots: list[dict[str, Any]]
    coverage_summary: dict[str, Any]
    exercises: list[dict[str, Any]]


def build_plan(*, template: str | None = None, split: str | None = None, day: str | None = None, goal: str | None = None) -> PlanResult:
    rules = load_program_rules()
    template_name = resolve_template_name(template=template, split=split, day=day, rules=rules)
    template_def = find_template(template_name, rules)
    if template_def is None:
        raise ValueError(f"Unknown plan template: {template_name}")

    records = build_exercise_index()
    records_by_id = {record.exercise_id: record for record in records}
    exercise_ids = set(records_by_id)
    selected_ids: set[str] = set()
    slots = build_slots(template_def, exercise_ids, selected_ids)
    coverage_summary = build_coverage_summary(slots, rules, records=records)
    exercises = [
        exercise_record_to_frontend_dict(records_by_id[exercise_id])
        for exercise_id in (slot["selected_exercise"] for slot in slots)
        if exercise_id and exercise_id in records_by_id
    ]
    return PlanResult(
        template=template_name,
        split=split,
        day=day,
        goal=goal,
        slots=slots,
        coverage_summary=coverage_summary,
        exercises=exercises,
    )


def exercise_record_to_frontend_dict(record: Any) -> dict[str, Any]:
    """Mirrort die Firestore-Plan-Shape (src/lib/db/firestore/sessions.js::getPlanSuggestion),
    damit AssignPlan.jsx/ExerciseChecklist.jsx dieselben Felder (inkl. yuhonas_id
    fuer Bild-Thumbnails) bekommen, egal ob lokal oder Firestore-Backend."""
    yuhonas_id = record.yuhonas_id or ((record.external_ids or {}).get("yuhonas") or [None])[0]
    return {
        "id": record.exercise_id,
        "name": record.display_name,
        "primaryMuscles": record.primary_muscles or [],
        "secondaryMuscles": record.secondary_muscles or [],
        "yuhonas_id": yuhonas_id,
    }


@dataclass
class WeekResult:
    split: str
    label: str
    days: dict[str, PlanResult | None]


def build_week(*, split: str | None = None) -> WeekResult:
    rules = load_program_rules()
    splits = rules.get("splits", {})
    if not isinstance(splits, dict):
        raise ValueError("program_rules.yml hat keine splits-Sektion")

    split_name = (split or "").strip() or rules.get("default_program")
    if not isinstance(split_name, str) or not split_name.strip():
        raise ValueError("Kein split angegeben und kein default_program gesetzt")
    split_def = splits.get(split_name)
    if not isinstance(split_def, dict):
        raise ValueError(f"Unknown split: {split_name}")

    days_def = split_def.get("days", {})
    days: dict[str, PlanResult | None] = {}
    for day_key, template_name in (days_def.items() if isinstance(days_def, dict) else []):
        if not template_name:
            days[day_key] = None
            continue
        days[day_key] = build_plan(template=template_name)

    return WeekResult(split=split_name, label=split_def.get("label", split_name), days=days)


def load_program_rules() -> dict[str, Any]:
    rules = load_catalog_yaml("rules/program_rules.yml")
    if isinstance(rules, dict):
        section = rules.get("program_rules", rules)
        if isinstance(section, dict):
            return section
    raise ValueError("program_rules.yml is invalid")


def resolve_template_name(*, template: str | None, split: str | None, day: str | None, rules: dict[str, Any]) -> str:
    if template and template.strip():
        return template.strip()
    if day and day.strip():
        return f"{day.strip()}_day"
    default_template = rules.get("default_template")
    if isinstance(default_template, str) and default_template.strip():
        return default_template.strip()
    raise ValueError("No plan template provided")


def find_template(template_name: str, rules: dict[str, Any]) -> dict[str, Any] | None:
    templates = rules.get("templates", {})
    if not isinstance(templates, dict):
        return None
    template = templates.get(template_name)
    return template if isinstance(template, dict) else None


def build_slots(template_def: dict[str, Any], exercise_ids: set[str], selected_ids: set[str]) -> list[dict[str, Any]]:
    raw_slots = template_def.get("slots", [])
    if not isinstance(raw_slots, list):
        return []

    slots: list[dict[str, Any]] = []
    for slot in raw_slots:
        if not isinstance(slot, dict):
            continue
        name = slot.get("name")
        choose_from = slot.get("choose_from", [])
        if not isinstance(name, str) or not name.strip():
            continue
        if not isinstance(choose_from, list):
            choose_from = []
        available = [candidate for candidate in choose_from if isinstance(candidate, str) and candidate in exercise_ids and candidate not in selected_ids]
        selected = available[0] if available else None
        if selected:
            selected_ids.add(selected)
        slots.append(
            {
                "name": name,
                "choose_from": [candidate for candidate in choose_from if isinstance(candidate, str)],
                "selected_exercise": selected,
            }
        )
    return slots


def build_coverage_summary(
    slots: list[dict[str, Any]], rules: dict[str, Any], *, records: list | None = None
) -> dict[str, Any]:
    from fitness.catalog.coverage import (
        load_coverage_rules, load_muscle_region_index, load_muscle_taxonomy,
    )

    records = records if records is not None else build_exercise_index()
    taxonomy = load_muscle_taxonomy()
    region_index = load_muscle_region_index()
    coverage_rules = load_coverage_rules()
    coverage_defaults = rules.get("coverage_defaults", {})
    default_sets = 1
    default_rpe = 8
    if isinstance(coverage_defaults, dict):
        if isinstance(coverage_defaults.get("sets"), int):
            default_sets = coverage_defaults["sets"]
        if isinstance(coverage_defaults.get("rpe"), int):
            default_rpe = coverage_defaults["rpe"]

    selected_exercises = [slot["selected_exercise"] for slot in slots if slot.get("selected_exercise")]
    muscle_scores: dict[str, float] = defaultdict(float)
    body_region_scores: dict[str, float] = defaultdict(float)
    unmapped_muscles: set[str] = set()
    selected_details: list[dict[str, Any]] = []

    for exercise_id in selected_exercises:
        coverage = calculate_coverage(
            exercise_id, default_sets, default_rpe,
            records=records, taxonomy=taxonomy, region_index=region_index, rules=coverage_rules,
        )
        selected_details.append(
            {
                "exercise": coverage["exercise_id"],
                "sets": coverage["sets"],
                "rpe": coverage["rpe"],
            }
        )
        for muscle_id, score in coverage["muscle_scores"].items():
            muscle_scores[muscle_id] += score
        for region, score in coverage["body_region_scores"].items():
            body_region_scores[region] += score
        unmapped_muscles.update(coverage["unmapped_muscles"])

    return {
        "sets": default_sets,
        "rpe": default_rpe,
        "selected_exercises": selected_details,
        "muscle_scores": dict(sorted(muscle_scores.items())),
        "body_region_scores": dict(sorted(body_region_scores.items())),
        "unmapped_muscles": sorted(unmapped_muscles),
    }
