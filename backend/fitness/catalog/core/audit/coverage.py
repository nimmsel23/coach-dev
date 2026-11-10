from __future__ import annotations

import re

from fitness.catalog.coverage import (
    calculate_coverage,
    load_coverage_rules,
    load_muscle_region_index,
    load_muscle_taxonomy,
    normalize_muscle_id,
)
from fitness.catalog.core.resolver import build_exercise_index
from .loaders import load_body_regions
from .types import AuditLine, AuditReport, CoverageAuditResult, ok, warn, fail
from .utils import muscle_regions

OVERBROAD_SHOULDER_LABELS = {"shoulders", "300_shoulders"}
SHOULDER_SPECIFIC_NAME_PATTERNS = [
    re.compile(r"front raise|frontheben", re.I),
    re.compile(r"lateral raise|side raise|seitheben", re.I),
    re.compile(r"rear|reverse|posterior|rear delt|face.?pull|hintere schulter|vorgebeugt", re.I),
    re.compile(r"external rotation|internal rotation|au(ss|ß)enrotation|innenrotation|rotator ?cuff", re.I),
]


def has_overbroad_shoulder_label(exercise) -> bool:
    primary = set(exercise.primary_muscles or [])
    if not primary.intersection(OVERBROAD_SHOULDER_LABELS):
        return False
    name = f"{exercise.display_name or ''} {exercise.german or ''} {exercise.english or ''}"
    return any(pattern.search(name) for pattern in SHOULDER_SPECIFIC_NAME_PATTERNS)


def run_coverage_audit() -> AuditReport:
    lines: list[AuditLine] = []
    exercise_index = build_exercise_index()
    taxonomy = load_muscle_taxonomy()
    region_index = load_muscle_region_index()
    rules = load_coverage_rules()

    role_weights = rules.get("role_weights", {})
    if not isinstance(role_weights, dict):
        role_weights = {}
    for role in ["primary", "secondary", "stabilizer", "minor"]:
        if role in role_weights and isinstance(role_weights[role], (int, float)):
            lines.append(ok(f"role weight present: {role}"))
        else:
            lines.append(fail(f"missing role weight: {role}"))

    effort_factors = rules.get("effort_factors_by_rpe", {})
    if not isinstance(effort_factors, dict):
        effort_factors = {}
    for rpe in range(6, 11):
        factor = effort_factors.get(rpe, effort_factors.get(str(rpe)))
        if isinstance(factor, (int, float)):
            lines.append(ok(f"effort factor present: {rpe}"))
        else:
            lines.append(fail(f"missing effort factor for rpe {rpe}"))

    body_regions = load_body_regions()
    zero_coverage: list[str] = []
    overbroad_shoulder_exercises: list[str] = []

    for exercise in exercise_index:
        exercise_failures: list[str] = []
        if has_overbroad_shoulder_label(exercise):
            overbroad_shoulder_exercises.append(exercise.exercise_id)
            exercise_failures.append(f"{exercise.exercise_id} uses overbroad shoulder label for a shoulder-specific exercise")
        for muscle in (exercise.primary_muscles or []):
            norm_id = normalize_muscle_id(muscle)
            if norm_id not in taxonomy:
                exercise_failures.append(f"{exercise.exercise_id} unknown primary muscle: {muscle}")
            elif not muscle_regions(norm_id, region_index):
                exercise_failures.append(f"{exercise.exercise_id} primary muscle has no body region: {muscle}")
        for muscle in (exercise.secondary_muscles or []):
            norm_id = normalize_muscle_id(muscle)
            if norm_id not in taxonomy:
                exercise_failures.append(f"{exercise.exercise_id} unknown secondary muscle: {muscle}")
            elif not muscle_regions(norm_id, region_index):
                exercise_failures.append(f"{exercise.exercise_id} secondary muscle has no body region: {muscle}")
        for muscle in (exercise.stabilizers or []):
            norm_id = normalize_muscle_id(muscle)
            if norm_id not in taxonomy:
                exercise_failures.append(f"{exercise.exercise_id} unknown stabilizer: {muscle}")
            elif not muscle_regions(norm_id, region_index):
                exercise_failures.append(f"{exercise.exercise_id} stabilizer has no body region: {muscle}")

        try:
            sample = calculate_coverage(
                exercise.exercise_id, 1, 8,
                records=exercise_index, taxonomy=taxonomy, region_index=region_index, rules=rules,
            )
        except Exception as exc:
            lines.append(fail(f"{exercise.exercise_id} sample coverage crashed: {exc}"))
            continue

        if not any(sample["muscle_scores"].values()):
            zero_coverage.append(exercise.exercise_id)

        for muscle_id, score in sample["muscle_scores"].items():
            if score > 0 and muscle_id in taxonomy and not muscle_regions(muscle_id, region_index):
                exercise_failures.append(f"{exercise.exercise_id} muscle has no body region: {muscle_id}")

        if body_regions is not None:
            for region in sample["body_region_scores"].keys():
                if region not in body_regions:
                    exercise_failures.append(f"{exercise.exercise_id} unknown body region: {region}")

        if exercise_failures:
            for message in exercise_failures:
                lines.append(fail(message))
        else:
            lines.append(ok(f"{exercise.exercise_id} coverage valid"))

    if zero_coverage:
        lines.append(warn("zero coverage exercises: " + ", ".join(sorted(zero_coverage))))
    else:
        lines.append(ok("no zero coverage exercises"))

    if overbroad_shoulder_exercises:
        lines.append(fail("overbroad shoulder labels: " + ", ".join(sorted(set(overbroad_shoulder_exercises)))))
    else:
        lines.append(ok("no overbroad shoulder labels"))

    return AuditReport(lines)


def audit_coverage() -> CoverageAuditResult:
    exercise_index = build_exercise_index()
    taxonomy = load_muscle_taxonomy()
    region_index = load_muscle_region_index()
    rules = load_coverage_rules()
    body_regions = load_body_regions()

    unknown_role_weights: list[str] = []
    role_weights = rules.get("role_weights", {})
    if not isinstance(role_weights, dict):
        role_weights = {}
    for role in ["primary", "secondary", "stabilizer", "minor"]:
        if role not in role_weights or not isinstance(role_weights[role], (int, float)):
            unknown_role_weights.append(role)

    unmapped_muscles = sorted(
        {
            muscle
            for exercise in exercise_index
            for muscle in (exercise.primary_muscles or []) + (exercise.secondary_muscles or []) + (exercise.stabilizers or [])
            if normalize_muscle_id(muscle) not in taxonomy
        }
    )

    exercises_with_unmapped_primary_muscles: list[str] = []
    exercises_with_unmapped_secondary_muscles: list[str] = []
    exercises_with_unmapped_stabilizers: list[str] = []
    exercises_with_overbroad_shoulder_labels: list[str] = []
    zero_coverage_exercises: list[str] = []
    lines: list[AuditLine] = []

    for exercise in exercise_index:
        if has_overbroad_shoulder_label(exercise):
            exercises_with_overbroad_shoulder_labels.append(exercise.exercise_id)
            lines.append(fail(f"{exercise.exercise_id} uses overbroad shoulder label for a shoulder-specific exercise"))
        if any(normalize_muscle_id(muscle) not in taxonomy for muscle in (exercise.primary_muscles or [])):
            exercises_with_unmapped_primary_muscles.append(exercise.exercise_id)
        if any(normalize_muscle_id(muscle) not in taxonomy for muscle in (exercise.secondary_muscles or [])):
            exercises_with_unmapped_secondary_muscles.append(exercise.exercise_id)
        if any(normalize_muscle_id(muscle) not in taxonomy for muscle in (exercise.stabilizers or [])):
            exercises_with_unmapped_stabilizers.append(exercise.exercise_id)
        try:
            sample = calculate_coverage(
                exercise.exercise_id, 1, 8,
                records=exercise_index, taxonomy=taxonomy, region_index=region_index, rules=rules,
            )
        except Exception as exc:
            lines.append(fail(f"{exercise.exercise_id} sample coverage crashed: {exc}"))
            continue
        if not any(sample["muscle_scores"].values()):
            zero_coverage_exercises.append(exercise.exercise_id)
        if body_regions is not None:
            for region in sample["body_region_scores"].keys():
                if region not in body_regions:
                    lines.append(fail(f"{exercise.exercise_id} unknown body region: {region}"))
        lines.append(ok(f"{exercise.exercise_id} coverage valid"))

    unmapped_body_regions = sorted(
        {
            region
            for exercise in exercise_index
            for muscle in (exercise.primary_muscles or []) + (exercise.secondary_muscles or []) + (exercise.stabilizers or [])
            for region in muscle_regions(normalize_muscle_id(muscle), region_index)
            if body_regions is not None and region not in body_regions
        }
    )

    return CoverageAuditResult(
        unmapped_muscles=unmapped_muscles,
        unmapped_body_regions=unmapped_body_regions,
        unknown_role_weights=unknown_role_weights,
        exercises_with_unmapped_primary_muscles=sorted(set(exercises_with_unmapped_primary_muscles)),
        exercises_with_unmapped_secondary_muscles=sorted(set(exercises_with_unmapped_secondary_muscles)),
        exercises_with_unmapped_stabilizers=sorted(set(exercises_with_unmapped_stabilizers)),
        exercises_with_overbroad_shoulder_labels=sorted(set(exercises_with_overbroad_shoulder_labels)),
        zero_coverage_exercises=sorted(set(zero_coverage_exercises)),
        lines=lines,
    )


def status_for_coverage(result: CoverageAuditResult) -> str:
    if (result.unknown_role_weights or result.exercises_with_unmapped_primary_muscles
            or result.exercises_with_unmapped_secondary_muscles or result.exercises_with_unmapped_stabilizers
            or result.exercises_with_overbroad_shoulder_labels):
        return "FAIL"
    if result.unmapped_muscles or result.unmapped_body_regions or result.zero_coverage_exercises:
        return "WARN"
    return "OK"
