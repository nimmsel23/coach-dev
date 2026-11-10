from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Any

from fitness.catalog.history import ensure_history_db
from fitness.runtime.user_data import iter_session_signals


@dataclass
class HistoryPatch:
    row_id: int
    user_id: str
    date: str
    workout_id: str
    exercise_id: str
    display_name: str
    before: dict[str, Any]
    after: dict[str, Any]
    session_file: str
    reason: str


def find_history_backfill_patches(
    *,
    user_id: str,
    exercise_ids: set[str] | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    only_zero_rows: bool = True,
) -> list[HistoryPatch]:
    db_path = ensure_history_db()
    signals = iter_session_signals(
        user_id=user_id,
        exercise_ids=exercise_ids,
        date_from=date_from,
        date_to=date_to,
    )
    patches: list[HistoryPatch] = []
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        for signal in signals:
            after = {
                "sets": signal.values["sets"],
                "reps": signal.values["reps"],
                "weight": signal.values["weight"],
                "rpe": signal.values["rpe"],
                "notes": signal.note,
            }
            rows = conn.execute(
                "select * from training_history where date=? and exercise_id=? order by id",
                (signal.date, signal.exercise_id),
            ).fetchall()
            if any(_row_matches_payload(_row, after) for _row in rows):
                continue
            candidates = [_row for _row in rows if _row_is_safe_patch_candidate(_row, only_zero_rows=only_zero_rows)]
            if len(candidates) != 1:
                continue
            row = candidates[0]
            before = {
                "sets": row["sets"],
                "reps": row["reps"],
                "weight": row["weight"],
                "rpe": row["rpe"],
                "notes": row["notes"],
            }
            if before == after:
                continue
            patches.append(
                HistoryPatch(
                    row_id=int(row["id"]),
                    user_id=signal.user_id,
                    date=signal.date,
                    workout_id=str(row["workout_id"]),
                    exercise_id=signal.exercise_id,
                    display_name=str(row["display_name"]),
                    before=before,
                    after=after,
                    session_file=signal.session_file,
                    reason="session_signal_backfill",
                )
            )
    return patches


def apply_history_patches(patches: list[HistoryPatch]) -> int:
    db_path = ensure_history_db()
    with sqlite3.connect(db_path) as conn:
        for patch in patches:
            conn.execute(
                "update training_history set sets=?, reps=?, weight=?, rpe=?, notes=? where id=?",
                (
                    patch.after["sets"],
                    patch.after["reps"],
                    patch.after["weight"],
                    patch.after["rpe"],
                    patch.after["notes"],
                    patch.row_id,
                ),
            )
        conn.commit()
    return len(patches)


def update_history_row(row_id: int, fields: dict[str, Any]) -> dict[str, Any]:
    allowed = {"sets", "reps", "weight", "rpe", "notes", "pain", "completion_status", "done"}
    clean = {key: value for key, value in fields.items() if key in allowed and value is not None}
    if not clean:
        raise ValueError("no update fields provided")
    db_path = ensure_history_db()
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        before = conn.execute("select * from training_history where id=?", (row_id,)).fetchone()
        if before is None:
            raise ValueError(f"history row not found: {row_id}")
        set_clause = ", ".join(f"{key}=?" for key in clean)
        conn.execute(
            f"update training_history set {set_clause} where id=?",
            [*clean.values(), row_id],
        )
        conn.commit()
        after = conn.execute("select * from training_history where id=?", (row_id,)).fetchone()
    return {"before": dict(before), "after": dict(after)}


def delete_history_row(row_id: int) -> dict[str, Any]:
    db_path = ensure_history_db()
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("select * from training_history where id=?", (row_id,)).fetchone()
        if row is None:
            raise ValueError(f"history row not found: {row_id}")
        conn.execute("delete from training_history where id=?", (row_id,))
        conn.commit()
    return dict(row)


def _row_is_safe_patch_candidate(row: sqlite3.Row, *, only_zero_rows: bool) -> bool:
    if not only_zero_rows:
        return True
    return (
        int(row["sets"] or 0) == 0
        and int(row["reps"] or 0) == 0
        and float(row["weight"] or 0) == 0
        and int(row["rpe"] or 0) == 0
        and not str(row["notes"] or "").strip()
    )


def _row_matches_payload(row: sqlite3.Row, payload: dict[str, Any]) -> bool:
    return (
        int(row["sets"] or 0) == int(payload["sets"] or 0)
        and int(row["reps"] or 0) == int(payload["reps"] or 0)
        and float(row["weight"] or 0) == float(payload["weight"] or 0)
        and int(row["rpe"] or 0) == int(payload["rpe"] or 0)
        and str(row["notes"] or "") == str(payload["notes"] or "")
    )
