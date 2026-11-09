"""Plan-Generator (dünner Wrapper um fitness.catalog.planner)."""
from __future__ import annotations

import dataclasses
from typing import Any


class UnknownTemplate(LookupError):
    pass


def list_templates() -> dict[str, Any]:
    from fitness.catalog.planner import load_program_rules

    rules = load_program_rules()
    return {"default": rules.get("default_template"), "templates": sorted((rules.get("templates") or {}).keys())}


def build(template: str | None = None, split: str | None = None, day: str | None = None, goal: str | None = None) -> dict[str, Any]:
    from fitness.catalog.planner import build_plan

    clean = lambda v: (v or "").strip() or None  # noqa: E731
    try:
        result = build_plan(template=clean(template), split=clean(split), day=clean(day), goal=clean(goal))
    except ValueError as exc:
        msg = str(exc)
        if msg.startswith("Unknown plan template"):
            raise UnknownTemplate(msg) from None
        raise
    return dataclasses.asdict(result) if dataclasses.is_dataclass(result) else dict(result)


# ---- Tagesvorschlag (Rotation nach der zuletzt geloggten Einheit) ----------------------------
_DOW_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]
# Fallback ohne Plan — aus dem alten Backend übernommen (fitness/api/routers/coaching.py)
_FALLBACK_PLAN = {
    "Mo": ("Push", ["Incline Dumbbell Press", "Dips", "Lateral Raise", "Cable Fly", "Triceps Extension"]),
    "Di": ("Pull", ["Pull-Up", "Row", "Lat Pulldown", "Face Pull", "Biceps Curl"]),
    "Mi": ("Legs", ["Squat", "Romanian Deadlift", "Lunge", "Leg Curl", "Calf Raise"]),
    "Do": ("Upper", ["Bench Press", "Row", "Overhead Press", "Pulldown", "Curl"]),
    "Fr": ("Lower", ["Deadlift", "Split Squat", "Hip Thrust", "Leg Curl", "Calf Raise"]),
    "Sa": ("Full Body", ["Squat", "Press", "Row", "Hinge", "Carry"]),
    "So": ("Recovery", ["Mobility", "Walk", "Core Breathing"]),
}


def _read_plan(store, uid: str, is_coach: bool) -> tuple[dict | None, str | None]:
    """Eigener Plan des Nutzers; der alte globale `plan.json` gehört dem Coach und wird nur dort
    verwendet (früher bekam jeder Klient den Plan des Coaches vorgeschlagen)."""
    import json

    candidates = [(store.root / "users" / uid / "plan.json", "user")]
    if is_coach:
        candidates.append((store.root / "plan.json", "global"))
    for path, label in candidates:
        try:
            data = json.loads(path.read_text())
        except Exception:
            continue
        if isinstance(data, dict) and data.get("einheiten"):
            return data, label
    return None, None


def today(store, uid: str, *, is_coach: bool = False, day: str | None = None) -> dict[str, Any]:
    from datetime import date as _date, datetime
    from fitness.runtime.session_store import session_order_key

    day = day or _date.today().isoformat()
    try:
        weekday = datetime.fromisoformat(day + "T12:00:00").weekday()
    except ValueError:
        raise ValueError(f"ungültiges Datum: {day!r}") from None

    last_block = last_logged_at = None
    candidates = []
    for doc_id in store.list_ids(uid):
        data, _err = store.read(uid, doc_id)
        if data and data.get("block"):
            try:
                mtime_ns = store.path(uid, doc_id).stat().st_mtime_ns
            except OSError:
                mtime_ns = 0
            candidates.append((doc_id, data, mtime_ns))
    if candidates:
        _doc_id, latest, _mtime = max(
            candidates, key=lambda item: session_order_key(item[0], item[1], mtime_ns=item[2])
        )
        last_block = latest["block"]
        last_logged_at = latest.get("date") or _doc_id.split("__", 1)[0]

    plan, source = _read_plan(store, uid, is_coach)
    if plan:
        units = plan["einheiten"]
        last_idx = next((i for i, e in enumerate(units) if e.get("name") == last_block), -1)
        nxt = units[(last_idx + 1) % len(units)]
        exercises = [u["name"] for a in nxt.get("abschnitte", []) for u in (a.get("übungen") or a.get("uebungen") or [])]
        return {"source": f"plan:{source}", "suggestion": {"block": nxt["name"], "exercises": exercises,
                                                           "lastBlock": last_block, "lastLoggedAt": last_logged_at}}
    dow = _DOW_DE[(weekday + 1) % 7]
    block, exercises = _FALLBACK_PLAN.get(dow, ("Full Body", ["Squat", "Press", "Row"]))
    return {"source": "fallback", "suggestion": {"day": dow, "block": block, "exercises": exercises,
                                                 "lastBlock": last_block, "lastLoggedAt": last_logged_at}}
