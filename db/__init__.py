"""
fitness-dev DB Layer — SQLAlchemy + Alembic

engine      — SQLAlchemy Engine (SQLite, ~/.aos/fitness/sessions/training_history.sqlite)
SessionLocal — Session factory (context manager)
Base        — DeclarativeBase für alle Models
"""
from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

def resolve_db_path() -> Path:
    """Live auflösen (nicht cachen) — respektiert FITNESS_RUNTIME/HOME zum Aufrufzeitpunkt.

    Wichtig für Tests, die HOME per os.environ patchen: `DB_PATH` unten ist beim
    Modul-Import einmalig fixiert (Prod-Engine bindet sich einmal pro Prozess),
    Aufrufer die pfad-sensitiv bleiben müssen (siehe fitness/catalog/history.py)
    rufen stattdessen diese Funktion frisch auf.
    """
    runtime = Path(os.environ.get("FITNESS_RUNTIME", Path.home() / ".aos" / "fitness"))
    return runtime / "sessions" / "training_history.sqlite"


DB_PATH = resolve_db_path()
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
    echo=False,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI Dependency — yields eine DB-Session, schließt sie danach."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
