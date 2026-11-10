from __future__ import annotations

from .exercises import audit_exercises, status_for_exercises
from .aliases import audit_aliases, status_for_aliases
from .coverage import audit_coverage, status_for_coverage
from .anatomy import audit_anatomy, status_for_anatomy
from .report import write_audit_report, write_audit_report_path
from .types import AuditBundle


def audit_all() -> AuditBundle:
    exercises = audit_exercises()
    aliases = audit_aliases()
    coverage = audit_coverage()
    anatomy = audit_anatomy()

    if any([
        exercises.missing_required_fields,
        exercises.duplicate_ids,
        exercises.unknown_categories,
        aliases.aliases_pointing_to_missing_exercise_ids,
        aliases.duplicate_aliases,
        coverage.unknown_role_weights,
        coverage.exercises_with_unmapped_primary_muscles,
        coverage.exercises_with_unmapped_secondary_muscles,
        coverage.exercises_with_unmapped_stabilizers,
        anatomy.missing_required_fields,
        anatomy.lessons_for_missing_exercise_ids,
        anatomy.lessons_with_unmapped_body_regions,
    ]):
        overall_status = "FAIL"
    elif any([
        exercises.empty_primary_muscles,
        exercises.empty_coaching_notes,
        exercises.empty_common_errors,
        aliases.exercises_without_aliases,
        coverage.unmapped_muscles,
        coverage.unmapped_body_regions,
        coverage.zero_coverage_exercises,
        anatomy.exercises_without_lessons,
        anatomy.lessons_without_quiz,
        anatomy.lessons_without_common_errors,
    ]):
        overall_status = "NEEDS_REVIEW"
    else:
        overall_status = "USABLE"

    return AuditBundle(
        exercises=exercises,
        aliases=aliases,
        coverage=coverage,
        anatomy=anatomy,
        overall_status=overall_status,
        report_path=write_audit_report_path(),
    )


def run_all_audits() -> int:
    from fitness.catalog.core.rich_utils import print_audit_bundle
    bundle = audit_all()
    print_audit_bundle(
        exercises_status=status_for_exercises(bundle.exercises),
        aliases_status=status_for_aliases(bundle.aliases),
        coverage_status=status_for_coverage(bundle.coverage),
        anatomy_status=status_for_anatomy(bundle.anatomy),
        overall_status=bundle.overall_status,
    )
    write_audit_report(bundle)
    return 1 if bundle.overall_status == "FAIL" else 0
