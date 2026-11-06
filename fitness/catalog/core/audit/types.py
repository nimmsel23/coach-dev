from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class AuditLine:
    level: str
    message: str


@dataclass
class AuditReport:
    lines: list[AuditLine]

    @property
    def ok_count(self) -> int:
        return sum(1 for line in self.lines if line.level == "OK")

    @property
    def warn_count(self) -> int:
        return sum(1 for line in self.lines if line.level == "WARN")

    @property
    def fail_count(self) -> int:
        return sum(1 for line in self.lines if line.level == "FAIL")

    @property
    def has_failures(self) -> bool:
        return self.fail_count > 0


@dataclass
class ExerciseAuditResult:
    total_exercises: int
    exercises_by_category: dict[str, int]
    missing_required_fields: list[str]
    duplicate_ids: list[str]
    unknown_categories: list[str]
    empty_primary_muscles: list[str]
    empty_coaching_notes: list[str]
    empty_common_errors: list[str]
    lines: list[AuditLine]
    samples: list[str]


@dataclass
class AliasAuditResult:
    total_canonical_ids: int
    total_aliases: int
    duplicate_aliases: list[str]
    aliases_pointing_to_missing_exercise_ids: list[str]
    exercises_without_aliases: list[str]
    lines: list[AuditLine]


@dataclass
class CoverageAuditResult:
    unmapped_muscles: list[str]
    unmapped_body_regions: list[str]
    unknown_role_weights: list[str]
    exercises_with_unmapped_primary_muscles: list[str]
    exercises_with_unmapped_secondary_muscles: list[str]
    exercises_with_unmapped_stabilizers: list[str]
    exercises_with_overbroad_shoulder_labels: list[str]
    zero_coverage_exercises: list[str]
    lines: list[AuditLine]


@dataclass
class AnatomyAuditResult:
    total_lessons: int
    lessons_by_region: dict[str, int]
    missing_required_fields: list[str]
    lessons_for_missing_exercise_ids: list[str]
    exercises_without_lessons: list[str]
    lessons_without_quiz: list[str]
    lessons_without_common_errors: list[str]
    lessons_with_unmapped_body_regions: list[str]
    lines: list[AuditLine]


@dataclass
class AuditBundle:
    exercises: ExerciseAuditResult
    aliases: AliasAuditResult
    coverage: CoverageAuditResult
    anatomy: AnatomyAuditResult
    overall_status: str
    report_path: Path


def ok(message: str) -> AuditLine:
    return AuditLine("OK", message)


def warn(message: str) -> AuditLine:
    return AuditLine("WARN", message)


def fail(message: str) -> AuditLine:
    return AuditLine("FAIL", message)
