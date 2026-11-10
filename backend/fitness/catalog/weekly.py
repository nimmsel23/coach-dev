from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any
import re

from fitness.catalog.coverage import calculate_coverage, load_muscle_region_index, load_muscle_taxonomy
from fitness.catalog.history import read_history_range


LOW_REGION_THRESHOLD = 3.0
HIGH_REGION_THRESHOLD = 6.0


def build_weekly_coverage(week_selector: str = "current") -> dict[str, Any]:
    week = resolve_week_selector(week_selector)
    entries = read_history_range(week["date_from"], week["date_to"])

    muscle_scores: dict[str, float] = defaultdict(float)
    body_region_scores: dict[str, float] = defaultdict(float)
    unmapped_muscles: set[str] = set()

    for entry in entries:
        coverage = calculate_entry_coverage(entry)
        # muscle_scores ist bereits auf Eltern-Muskeln hochgerechnet
        # (add_role_scores() in coverage.py wendet parent_map direkt beim
        # Score-Eintrag an) — 601a_rectus_femoris zählt hier automatisch auf
        # 601_quadriceps_femoris. Granulare Kopf-Ebene bleibt separat in
        # detail_muscle_scores verfügbar, für die Wochenübersicht aber nicht
        # gebraucht (kein Vermischen der beiden Ebenen in einem Feld).
        for muscle_id, score in coverage["muscle_scores"].items():
            muscle_scores[muscle_id] += score
        for region, score in coverage["body_region_scores"].items():
            body_region_scores[region] += score
        unmapped_muscles.update(coverage["unmapped_muscles"])

    all_regions = sorted(all_body_regions())
    missing_regions = [region for region in all_regions if body_region_scores.get(region, 0.0) <= 0]
    low_regions = [region for region in all_regions if 0 < body_region_scores.get(region, 0.0) < LOW_REGION_THRESHOLD]
    high_regions = [region for region in all_regions if body_region_scores.get(region, 0.0) >= HIGH_REGION_THRESHOLD]

    recommendations = build_recommendations(missing_regions, low_regions, high_regions, entries)

    return {
        "week": week["label"],
        "date_from": week["date_from"],
        "date_to": week["date_to"],
        "entries_count": len(entries),
        "workout_ids": unique_workout_ids(entries),
        "body_region_scores": dict(sorted(body_region_scores.items())),
        "muscle_scores": dict(sorted(muscle_scores.items())),
        "missing_regions": missing_regions,
        "low_regions": low_regions,
        "high_regions": high_regions,
        "recommendations": recommendations,
        "unmapped_muscles": sorted(unmapped_muscles),
    }


def calculate_entry_coverage(entry: dict[str, Any]) -> dict[str, Any]:
    return calculate_coverage(entry["exercise_id"], int(entry["sets"]), int(entry["rpe"]))


def resolve_week_selector(week_selector: str) -> dict[str, str]:
    selector = (week_selector or "current").strip()
    if selector == "current":
        today = datetime.now().date()
        iso_year, iso_week, _ = today.isocalendar()
        return iso_week_bounds(iso_year, iso_week)

    match = re.fullmatch(r"(?P<year>\d{4})-W?(?P<week>\d{2})", selector)
    if not match:
        raise ValueError(f"Invalid week selector: {week_selector}")

    year = int(match.group("year"))
    week = int(match.group("week"))
    return iso_week_bounds(year, week)


def iso_week_bounds(year: int, week: int) -> dict[str, str]:
    start = date.fromisocalendar(year, week, 1)
    end = start + timedelta(days=6)
    return {
        "label": f"{year:04d}-W{week:02d}",
        "date_from": start.isoformat(),
        "date_to": end.isoformat(),
    }


def all_body_regions() -> set[str]:
    regions: set[str] = set()
    taxonomy = load_muscle_taxonomy()
    for muscle in taxonomy.values():
        region = muscle.get("body_region")
        if isinstance(region, str) and region.strip():
            regions.add(region.strip())

    for region in load_muscle_region_index().values():
        regions.add(region)
    return regions


def unique_workout_ids(entries: list[dict[str, Any]]) -> list[str]:
    return sorted({str(entry.get("workout_id", "")).strip() for entry in entries if str(entry.get("workout_id", "")).strip()})


def build_recommendations(
    missing_regions: list[str],
    low_regions: list[str],
    high_regions: list[str],
    entries: list[dict[str, Any]],
) -> list[str]:
    recommendations: list[str] = []
    if not entries:
        return ["Log at least one workout in the selected week."]

    if missing_regions:
        recommendations.append(f"Add work for missing regions: {', '.join(missing_regions)}.")
    if low_regions:
        recommendations.append(f"Bring up low regions gradually: {', '.join(low_regions)}.")
    if high_regions:
        recommendations.append(f"Maintain or reduce volume for high regions: {', '.join(high_regions)}.")
    if not recommendations:
        recommendations.append("Coverage looks balanced for this week.")
    return recommendations
