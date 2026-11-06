from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import re
from typing import Any

import yaml

from fitness.catalog.coverage import calculate_coverage
from fitness.catalog.coach_sheet import build_coach_sheet, render_coach_sheet_markdown
from fitness.catalog.core.loader import load_catalog_yaml
from fitness.catalog.core.resolver import build_exercise_index, resolve_query
from fitness.catalog.agent.teaching import find_lesson, render_lesson_markdown
from fitness.catalog.weekly import build_weekly_coverage


@dataclass
class ExportWriteResult:
    path: Path
    used_fallback_name: bool
    overwritten: bool
    warning: str | None = None


def export_exercise_note(exercise_query: str, *, force: bool = False) -> ExportWriteResult:
    resolution = resolve_query(exercise_query)
    if not resolution.matched or not resolution.canonical_id:
        raise ValueError(f"Unknown exercise: {exercise_query}")

    record = find_exercise(resolution.canonical_id)
    if record is None:
        raise ValueError(f"Exercise not found: {resolution.canonical_id}")

    metadata = {
        "canonical_id": record.exercise_id,
        "german_name": record.german or record.display_name,
        "english_name": "",
        "category": record.source_file.removesuffix(".yml"),
        "movement_pattern": "",
        "equipment": [],
        "primary_muscles": record.primary_muscles or [],
        "secondary_muscles": record.secondary_muscles or [],
        "stabilizers": record.stabilizers or [],
        "variations": record.aliases or [],
        "coaching_notes": [],
        "common_errors": [],
        "tags": build_tags(record.source_file, record.exercise_id),
    }
    body = render_exercise_body(metadata)
    return write_obsidian_note(
        note_name=record.exercise_id,
        content=render_markdown(metadata, body),
        force=force,
    )


def export_coverage_note(exercise_query: str, sets: int, rpe: int, *, force: bool = False) -> ExportWriteResult:
    coverage = calculate_coverage(exercise_query, sets, rpe)
    metadata = {
        "exercise": coverage["exercise_id"],
        "sets": coverage["sets"],
        "rpe": coverage["rpe"],
        "muscle_scores": coverage["muscle_scores"],
        "body_region_scores": coverage["body_region_scores"],
        "unmapped_muscles": coverage["unmapped_muscles"],
    }
    body = render_coverage_body(coverage)
    note_name = f"{coverage['exercise_id']}-{sets}x{rpe}"
    return write_obsidian_note(
        note_name=note_name,
        content=render_markdown(metadata, body),
        force=force,
    )


def export_plan_note(plan: Any, *, force: bool = False) -> ExportWriteResult:
    template = plan_field(plan, "template")
    goal = plan_field(plan, "goal")
    slots = plan_field(plan, "slots", [])
    coverage_summary = plan_field(plan, "coverage_summary", {})
    split = plan_field(plan, "split")
    day = plan_field(plan, "day")

    template_label = pretty_title(str(template or "plan"))
    goal_label = pretty_title(str(goal or "general"))
    frontmatter = {
        "template": template,
        "goal": goal,
        "split": split,
        "day": day,
        "coverage_summary": coverage_summary,
    }
    body = render_plan_body(template_label, goal_label, slots, coverage_summary)
    note_name = f"{template or 'plan'}-{goal or 'general'}"
    return write_obsidian_note(
        note_name=note_name,
        content=render_markdown(frontmatter, body),
        force=force,
    )


def export_teach_note(exercise_id: str, *, mode: str = "trainer", force: bool = False) -> ExportWriteResult:
    lesson = find_lesson(exercise_id)
    if lesson is None:
        raise ValueError(f"Unknown anatomy lesson: {exercise_id}")
    body = render_lesson_markdown(lesson, mode=mode)
    record = find_exercise(exercise_id)
    note_stub = preferred_note_stub(
        german=(record.german if record else None),
        display_name=(record.display_name if record else exercise_id),
        english=(record.english if record else None),
        fallback=exercise_id,
    )
    note_name = f"Anatomy/{note_stub}"
    frontmatter = {
        "exercise_id": exercise_id,
        "mode": mode,
        "section": "anatomy_teaching",
    }
    return write_obsidian_note(
        note_name=note_name,
        content=render_markdown(frontmatter, body),
        force=force,
    )


def export_coach_sheet_note(exercise_query: str, *, force: bool = False) -> ExportWriteResult:
    sheet = build_coach_sheet(exercise_query)
    note_stub = preferred_note_stub(
        german=sheet.get("german"),
        display_name=sheet.get("display_name"),
        english=sheet.get("english"),
        fallback=sheet["exercise_id"],
    )
    note_name = f"Coach Sheets/{note_stub}"
    frontmatter = {
        "exercise_id": sheet["exercise_id"],
        "display_name": sheet["display_name"],
        "german": sheet["german"],
        "section": "coach_sheet",
    }
    return write_obsidian_note(
        note_name=note_name,
        content=render_markdown(frontmatter, render_coach_sheet_markdown(sheet)),
        force=force,
    )


def export_weekly_report_note(week_selector: str = "current", *, force: bool = False) -> tuple[dict[str, Any], ExportWriteResult]:
    weekly_coverage = build_weekly_coverage(week_selector)
    body = render_weekly_report_body(weekly_coverage)
    note_name = f"Reports/Weekly/{weekly_coverage['week']}"
    frontmatter = {
        "week": weekly_coverage["week"],
        "date_from": weekly_coverage["date_from"],
        "date_to": weekly_coverage["date_to"],
        "section": "weekly_coverage",
    }
    export_result = write_obsidian_note(
        note_name=note_name,
        content=render_markdown(frontmatter, body),
        force=force,
    )
    return weekly_coverage, export_result


def write_obsidian_note(note_name: str, content: str, *, force: bool) -> ExportWriteResult:
    export_dir = obsidian_export_dir()
    export_dir.mkdir(parents=True, exist_ok=True)

    target = export_dir / f"{note_name}.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    existed = target.exists()
    if target.exists() and not force:
        fallback = unique_timestamped_path(export_dir, note_name)
        fallback.write_text(content, encoding="utf-8")
        return ExportWriteResult(
            path=fallback,
            used_fallback_name=True,
            overwritten=False,
            warning=f"Preserved existing file {target.name}; wrote {fallback.name}",
        )

    target.write_text(content, encoding="utf-8")
    return ExportWriteResult(
        path=target,
        used_fallback_name=False,
        overwritten=existed and force,
        warning=None,
    )


def obsidian_export_dir() -> Path:
    config = load_runtime_config()
    obsidian = config.get("obsidian", {})
    if not isinstance(obsidian, dict):
        raise ValueError("config.yml obsidian section is invalid")
    export_path = obsidian.get("export_path")
    if not isinstance(export_path, str) or not export_path.strip():
        raise ValueError("config.yml obsidian.export_path is missing")
    return Path(export_path).expanduser()


def load_runtime_config() -> dict[str, Any]:
    config = load_catalog_yaml("config.yml")
    if not isinstance(config, dict):
        raise ValueError("config.yml is invalid")
    return config


def find_exercise(exercise_id: str):
    for record in build_exercise_index():
        if record.exercise_id == exercise_id:
            return record
    return None


def unique_timestamped_path(directory: Path, note_name: str) -> Path:
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    candidate = directory / f"{note_name}-{timestamp}.md"
    suffix = 1
    while candidate.exists():
        candidate = directory / f"{note_name}-{timestamp}-{suffix}.md"
        suffix += 1
    return candidate


def render_markdown(frontmatter: dict[str, Any], body: str) -> str:
    return "---\n" + yaml.safe_dump(frontmatter, sort_keys=False, allow_unicode=True).rstrip() + "\n---\n\n" + body.rstrip() + "\n"


def render_exercise_body(metadata: dict[str, Any]) -> str:
    lines = [
        f"# {metadata['german_name']}",
        "",
        "## Overview",
        f"- Canonical ID: {metadata['canonical_id']}",
        f"- German name: {metadata['german_name']}",
        f"- English name: {metadata['english_name']}",
        f"- Category: {metadata['category']}",
        f"- Movement pattern: {metadata['movement_pattern']}",
        f"- Equipment: {format_list(metadata['equipment'])}",
        "",
        "## Muscles",
        f"- Primary muscles: {format_list(metadata['primary_muscles'])}",
        f"- Secondary muscles: {format_list(metadata['secondary_muscles'])}",
        f"- Stabilizers: {format_list(metadata['stabilizers'])}",
        "",
        "## Notes",
        f"- Variations: {format_list(metadata['variations'])}",
        f"- Coaching notes: {format_list(metadata['coaching_notes'])}",
        f"- Common errors: {format_list(metadata['common_errors'])}",
        f"- Tags: {format_list(metadata['tags'])}",
    ]
    return "\n".join(lines)


def render_coverage_body(coverage: dict[str, Any]) -> str:
    lines = [
        f"# Coverage for {coverage['display_name']}",
        "",
        "## Summary",
        f"- Exercise: {coverage['exercise_id']}",
        f"- Sets: {coverage['sets']}",
        f"- RPE: {coverage['rpe']}",
        "",
        "## Muscle Scores",
    ]
    lines.extend(format_mapping_lines(coverage["muscle_scores"]))
    lines.extend(
        [
            "",
            "## Body Region Scores",
        ]
    )
    lines.extend(format_mapping_lines(coverage["body_region_scores"]))
    lines.extend(
        [
            "",
            "## Unmapped Muscles",
            f"- {format_list(coverage['unmapped_muscles'])}",
        ]
    )
    return "\n".join(lines)


def render_plan_body(template_label: str, goal_label: str, slots: list[dict[str, Any]], coverage_summary: dict[str, Any]) -> str:
    lines = [
        f"# {template_label} – {goal_label}",
        "",
        "## Übungen",
        "| # | Übung | Sätze | Wdh | RPE | Pause |",
        "|---|------|------|-----|-----|-------|",
    ]
    for index, slot in enumerate(slots, start=1):
        exercise = slot.get("selected_exercise") or ""
        sets = coverage_summary.get("sets", 1)
        rpe = coverage_summary.get("rpe", 8)
        lines.append(f"| {index} | {exercise} | {sets} | - | {rpe} | - |")

    lines.extend(
        [
            "",
            "## Coverage Summary",
            "```yaml",
            yaml.safe_dump(coverage_summary, sort_keys=False, allow_unicode=True).rstrip(),
            "```",
            "",
            "## Notes",
            f"- template: {template_label}",
            f"- goal: {goal_label}",
        ]
    )
    return "\n".join(lines)


def render_weekly_report_body(weekly_coverage: dict[str, Any]) -> str:
    lines = [
        f"# Weekly Coverage - {weekly_coverage['week']}",
        "",
        "## Summary",
        f"- Week: {weekly_coverage['week']}",
        f"- Date range: {weekly_coverage['date_from']} to {weekly_coverage['date_to']}",
        f"- Entries: {weekly_coverage['entries_count']}",
        f"- Workouts: {format_list(weekly_coverage['workout_ids'])}",
        "",
        "## Body Region Scores",
    ]
    lines.extend(format_mapping_lines(weekly_coverage["body_region_scores"]))
    lines.extend(
        [
            "",
            "## Muscle Scores",
        ]
    )
    lines.extend(format_mapping_lines(weekly_coverage["muscle_scores"]))
    lines.extend(
        [
            "",
            "## Missing Regions",
            f"- {format_list(weekly_coverage['missing_regions'])}",
            "",
            "## Low Regions",
            f"- {format_list(weekly_coverage['low_regions'])}",
            "",
            "## High Regions",
            f"- {format_list(weekly_coverage['high_regions'])}",
            "",
            "## Recommendations",
        ]
    )
    lines.extend([f"- {item}" for item in weekly_coverage["recommendations"]])
    lines.extend(
        [
            "",
            "## Unmapped Muscles",
            f"- {format_list(weekly_coverage['unmapped_muscles'])}",
        ]
    )
    return "\n".join(lines)


def format_mapping_lines(mapping: dict[str, Any]) -> list[str]:
    if not mapping:
        return ["- None"]
    return [f"- {key}: {value}" for key, value in mapping.items()]


def format_list(values: list[Any]) -> str:
    if not values:
        return "[]"
    return ", ".join(str(value) for value in values)


def build_tags(source_file: str, exercise_id: str) -> list[str]:
    category = source_file.removesuffix(".yml")
    tags = [exercise_id]
    if category:
        tags.append(category)
    return tags


def pretty_title(text: str) -> str:
    return text.replace("_", " ").strip().title()


def slugify_note_name(value: str | None) -> str:
    text = (value or "").strip().casefold()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def preferred_note_stub(*, german: str | None, display_name: str | None, english: str | None, fallback: str) -> str:
    for candidate in (german, display_name, english, fallback):
        slug = slugify_note_name(candidate)
        if slug:
            return slug
    return slugify_note_name(fallback) or "exercise"


def plan_field(plan: Any, field_name: str, default: Any = None) -> Any:
    if isinstance(plan, dict):
        return plan.get(field_name, default)
    return getattr(plan, field_name, default)
