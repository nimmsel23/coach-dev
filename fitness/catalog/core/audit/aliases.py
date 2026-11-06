from __future__ import annotations

from fitness.catalog.core.resolver import build_exercise_index, normalize_text
from .loaders import load_aliases_document
from .types import AuditLine, AliasAuditResult, AuditReport, ok, warn, fail


def run_aliases_audit() -> AuditReport:
    lines: list[AuditLine] = []
    exercise_index = build_exercise_index()
    exercise_ids = {record.exercise_id for record in exercise_index}

    lines.append(ok(f"Loaded {len(exercise_ids)} exercise records from index"))

    normalized_alias_to_id: dict[str, str] = {}
    raw_alias_groups: dict[str, list[tuple[str, str]]] = {}
    missing_aliases: list[str] = []

    # 1. Collect aliases from actual ExerciseRecords (german, english, aliases list)
    for record in exercise_index:
        rec_aliases: list[str] = []
        if getattr(record, "german", None):
            rec_aliases.append(record.german)
        if getattr(record, "english", None):
            rec_aliases.append(record.english)
        if getattr(record, "aliases", None) and isinstance(record.aliases, list):
            rec_aliases.extend(record.aliases)

        if not rec_aliases:
            missing_aliases.append(record.exercise_id)

        for alias in rec_aliases:
            if not isinstance(alias, str) or not alias.strip():
                continue
            normalized = normalize_text(alias)
            raw_alias_groups.setdefault(normalized, []).append((alias, record.exercise_id))

            if normalized in normalized_alias_to_id and normalized_alias_to_id[normalized] != record.exercise_id:
                lines.append(
                    warn(
                        f"Alias collision between exercises: '{alias}' ({normalized}) maps to both "
                        f"{normalized_alias_to_id[normalized]} and {record.exercise_id}"
                    )
                )
                continue
            normalized_alias_to_id[normalized] = record.exercise_id

    # 2. Check legacy aliases.yml if present
    alias_document = load_aliases_document()
    if alias_document:
        lines.append(ok("legacy aliases.yml parsed"))
        raw_aliases = alias_document.get("aliases", alias_document)
        if isinstance(raw_aliases, dict):
            for alias, canonical_id in raw_aliases.items():
                if isinstance(alias, str) and isinstance(canonical_id, str):
                    if canonical_id not in exercise_ids:
                        lines.append(warn(f"legacy alias.yml entry '{alias}' points to unmapped ID '{canonical_id}'"))

    if missing_aliases:
        lines.append(warn(f"Exercises without aliases/german/english: {', '.join(sorted(missing_aliases))}"))
    else:
        lines.append(ok("Every exercise record has valid name/alias entries"))

    if not any(line.level == "FAIL" for line in lines):
        lines.append(ok("Aliases audit complete"))
    return AuditReport(lines)


def audit_aliases() -> AliasAuditResult:
    exercise_index = build_exercise_index()
    exercise_ids = {record.exercise_id for record in exercise_index}

    duplicate_aliases: list[str] = []
    aliases_pointing_to_missing_exercise_ids: list[str] = []
    normalized_map: dict[str, str] = {}
    normalized_groups: dict[str, list[tuple[str, str]]] = {}
    alias_owner_count: dict[str, int] = {exercise_id: 0 for exercise_id in exercise_ids}
    lines: list[AuditLine] = [ok("Index loaded for alias audit")]

    total_alias_count = 0

    # Primary check: ExerciseRecords in index
    for record in exercise_index:
        rec_aliases: list[str] = []
        if getattr(record, "german", None):
            rec_aliases.append(record.german)
        if getattr(record, "english", None):
            rec_aliases.append(record.english)
        if getattr(record, "aliases", None) and isinstance(record.aliases, list):
            rec_aliases.extend(record.aliases)

        for alias in rec_aliases:
            if not isinstance(alias, str) or not alias.strip():
                continue
            total_alias_count += 1
            alias_owner_count[record.exercise_id] += 1
            normalized = normalize_text(alias)
            normalized_groups.setdefault(normalized, []).append((alias, record.exercise_id))

            if normalized in normalized_map and normalized_map[normalized] != record.exercise_id:
                duplicate_aliases.append(f"{normalized} ({normalized_map[normalized]} vs {record.exercise_id})")
            normalized_map[normalized] = record.exercise_id

    # Secondary check: legacy aliases.yml
    alias_document = load_aliases_document()
    if alias_document:
        raw_aliases = alias_document.get("aliases", alias_document)
        if isinstance(raw_aliases, dict):
            for alias, canonical_id in raw_aliases.items():
                if isinstance(alias, str) and isinstance(canonical_id, str):
                    if canonical_id not in exercise_ids:
                        aliases_pointing_to_missing_exercise_ids.append(f"{alias}->{canonical_id}")

    exercises_without_aliases = sorted([ex_id for ex_id, count in alias_owner_count.items() if count == 0])

    return AliasAuditResult(
        total_canonical_ids=len(exercise_ids),
        total_aliases=total_alias_count,
        duplicate_aliases=sorted(set(duplicate_aliases)),
        aliases_pointing_to_missing_exercise_ids=sorted(set(aliases_pointing_to_missing_exercise_ids)),
        exercises_without_aliases=exercises_without_aliases,
        lines=lines,
    )


def status_for_aliases(result: AliasAuditResult) -> str:
    if result.duplicate_aliases:
        return "FAIL"
    if result.exercises_without_aliases or result.aliases_pointing_to_missing_exercise_ids:
        return "WARN"
    return "OK"

