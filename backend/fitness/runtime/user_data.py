from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from fitness.catalog.core.session_signal import exercise_has_training_signal, training_values
from fitness.runtime.session_store import (
    iter_session_files,
    session_date as _session_date,
    session_path,
    user_dirs,
    user_sessions_dir,
)


@dataclass
class RuntimeUser:
    user_id: str
    sessions: int
    inbox: int
    journals: int
    path: str


@dataclass
class SessionSignal:
    user_id: str
    date: str
    session_file: str
    exercise_id: str
    display_name: str
    values: dict[str, Any]
    note: str
    done: bool


@dataclass
class ActivityMergePlan:
    user_id: str
    date: str
    canonical_file: str
    sidecar_files: list[str]
    activities: list[dict[str, Any]]
    applied: bool


def list_runtime_users() -> list[RuntimeUser]:
    users: list[RuntimeUser] = []
    for user_dir in user_dirs():
        sessions_dir = user_sessions_dir(user_dir.name)
        users.append(
            RuntimeUser(
                user_id=user_dir.name,
                sessions=len(list(sessions_dir.glob("*.json"))) if sessions_dir.exists() else 0,
                inbox=len(list((user_dir / "inbox").glob("*.json"))) if (user_dir / "inbox").exists() else 0,
                journals=len(list((user_dir / "journal").glob("*.md"))) if (user_dir / "journal").exists() else 0,
                path=str(user_dir),
            )
        )
    return users


def iter_session_signals(
    *,
    user_id: str | None = None,
    exercise_ids: set[str] | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> list[SessionSignal]:
    signals: list[SessionSignal] = []
    for uid, session_file in iter_session_files(user_id, date_from=date_from, date_to=date_to):
        date = _session_date(session_file) or session_file.stem.split("__")[0]
        try:
            data = json.loads(session_file.read_text(encoding="utf-8"))
        except Exception:
            continue
        exercises = data.get("exercises", []) if isinstance(data, dict) else []
        for exercise in exercises:
            if not isinstance(exercise, dict) or not exercise_has_training_signal(exercise):
                continue
            exercise_id = str(exercise.get("exercise_id") or exercise.get("id") or "").strip()
            if not exercise_id:
                continue
            if exercise_ids and exercise_id not in exercise_ids:
                continue
            signals.append(
                SessionSignal(
                    user_id=uid,
                    date=date,
                    session_file=str(session_file),
                    exercise_id=exercise_id,
                    display_name=str(exercise.get("name") or exercise_id),
                    values=training_values(exercise),
                    note=str(exercise.get("note") or exercise.get("notes") or ""),
                    done=bool(exercise.get("done")),
                )
            )
    return signals


def _performed_exercises(session: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        exercise for exercise in (session.get("exercises") or [])
        if isinstance(exercise, dict) and exercise_has_training_signal(exercise)
    ]


def _is_activity_only(session: dict[str, Any]) -> bool:
    return bool(session.get("activity")) and not _performed_exercises(session)


def _same_activity(left: dict[str, Any], right: dict[str, Any]) -> bool:
    keys = ("type", "duration", "notes", "swimStyle", "muscleTarget")
    return tuple(str(left.get(k, "")) for k in keys) == tuple(str(right.get(k, "")) for k in keys)


def _merge_activity(base: dict[str, Any], incoming: dict[str, Any], source_stem: str) -> dict[str, Any]:
    activity = incoming.get("activity")
    if not isinstance(activity, dict) or not activity:
        return base

    merged = dict(base)
    addons = [
        dict(a) for a in (merged.get("activityAddons") or [])
        if isinstance(a, dict)
    ]
    if isinstance(merged.get("activity"), dict) and not any(_same_activity(a, merged["activity"]) for a in addons):
        addons.insert(0, dict(merged["activity"]))

    entry = dict(activity)
    entry.setdefault("_source_stem", source_stem)
    # Konsistent mit _merge_activity_addon (fitness/api/routers/sessions.py):
    # pro Quell-Datei (source_stem) zählt nur der letzte Stand, nicht jede
    # Signatur-Variante — verhindert Phantom-Finisher, falls ein Sidecar
    # mehrfach überschrieben wurde, bevor gemerged wurde.
    addons = [a for a in addons if a.get("_source_stem") != source_stem]
    addons.append(entry)

    merged["activityAddons"] = addons
    if not isinstance(merged.get("activity"), dict) or not merged.get("activity"):
        merged["activity"] = addons[0]
    if not _performed_exercises(merged):
        merged["sessionMode"] = "cardio"
        merged["activity"] = addons[0]
        merged.setdefault("exercises", [])
    return merged


def merge_day_activities(
    *,
    user_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    apply: bool = False,
) -> list[ActivityMergePlan]:
    """Merge local activity-only sidecar JSONs into one canonical day document."""
    plans: list[ActivityMergePlan] = []

    by_user_date: dict[str, dict[str, list[Path]]] = {}
    for uid, path in iter_session_files(user_id, date_from=date_from, date_to=date_to):
        d = _session_date(path)
        if not d:
            continue
        by_user_date.setdefault(uid, {}).setdefault(d, []).append(path)

    for uid, by_date in by_user_date.items():
        for d, paths in by_date.items():
            loaded: list[tuple[Path, dict[str, Any]]] = []
            for path in paths:
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                except Exception:
                    continue
                if isinstance(data, dict):
                    loaded.append((path, data))
            sidecars = [(p, s) for p, s in loaded if "__" in p.stem and _is_activity_only(s)]
            if not sidecars:
                continue

            canonical = session_path(uid, d)
            if canonical.exists():
                try:
                    base = json.loads(canonical.read_text(encoding="utf-8"))
                except Exception:
                    base = {}
            else:
                base = {**sidecars[0][1], "date": d, "session_id": None, "exercises": []}

            merged = dict(base)
            for path, session in loaded:
                if _is_activity_only(session):
                    merged = _merge_activity(merged, session, path.stem)
            merged["date"] = d
            merged["session_id"] = None
            if apply:
                merged["saved_at"] = datetime.utcnow().isoformat()
                canonical.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
                for path, _session in sidecars:
                    if path != canonical and path.exists():
                        path.unlink()

            plans.append(
                ActivityMergePlan(
                    user_id=uid,
                    date=d,
                    canonical_file=str(canonical),
                    sidecar_files=[str(path) for path, _session in sidecars],
                    activities=[
                        dict(session.get("activity") or {}, _source_stem=path.stem)
                        for path, session in loaded
                        if _is_activity_only(session)
                    ],
                    applied=apply,
                )
            )
    return plans


def dataclass_payload(items: list[Any]) -> list[dict[str, Any]]:
    return [asdict(item) for item in items]
