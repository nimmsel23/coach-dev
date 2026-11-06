"""
catalog.sync_gateway — Session JSON → SQLite via SQLAlchemy

Wird von server.mjs nach jedem Session-Write aufgerufen:
  POST http://127.0.0.1:9150/internal/sync/session
  Body: { date, session, session_id?, uid? }

Damit ist Python der einzige SQLite-Schreiber (via SQLAlchemy ORM).
server.mjs bleibt SOT für die JSON-Files — es schreibt JSON, Python hört zu.

Kann auch standalone als Filewatcher laufen:
  python -m catalog.sync_gateway watch
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from loguru import logger

from fitness.catalog.core.session_signal import exercise_has_training_signal, training_values


def _get_session_local():
    """Lazy import with live DB path resolution for runtime/test isolation."""
    from fitness.catalog.history import _session_factory
    SessionLocal, _ = _session_factory()
    return SessionLocal


def _get_models():
    from db.models import TrainingHistory
    import sqlalchemy as sa
    return TrainingHistory, sa


def sync_session(day: str, session: dict[str, Any], session_id: str | None = None) -> int:
    """Session-Dict per Upsert in SQLite schreiben. Gibt Anzahl betroffener
    Rows zurück. Nutzt INSERT ... ON CONFLICT DO UPDATE auf
    UNIQUE(date, session_id, exercise_id) statt Delete-before-Insert — damit
    existiert nie ein Zwischenzustand ganz ohne Rows für die Session (das
    frühere Delete-before-Insert war das eigentliche Race-Fenster bei
    schnell aufeinanderfolgenden Saves). Aus der Session entfernte Übungen
    werden gezielt per Differenzmenge gelöscht, nicht pauschal."""
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert

    SessionLocal = _get_session_local()
    TrainingHistory, sa = _get_models()

    block = session.get("block", "")
    # Normalisiert auf "" statt None: SQLite behandelt NULL in UNIQUE-Indizes
    # als paarweise verschieden — zwei Rows mit session_id=NULL würden vom
    # ON CONFLICT unten NIE als Duplikat erkannt, jeder Save der Default-
    # Session (kein session_id) hätte also unbegrenzt neue Rows angehäuft,
    # statt sie upzudaten. "" ist ein normaler Wert und funktioniert im
    # Unique-Index korrekt.
    sid = session_id or session.get("session_id") or ""

    exercises = [
        ex for ex in session.get("exercises", [])
        if isinstance(ex, dict) and exercise_has_training_signal(ex)
    ]
    current_exercise_ids = {ex.get("exercise_id") or ex.get("id", "") for ex in exercises}

    with SessionLocal() as db:
        # IS NULL bleibt im Filter, damit Bestandszeilen aus der Zeit vor
        # dieser Normalisierung (session_id noch NULL) weiter gefunden werden.
        sid_filter = TrainingHistory.session_id == sid if sid else sa.or_(
            TrainingHistory.session_id.is_(None), TrainingHistory.session_id == ""
        )
        existing_ids = set(db.execute(
            sa.select(TrainingHistory.exercise_id).where(TrainingHistory.date == day, sid_filter)
        ).scalars())
        stale_ids = existing_ids - current_exercise_ids
        if stale_ids:
            db.execute(sa.delete(TrainingHistory).where(
                TrainingHistory.date == day, sid_filter, TrainingHistory.exercise_id.in_(stale_ids)
            ))

        rows = []
        for ex in exercises:
            values = training_values(ex)
            rows.append(dict(
                date              = day,
                session_id        = sid,
                workout_id        = block or day,
                exercise_id       = ex.get("exercise_id") or ex.get("id", ""),
                display_name      = ex.get("name") or ex.get("exercise_id") or ex.get("id", ""),
                sets              = values["sets"],
                reps              = values["reps"],
                weight            = values["weight"],
                rpe               = values["rpe"],
                done              = 1 if ex.get("done") else 0,
                notes             = ex.get("note") or ex.get("notes") or "",
                completion_status = "completed" if ex.get("done") else "pending",
            ))

        for row in rows:
            stmt = sqlite_insert(TrainingHistory).values(**row)
            stmt = stmt.on_conflict_do_update(
                index_elements=["date", "session_id", "exercise_id"],
                set_={c: stmt.excluded[c] for c in (
                    "workout_id", "display_name", "sets", "reps", "weight",
                    "rpe", "done", "notes", "completion_status",
                )},
            )
            db.execute(stmt)
        db.commit()

    logger.debug(f"sync_gateway: {day} → {len(rows)} rows upserted, {len(stale_ids)} entfernt")
    return len(rows)


def remove_session(day: str, session_id: str | None = None, uid: str | None = None) -> None:
    """Lokale Session-Datei + SQLite-Rows entfernen, wenn Firestore das Dokument
    gelöscht hat (z.B. saveSession() räumt einen date__id-Activity-Sidecar auf,
    sobald er in den kanonischen Tag gemerged wurde — src/lib/db/firestore/
    sessions.js:saveSession). firestore/mirror.py::on_session() ignorierte
    REMOVED-Events bisher komplett, wodurch solche Sidecars lokal für immer als
    Waisen liegen blieben, auch nachdem sie remote längst bereinigt waren."""
    from fitness.paths import sessions_dir

    sdir  = sessions_dir(uid)
    fname = f"{day}__{session_id}.json" if session_id else f"{day}.json"
    f = sdir / fname
    if f.exists():
        f.unlink()
        logger.info(f"session file entfernt (remote gelöscht): {fname}")

    SessionLocal = _get_session_local()
    TrainingHistory, sa = _get_models()
    with SessionLocal() as db:
        if session_id:
            db.execute(sa.delete(TrainingHistory).where(
                TrainingHistory.date == day,
                TrainingHistory.session_id == session_id,
            ))
        else:
            # IS NULL bleibt hier als Fallback für Bestandszeilen aus der Zeit
            # vor der ""-Normalisierung in sync_session().
            db.execute(sa.delete(TrainingHistory).where(
                TrainingHistory.date == day,
                sa.or_(TrainingHistory.session_id.is_(None), TrainingHistory.session_id == ""),
            ))
        db.commit()


def sync_from_file(path: Path) -> int:
    """JSON-File lesen und in SQLite synchronisieren."""
    try:
        data = json.loads(path.read_text())
    except Exception as exc:
        logger.error(f"sync_from_file {path}: {exc}")
        return 0

    # Datum aus Filename ableiten (YYYY-MM-DD.json oder YYYY-MM-DD__sid.json)
    stem = path.stem
    day  = stem.split("__")[0]
    sid  = stem.split("__")[1] if "__" in stem else None

    return sync_session(day, data, session_id=sid)


def sync_directory(sessions_dir: Path, limit: int = 0) -> dict[str, int]:
    """Alle JSON-Files in einem Verzeichnis synchronisieren."""
    files = sorted(sessions_dir.glob("*.json"), reverse=True)
    if limit:
        files = files[:limit]

    total = 0
    errors = 0
    for f in files:
        try:
            n = sync_from_file(f)
            total += n
        except Exception as exc:
            logger.error(f"{f.name}: {exc}")
            errors += 1

    return {"synced_files": len(files), "total_rows": total, "errors": errors}


# ── Filewatcher (optional, standalone) ───────────────────────────────────────

def _watch(sessions_dir: Path) -> None:
    """Watchdog-basierter Filewatcher — synct neue/geänderte Session-JSONs sofort."""
    try:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler
    except ImportError:
        logger.error("watchdog nicht installiert — `yay -S python-watchdog`")
        sys.exit(1)

    class _Handler(FileSystemEventHandler):
        def on_modified(self, event):
            if not event.is_directory and event.src_path.endswith(".json"):
                sync_from_file(Path(event.src_path))

        def on_created(self, event):
            if not event.is_directory and event.src_path.endswith(".json"):
                sync_from_file(Path(event.src_path))

    observer = Observer()
    observer.schedule(_Handler(), str(sessions_dir), recursive=False)
    observer.start()
    logger.info(f"sync_gateway watching {sessions_dir}")
    try:
        while observer.is_alive():
            observer.join(timeout=1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    import typer
    from fitness.catalog.core.paths import runtime_root

    app = typer.Typer(add_completion=False)

    @app.command()
    def watch(
        uid: str = typer.Option("default", help="User-UID (Unterverzeichnis in users/)"),
    ):
        """Filewatcher: synct Session-JSONs live in SQLite sobald server.mjs schreibt."""
        sessions_dir = runtime_root() / "users" / uid / "sessions"
        sessions_dir.mkdir(parents=True, exist_ok=True)
        _watch(sessions_dir)

    @app.command()
    def bulk(
        uid: str = typer.Option("default"),
        limit: int = typer.Option(0, help="Max. Anzahl Files (0 = alle)"),
    ):
        """Alle vorhandenen Session-JSONs in SQLite einlesen."""
        sessions_dir = runtime_root() / "users" / uid / "sessions"
        result = sync_directory(sessions_dir, limit=limit)
        logger.info(f"bulk sync: {result}")

    app()


if __name__ == "__main__":
    main()
