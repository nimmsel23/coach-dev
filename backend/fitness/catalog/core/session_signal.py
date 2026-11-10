from __future__ import annotations

from typing import Any
import re


def training_values(exercise: dict[str, Any]) -> dict[str, Any]:
    sets = _int_value(exercise.get("sets"))
    reps = _int_value(exercise.get("reps"))
    weight = _float_value(exercise.get("weight"))
    rpe = _int_value(exercise.get("rpe"))

    sets_array = exercise.get("setsArray")
    if isinstance(sets_array, list):
        active_sets = [
            item
            for item in sets_array
            if isinstance(item, dict) and _set_has_values(item)
        ]
        if active_sets and sets == 0:
            sets = len(active_sets)
        if reps == 0:
            reps = max((_int_value(item.get("reps")) for item in active_sets), default=0)
        if weight == 0:
            weight = max((_float_value(item.get("weight")) for item in active_sets), default=0.0)
        if rpe == 0:
            rpe = max((_int_value(item.get("rpe")) for item in active_sets), default=0)

    note_values = _values_from_note(exercise.get("note") or exercise.get("notes"))
    if note_values:
        if sets == 0:
            sets = note_values["sets"]
        if reps == 0:
            reps = note_values["reps"]
        if weight == 0:
            weight = note_values["weight"]

    return {"sets": sets, "reps": reps, "weight": weight, "rpe": rpe}


def _positive_number(value: Any) -> bool:
    try:
        return float(value or 0) > 0
    except (TypeError, ValueError):
        return False


def exercise_has_training_signal(exercise: dict[str, Any]) -> bool:
    """Return true for entries that were actually logged into the workout.

    Vormals verlangte diese Funktion zusätzlich numerische Set-Daten (Gewicht/
    Wdh/RPE), um eine Übung als "geloggt" zu zählen — mit der Begründung, dass
    Such-/Katalog-Vorschauen leere `setsArray`-Einträge im Session-JSON
    hinterlassen könnten. Das trifft auf den tatsächlichen Frontend-Flow nicht
    zu: Übungen landen ausschließlich über einen expliziten "+"-Klick
    (`addEx()` in `useSession.js`) in `exercises[]` — es gibt keinen passiven
    Preview-Pfad. Die alte Filterung führte dazu, dass ein voll geplanter/
    begonnener Pull-Tag (7 Übungen) spurlos aus SQLite-History, Demand-Audit
    und Proactive-Enrichment verschwand, nur weil die Sätze nicht ausgefüllt
    wurden (Fund 2026-08-23, Session vom 2026-07-31). Anwesenheit in der Liste
    ist jetzt selbst das Signal — unabhängig vom Detailgrad.
    """
    return bool(exercise.get("id") or exercise.get("exercise_id") or exercise.get("name"))


def _set_has_values(item: dict[str, Any]) -> bool:
    return any(_positive_number(item.get(key)) for key in ("reps", "weight", "rpe"))


def _note_has_training_signal(value: Any) -> bool:
    text = str(value or "").strip().casefold()
    if not text:
        return False
    return bool(
        re.search(r"\b\d+(?:[.,]\d+)?\s*(?:kg|kilo|x|wdh|rep|reps|wiederholung|schritt|schritte)", text)
    )


def _values_from_note(value: Any) -> dict[str, Any] | None:
    text = str(value or "").casefold()
    if not text:
        return None

    weight = 0.0
    reps = 0
    kg_match = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:kg|kilo)", text)
    if kg_match:
        weight = _float_value(kg_match.group(1).replace(",", "."))

    rep_match = re.search(r"(?:ca\.?\s*)?(\d+)\s*(?:x|wdh|rep|reps|wiederholung|schritt|schritte)", text)
    if rep_match:
        reps = _int_value(rep_match.group(1))

    if weight <= 0 and reps <= 0:
        return None
    return {"sets": 1, "reps": reps, "weight": weight}


def _int_value(value: Any) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def _float_value(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0
