"""Detailansicht eines Workouts als Rich-Renderable (kein Markup-Parsing → Kliententexte sind sicher)."""
from __future__ import annotations

from typing import Any

from rich.console import Group, RenderableType
from rich.table import Table
from rich.text import Text

from backend.sync.notify import ACTIVITIES, MODES


def set_text(item: Any) -> str:
    if not isinstance(item, dict):
        return str(item)
    reps, weight, rpe = item.get("reps"), item.get("weight"), item.get("rpe")
    out = []
    if reps not in (None, ""):
        out.append(str(reps))
    if weight not in (None, "", 0, "0"):
        out.append(f"@ {weight}")
    if rpe not in (None, "", 0, "0"):
        out.append(f"RPE {rpe}")
    return " ".join(out)


def exercise_sets(ex: dict) -> str:
    sets_array = [s for s in (ex.get("setsArray") or []) if isinstance(s, dict)]
    texts = [t for t in (set_text(s) for s in sets_array) if t]
    if texts:
        return " · ".join(texts)
    parts = []
    if ex.get("sets") not in (None, ""):
        parts.append(f"{ex['sets']}×")
    if ex.get("reps") not in (None, ""):
        parts.append(str(ex["reps"]))
    if ex.get("weight") not in (None, "", 0, "0"):
        parts.append(f"@ {ex['weight']}")
    return " ".join(parts)


def render_detail(entry, session: dict | None, error: str | None = None) -> RenderableType:
    head = Text()
    head.append(f"{entry.client}", style="bold")
    head.append(f"  ·  {entry.date}", style="dim")
    parts: list[RenderableType] = [head]

    if session is None:
        msg = "Session-Datei nicht lesbar" + (f": {error}" if error else " (noch nicht synchronisiert?)")
        parts.append(Text(msg, style="yellow"))
        parts.append(Text(entry.summary, style="dim"))
        return Group(*parts)

    activity = session.get("activity") if isinstance(session.get("activity"), dict) else {}
    meta = []
    if session.get("sessionMode"):
        meta.append(MODES.get(session["sessionMode"], str(session["sessionMode"])))
    if activity.get("type"):
        meta.append(ACTIVITIES.get(activity["type"], str(activity["type"])))
    for key, label in (("block", ""), ("trainingsart", ""), ("location", "")):
        if session.get(key):
            meta.append(str(session[key]))
    duration = session.get("duration") or activity.get("duration")
    if duration:
        meta.append(f"{duration} min" if str(duration).isdigit() else str(duration))
    if session.get("effort") not in (None, ""):
        meta.append(f"Effort {session['effort']}")
    if session.get("mood"):
        meta.append(f"Stimmung {session['mood']}")
    if meta:
        parts.append(Text("  ·  ".join(meta), style="cyan"))
    label = "Workout-Chronik" if entry.action == "chronik" else ("Neu eingegangen" if entry.action == "angelegt" else "Aktualisiert")
    parts.append(Text(f"{label}"
                      f"  ·  Stand {entry.saved_at or '?'}  ·  rev {entry.rev}", style="dim"))

    notes = (session.get("notes") or "").strip()
    if notes:
        parts.append(Text())
        parts.append(Text(notes))

    exercises = [e for e in (session.get("exercises") or []) if isinstance(e, dict)]
    if exercises:
        table = Table(box=None, pad_edge=False, show_edge=False, expand=True)
        table.add_column("Übung", ratio=2, overflow="fold")
        table.add_column("Sätze", ratio=3, overflow="fold")
        table.add_column("Notiz", ratio=2, overflow="fold", style="dim")
        for ex in exercises:
            name = ex.get("name") or ex.get("display_name") or ex.get("exercise_id") or ex.get("id") or "?"
            table.add_row(Text(str(name), style="bold"), Text(exercise_sets(ex)), Text(str(ex.get("note") or "")))
        parts.append(Text())
        parts.append(table)

    if activity:
        parts.append(Text())
        line = Text("Aktivität  ", style="bold")
        bits = [ACTIVITIES.get(activity.get("type"), activity.get("type")) if activity.get("type") else None,
                f"{activity['duration']} min" if activity.get("duration") else None,
                f"{activity['distanceKm']} km" if activity.get("distanceKm") else None]
        line.append("  ·  ".join(str(b) for b in bits if b))
        parts.append(line)
        if activity.get("notes"):
            parts.append(Text(str(activity["notes"]), style="dim"))
        muscles = activity.get("muscles") or []
        if muscles:
            parts.append(Text("Muskeln: " + ", ".join(str(m) for m in muscles), style="dim"))

    addons = [a for a in (session.get("activityAddons") or []) if isinstance(a, dict)]
    for a in addons:
        t = ACTIVITIES.get(a.get("type"), a.get("type") or "Zusatz")
        parts.append(Text(f"+ {t}" + (f"  {a['duration']} min" if a.get("duration") else ""), style="dim"))

    if not exercises and not activity and not notes:
        parts.append(Text("(keine Details im Workout)", style="dim"))
    return Group(*parts)
