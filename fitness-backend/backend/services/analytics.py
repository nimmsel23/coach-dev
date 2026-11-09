"""Auswertung pro UID direkt aus den Session-JSONs.

Bewusst NICHT über die SQLite-History (`training_history`): die hat keine UID-Spalte,
Zeilen mehrerer Klienten kollidieren dort auf UNIQUE(date, session_id, exercise_id)
und die Wochenauswertung würde alle Nutzer vermischen.
Die Fachlogik (Muskel-Scores, Regionen, Empfehlungen) kommt unverändert aus fitness.catalog.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date as _date
from functools import lru_cache
from typing import Any

from backend.core.store import SessionStore


class InvalidRange(ValueError):
    pass


def _resources() -> dict[str, Any]:
    """KB-Daten (Übungsindex, Taxonomie, Regionen, Regeln); neu geladen, sobald sich die KB-Dateien ändern."""
    from backend.catalog.index import kb_fingerprint

    return _load_resources(kb_fingerprint())


@lru_cache(maxsize=1)
def _load_resources(_kb_fingerprint: str) -> dict[str, Any]:
    from backend.catalog.index import get_records
    from fitness.catalog.coverage import load_coverage_rules, load_muscle_region_index, load_muscle_taxonomy

    return {
        # lokale Records (identisch zu build_exercise_index) + yuhonas direkt für lokal unbekannte IDs
        "records": get_records(include_yuhonas=True),
        "taxonomy": load_muscle_taxonomy(),
        "region_index": load_muscle_region_index(),
        "rules": load_coverage_rules(),
    }


def reset_cache() -> None:
    _load_resources.cache_clear()


def _entries(store: SessionStore, uid: str, date_from: str, date_to: str) -> tuple[list[dict], int]:
    """Flache Übungs-Einträge (wie die History-Zeilen) + Anzahl Sessions im Zeitraum."""
    from fitness.catalog.core.session_signal import exercise_has_training_signal, training_values

    entries: list[dict] = []
    sessions = 0
    for doc_id in sorted(store.list_ids(uid)):
        data, _err = store.read(uid, doc_id)
        if data is None:
            continue
        day = str(data.get("date") or doc_id.split("__")[0])
        if not (date_from <= day <= date_to):
            continue
        sessions += 1
        sid = doc_id.split("__")[1] if "__" in doc_id else ""
        for ex in data.get("exercises") or []:
            if not isinstance(ex, dict) or not exercise_has_training_signal(ex):
                continue
            values = training_values(ex)
            entries.append({
                "date": day,
                "session_id": sid,
                "workout_id": data.get("block") or day,
                "exercise_id": ex.get("exercise_id") or ex.get("id") or ex.get("name") or "",
                "sets": values["sets"],
                "rpe": values["rpe"],
            })
    return entries, sessions


def coverage_for_range(store: SessionStore, uid: str, date_from: str, date_to: str, *, label: str | None = None) -> dict[str, Any]:
    from fitness.catalog.coverage import calculate_coverage
    from fitness.catalog.weekly import (
        HIGH_REGION_THRESHOLD, LOW_REGION_THRESHOLD, all_body_regions, build_recommendations, unique_workout_ids,
    )

    try:
        d_from, d_to = _date.fromisoformat(date_from), _date.fromisoformat(date_to)
    except ValueError as exc:
        raise InvalidRange(f"ungültiges Datum: {exc}") from None
    if d_from > d_to:
        raise InvalidRange("date_from liegt nach date_to")

    entries, sessions = _entries(store, uid, date_from, date_to)
    res = _resources()

    muscle_scores: dict[str, float] = defaultdict(float)
    body_region_scores: dict[str, float] = defaultdict(float)
    unmapped: set[str] = set()
    unknown: set[str] = set()

    for entry in entries:
        try:
            cov = calculate_coverage(
                entry["exercise_id"], int(entry["sets"]), int(entry["rpe"]),
                records=res["records"], taxonomy=res["taxonomy"],
                region_index=res["region_index"], rules=res["rules"],
            )
        except ValueError:
            unknown.add(str(entry["exercise_id"]))   # unbekannte Übung stoppt nicht die ganze Auswertung
            continue
        for muscle_id, score in cov["muscle_scores"].items():
            muscle_scores[muscle_id] += score
        for region, score in cov["body_region_scores"].items():
            body_region_scores[region] += score
        unmapped.update(cov["unmapped_muscles"])

    regions = sorted(all_body_regions())
    missing = [r for r in regions if body_region_scores.get(r, 0.0) <= 0]
    low = [r for r in regions if 0 < body_region_scores.get(r, 0.0) < LOW_REGION_THRESHOLD]
    high = [r for r in regions if body_region_scores.get(r, 0.0) >= HIGH_REGION_THRESHOLD]

    return {
        "uid": uid,
        "week": label,
        "date_from": date_from,
        "date_to": date_to,
        "sessions_count": sessions,
        "entries_count": len(entries),
        "workout_ids": unique_workout_ids(entries),
        "body_region_scores": dict(sorted(body_region_scores.items())),
        "muscle_scores": dict(sorted(muscle_scores.items())),
        "missing_regions": missing,
        "low_regions": low,
        "high_regions": high,
        "recommendations": build_recommendations(missing, low, high, entries),
        "unmapped_muscles": sorted(unmapped),
        "unknown_exercises": sorted(unknown),
    }


def weekly(store: SessionStore, uid: str, week_selector: str = "current") -> dict[str, Any]:
    from fitness.catalog.weekly import resolve_week_selector

    try:
        week = resolve_week_selector(week_selector)
    except ValueError as exc:
        raise InvalidRange(str(exc)) from None
    return coverage_for_range(store, uid, week["date_from"], week["date_to"], label=week["label"])
