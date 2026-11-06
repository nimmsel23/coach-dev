from __future__ import annotations

from pathlib import Path

from .types import AuditBundle, AuditLine
from .exercises import status_for_exercises
from .aliases import status_for_aliases
from .coverage import status_for_coverage
from .anatomy import status_for_anatomy


def write_audit_report_path() -> Path:
    return Path("/tmp/Obsidian/Vitaltrainer/Fitness-Agent/audit_report.md")


def write_audit_report(bundle: AuditBundle) -> Path:
    path = write_audit_report_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_audit_report(bundle), encoding="utf-8")
    return path


def render_audit_report(bundle: AuditBundle) -> str:
    all_lines = (
        bundle.exercises.lines + bundle.aliases.lines
        + bundle.coverage.lines + bundle.anatomy.lines
    )
    sections = [
        "# Fitness Agent Audit Report",
        "",
        "## Summary",
        f"- Exercises: {status_for_exercises(bundle.exercises)}",
        f"- Aliases: {status_for_aliases(bundle.aliases)}",
        f"- Coverage: {status_for_coverage(bundle.coverage)}",
        f"- Anatomy: {status_for_anatomy(bundle.anatomy)}",
        f"- Overall: {bundle.overall_status}",
        "",
        "## Exercise Audit",
        f"- Total exercises: {bundle.exercises.total_exercises}",
        f"- By category: {bundle.exercises.exercises_by_category}",
        f"- Missing required fields: {bundle.exercises.missing_required_fields}",
        f"- Duplicate IDs: {bundle.exercises.duplicate_ids}",
        f"- Unknown categories: {bundle.exercises.unknown_categories}",
        f"- Empty primary muscles: {bundle.exercises.empty_primary_muscles}",
        f"- Empty coaching notes: {bundle.exercises.empty_coaching_notes}",
        f"- Empty common errors: {bundle.exercises.empty_common_errors}",
        "",
        "## Alias Audit",
        f"- Total canonical IDs: {bundle.aliases.total_canonical_ids}",
        f"- Total aliases: {bundle.aliases.total_aliases}",
        f"- Duplicate aliases: {bundle.aliases.duplicate_aliases}",
        f"- Aliases to missing exercise IDs: {bundle.aliases.aliases_pointing_to_missing_exercise_ids}",
        f"- Exercises without aliases: {bundle.aliases.exercises_without_aliases}",
        "",
        "## Coverage Audit",
        f"- Unmapped muscles: {bundle.coverage.unmapped_muscles}",
        f"- Unmapped body regions: {bundle.coverage.unmapped_body_regions}",
        f"- Unknown role weights: {bundle.coverage.unknown_role_weights}",
        f"- Exercises with unmapped primary muscles: {bundle.coverage.exercises_with_unmapped_primary_muscles}",
        f"- Exercises with unmapped secondary muscles: {bundle.coverage.exercises_with_unmapped_secondary_muscles}",
        f"- Exercises with unmapped stabilizers: {bundle.coverage.exercises_with_unmapped_stabilizers}",
        f"- Exercises with overbroad shoulder labels: {bundle.coverage.exercises_with_overbroad_shoulder_labels}",
        f"- Zero coverage exercises: {bundle.coverage.zero_coverage_exercises}",
        "",
        "## Anatomy Audit",
        f"- Total lessons: {bundle.anatomy.total_lessons}",
        f"- Lessons by region: {bundle.anatomy.lessons_by_region}",
        f"- Missing required fields: {bundle.anatomy.missing_required_fields}",
        f"- Lessons for missing exercise IDs: {bundle.anatomy.lessons_for_missing_exercise_ids}",
        f"- Exercises without lessons: {bundle.anatomy.exercises_without_lessons}",
        f"- Lessons without quiz: {bundle.anatomy.lessons_without_quiz}",
        f"- Lessons without common errors: {bundle.anatomy.lessons_without_common_errors}",
        f"- Lessons with unmapped body regions: {bundle.anatomy.lessons_with_unmapped_body_regions}",
        "",
        "## Warnings",
        _format_lines("WARN", all_lines),
        "",
        "## Failures",
        _format_lines("FAIL", all_lines),
        "",
        "## Recommended Fixes",
        "- Fix any failing audit entries first.",
        "- Add aliases for exercises without aliases if you want easier resolution coverage.",
        "- Add missing anatomy or coverage mappings only after confirming the canonical exercise entry.",
        "",
        "## Next Step",
        "- Review any WARN or FAIL lines and decide whether a fix pass is needed.",
    ]
    return "\n".join(section for section in sections if section is not None).strip() + "\n"


def _format_lines(level: str, lines: list[AuditLine]) -> str:
    items = [f"- {line.message}" for line in lines if line.level == level]
    return "\n".join(items) if items else "- None"
