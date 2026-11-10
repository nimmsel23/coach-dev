"""Fasting window analysis from meal timestamps.

1:1 Port von ~/dev/fuel-dev/src/shared/utils/fasting.mjs::computeFastingWindows().
Pure function — kein I/O, keine DB-Abhängigkeit. Klassifikationsschwellen
(36h/20h/14h) sind identisch zum Node-Original übernommen, NICHT neu erfunden.
"""

from datetime import datetime


def compute_fasting_windows(day_logs: list[dict]) -> list[dict]:
    """
    day_logs: Liste von {"date": "YYYY-MM-DD", "meals": [{"logged_at": iso_str, ...}, ...]}
    aufsteigend chronologisch sortiert (ältester Tag zuerst).

    Rückgabe: Liste von {
        "date": "YYYY-MM-DD",
        "firstMealAt": iso_str | None,
        "lastMealAt": iso_str | None,
        "eatingWindowHours": float | None,
        "fastingHoursBeforeThisDay": float | None,
        "classification": "no_log" | "normal" | "if" | "omad" | "extended_fast",
    }
    """
    result = []
    prev_last_meal: str | None = None

    for day_log in day_logs:
        date = day_log.get("date")
        meals = day_log.get("meals") or []

        # Filtere Mahlzeiten mit logged_at und sortiere chronologisch
        valid_meals = sorted(
            (m for m in meals if m.get("logged_at") and isinstance(m.get("logged_at"), str)),
            key=lambda m: m["logged_at"],
        )

        first_meal_at = None
        last_meal_at = None
        eating_window_hours = None
        fasting_hours_before_this_day = None
        classification = "no_log"

        if valid_meals:
            first_meal_at = valid_meals[0]["logged_at"]
            last_meal_at = valid_meals[-1]["logged_at"]

            first_time = _parse_iso(first_meal_at)
            last_time = _parse_iso(last_meal_at)
            window_seconds = (last_time - first_time).total_seconds()
            eating_window_hours = round((window_seconds / 3600) * 10) / 10

            if prev_last_meal:
                prev_last_time = _parse_iso(prev_last_meal)
                fast_seconds = (first_time - prev_last_time).total_seconds()
                fasting_hours_before_this_day = round((fast_seconds / 3600) * 10) / 10

                if fasting_hours_before_this_day >= 36:
                    classification = "extended_fast"
                elif fasting_hours_before_this_day >= 20:
                    classification = "omad"
                elif fasting_hours_before_this_day >= 14:
                    classification = "if"
                else:
                    classification = "normal"
            else:
                # Kein Vortag mit Mahlzeiten verfügbar
                classification = "normal"

            prev_last_meal = last_meal_at

        result.append({
            "date": date,
            "firstMealAt": first_meal_at,
            "lastMealAt": last_meal_at,
            "eatingWindowHours": eating_window_hours,
            "fastingHoursBeforeThisDay": fasting_hours_before_this_day,
            "classification": classification,
        })

    return result


def _parse_iso(iso_str: str) -> datetime:
    # Bestandsdaten ohne logged_at werden bereits vorher rausgefiltert (siehe
    # compute_fasting_windows); hier gehen wir von gültigem ISO-Format aus,
    # wie es food.py::log_food per datetime.now(timezone.utc).isoformat() erzeugt.
    return datetime.fromisoformat(iso_str)
