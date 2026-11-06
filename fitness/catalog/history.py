from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from fitness.catalog.core.resolver import resolve_query


@dataclass
class TrainingLogResult:
    exercise_id: str
    display_name: str
    workout_id: str
    row_id: int


def history_db_path() -> Path:
    """Live auflösen (nicht die Prozess-weit gecachte `db.DB_PATH`) — respektiert
    HOME/FITNESS_RUNTIME zum Aufrufzeitpunkt, wichtig für Test-Isolation."""
    from db import resolve_db_path
    return resolve_db_path()


def _session_factory():
    """Engine an den *aktuellen* history_db_path() gebunden — Schema/Model bleiben
    Alembic-verwaltet (db/models.py), nur die Pfadauflösung ist hier bewusst nicht
    prozessweit gecacht wie in db/__init__.py."""
    from db import Base
    from db.models import TrainingHistory

    db_path = history_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autocommit=False, autoflush=False), TrainingHistory


def ensure_history_db() -> Path:
    """Legt fehlende Tabellen an (Schema selbst ist Alembic-verwaltet, siehe db/models.py)."""
    _session_factory()
    return history_db_path()


def log_training_entry(
    exercise_query: str,
    *,
    sets: int,
    reps: int,
    weight: float,
    rpe: int,
    workout_id: str | None = None,
    date: str | None = None,
    notes: str = "",
    pain: str = "",
    completion_status: str = "completed",
    done: bool = False,
) -> TrainingLogResult:
    resolution = resolve_query(exercise_query)
    if not resolution.matched or not resolution.canonical_id:
        raise ValueError(f"Unknown exercise: {exercise_query}")

    display_name = resolution.display_name or resolution.canonical_id
    SessionLocal, TrainingHistory = _session_factory()
    entry_date = date or datetime.now().date().isoformat()
    entry_workout_id = workout_id or datetime.now().strftime("workout-%Y%m%dT%H%M%S")

    with SessionLocal() as session:
        row = TrainingHistory(
            date=entry_date,
            workout_id=entry_workout_id,
            exercise_id=resolution.canonical_id,
            display_name=display_name,
            sets=sets,
            reps=reps,
            weight=weight,
            rpe=rpe,
            done=1 if done else 0,
            notes=notes or "",
            pain=pain or "",
            completion_status=completion_status or "completed",
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        row_id = row.id

    return TrainingLogResult(
        exercise_id=resolution.canonical_id,
        display_name=display_name,
        workout_id=entry_workout_id,
        row_id=int(row_id),
    )


def _row_to_dict(row: Any) -> dict[str, Any]:
    return {
        "date": row.date,
        "workout_id": row.workout_id,
        "exercise_id": row.exercise_id,
        "display_name": row.display_name,
        "sets": row.sets,
        "reps": row.reps,
        "weight": row.weight,
        "rpe": row.rpe,
        "done": row.done,
        "notes": row.notes,
        "pain": row.pain,
        "completion_status": row.completion_status,
    }


def read_history(exercise_query: str, limit: int = 10) -> list[dict[str, Any]]:
    resolution = resolve_query(exercise_query)
    if not resolution.matched or not resolution.canonical_id:
        raise ValueError(f"Unknown exercise: {exercise_query}")

    SessionLocal, TrainingHistory = _session_factory()

    with SessionLocal() as session:
        rows = (
            session.query(TrainingHistory)
            .filter(TrainingHistory.exercise_id == resolution.canonical_id)
            .order_by(TrainingHistory.date.desc(), TrainingHistory.id.desc())
            .limit(limit)
            .all()
        )
        return [_row_to_dict(row) for row in rows]


def read_history_range(date_from: str, date_to: str) -> list[dict[str, Any]]:
    SessionLocal, TrainingHistory = _session_factory()

    with SessionLocal() as session:
        rows = (
            session.query(TrainingHistory)
            .filter(TrainingHistory.date >= date_from, TrainingHistory.date <= date_to)
            .order_by(TrainingHistory.date.desc(), TrainingHistory.id.desc())
            .all()
        )
        return [_row_to_dict(row) for row in rows]


def progress_hint(exercise_query: str) -> dict[str, Any]:
    entries = read_history(exercise_query, limit=5)
    if not entries:
        return {
            "exercise_id": resolve_query(exercise_query).canonical_id if resolve_query(exercise_query).matched else None,
            "suggestion": "No history yet",
            "reason": "Log at least one session first.",
        }

    latest = entries[0]
    reps = int(latest["reps"])
    rpe = int(latest["rpe"])
    pain = str(latest.get("pain", "")).strip()

    if pain:
        return {
            "exercise_id": latest["exercise_id"],
            "suggestion": "Use caution",
            "reason": "Pain was noted in the latest entry.",
        }

    if rpe <= 8 and reps >= 10:
        return {
            "exercise_id": latest["exercise_id"],
            "suggestion": "Increase load slightly",
            "reason": "Top reps were achieved at target RPE.",
        }

    if reps < 8:
        return {
            "exercise_id": latest["exercise_id"],
            "suggestion": "Keep load",
            "reason": "Reps are below the simple progression threshold.",
        }

    return {
        "exercise_id": latest["exercise_id"],
        "suggestion": "Keep load",
        "reason": "No clear progression signal yet.",
    }
