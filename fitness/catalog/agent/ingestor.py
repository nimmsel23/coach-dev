from __future__ import annotations

import json
import sqlite3
import re
from contextlib import closing
from pathlib import Path
from typing import Any

from fitness.catalog.core.paths import runtime_root
from fitness.catalog.history import ensure_history_db, log_training_entry
from fitness.catalog.core.resolver import resolve_query
from fitness.catalog.core.loader import load_catalog_directory_yaml, catalog_path
from fitness.catalog.core.session_signal import exercise_has_training_signal, training_values

def ingest_all_sessions():
    users_dir = runtime_root() / "users"
    if not users_dir.exists():
        return
    
    db_path = ensure_history_db()
    
    # We use a set of known (workout_id, exercise_id, date) to avoid duplicates
    # or we can use a simpler approach: tracking which session files we already processed.
    # For now, let's use a simple "INSERT OR IGNORE" logic if we had a unique constraint,
    # but the current schema doesn't have one. 
    # Let's add a unique constraint to training_history if possible, or check before insert.
    
    processed_count = 0
    for uid_dir in users_dir.iterdir():
        if not uid_dir.is_dir():
            continue
        sessions_dir = uid_dir / "sessions"
        if not sessions_dir.exists():
            continue
            
        for session_file in sessions_dir.glob("*.json"):
            try:
                session_data = json.loads(session_file.read_text())
                date = session_file.stem
                exercises = session_data.get("exercises", [])
                
                workout_id = stable_workout_id(uid_dir.name, session_data, date)
                for ex in exercises:
                    if not isinstance(ex, dict) or not exercise_has_training_signal(ex):
                        continue
                    exercise_query = ex.get("name") or ex.get("id")
                    if not exercise_query:
                        continue
                    resolution = resolve_query(exercise_query)
                    canonical_id = resolution.canonical_id if resolution.matched else ex.get("id")
                    values = training_values(ex)
                    # Ingest each exercise entry
                    # Check if already exists
                    if canonical_id and not is_already_ingested(db_path, date, canonical_id, workout_id):
                        log_training_entry(
                            exercise_query=exercise_query,
                            sets=values["sets"],
                            reps=values["reps"],
                            weight=values["weight"],
                            rpe=values["rpe"],
                            workout_id=workout_id,
                            date=date,
                            done=bool(ex.get("done", False))
                        )
                        processed_count += 1
            except Exception:
                continue
    return processed_count


def stable_workout_id(user_id: str, session_data: dict[str, Any], date: str) -> str:
    raw = session_data.get("block") or session_data.get("session_id") or date
    return f"{user_id}:{raw}"


def is_already_ingested(db_path: Path, date: str, exercise_id: str, workout_id: str) -> bool:
    with closing(sqlite3.connect(db_path)) as conn:
        res = conn.execute(
            "SELECT 1 FROM training_history WHERE date = ? AND exercise_id = ? AND workout_id = ? LIMIT 1",
            (date, exercise_id, workout_id)
        ).fetchone()
        return res is not None

def get_top_unreviewed_exercises(limit: int = 5, days: int = 28) -> list[tuple[str, int]]:
    """Returns a list of (exercise_id, usage_count) for exercises that are currently 'unreviewed',
    focusing on the most recent sessions.
    """
    db_path = ensure_history_db()
    
    # 1. Get usage counts within the time window
    with closing(sqlite3.connect(db_path)) as conn:
        rows = conn.execute(
            f"SELECT exercise_id, display_name, COUNT(*) as count FROM training_history "
            f"WHERE date >= date('now', '-{days} days') "
            "AND (done = 1 OR sets > 0 OR reps > 0 OR weight > 0 OR rpe > 0) "
            f"GROUP BY exercise_id, display_name ORDER BY count DESC"
        ).fetchall()
    
    # 2. Filter for unreviewed exercises and those not already in the inbox
    unreviewed_ids = set()
    for path, doc in load_catalog_directory_yaml("exercises"):
        # We look for unreviewed tag or the unreviewed_ prefix in the file name
        if "unreviewed" in path.name:
            for ex in doc.get("exercises", []):
                unreviewed_ids.add(ex.get("exercise_id") or ex.get("id"))
    
    results = []
    for raw_ex_id, display_name, count in rows:
        candidates = history_exercise_candidates(raw_ex_id, display_name)
        if not candidates:
            continue
        ex_id = next((candidate for candidate in candidates if candidate in unreviewed_ids), "")
        if ex_id:
            # Also check if it's already in the inbox (inbox_{ex_id}.yml)
            inbox_file = catalog_path(f"inbox/inbox_{ex_id}.yml")
            if not inbox_file.exists():
                results.append((ex_id, count))
                if len(results) >= limit:
                    break
    return results


def history_exercise_candidates(exercise_id: str | None, display_name: str | None) -> list[str]:
    candidates: list[str] = []
    for value in (exercise_id, display_name):
        if value:
            candidates.append(str(value))
            candidates.append(slugify_exercise_name(str(value)))
    for value in list(candidates):
        if value.startswith("inbox_"):
            candidates.append(value.removeprefix("inbox_"))
    seen: set[str] = set()
    unique: list[str] = []
    for value in candidates:
        if value and value not in seen:
            seen.add(value)
            unique.append(value)
    return unique


def slugify_exercise_name(value: str | None) -> str:
    text = (value or "").strip().casefold()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")
