"""Zentraler Resolver für Runtime-Session-JSONs.

Ersetzt den vorher in mehreren Runtime-Helpern (``user_data.py``,
``note_backfill.py``) kopierten Block ``runtime_root() / "users" / <uid> /
"sessions"`` + ``glob("*.json")`` + Ad-hoc-Datumsparsing aus dem Dateinamen.

Session-JSONs liegen **flach** als ``sessions/YYYY-MM-DD.json`` bzw.
``sessions/YYYY-MM-DD__<session_id>.json`` (Activity-/HIIT-Sidecar einer
Mehrfach-Session desselben Tages). Datum und Sidecar-ID werden vor der
Pfadbildung validiert. `session_order_key()` liefert eine gemeinsame
Sortierung nach `saved_at`, Datum und Datei-Zeitstempel.

Bewusst **keine** Jahr/Monat-Ordnerverschachtelung: die schreibenden Stellen
(``server.mjs``, ``fitness/api/routers/sessions.py``,
``fitness/firestore/mirror.py``, ``firestore-mirror.mjs``) legen weiterhin
flach ab. Eine Verschachtelung ohne synchrone Migration bestehender Daten
**und** Umstellung aller Schreiber würde den Datenbestand spalten — siehe
``NEXT.md``. Dieser Resolver ist die Voraussetzung dafür, das später an genau
einer Stelle nachzuziehen.
"""

from __future__ import annotations

import re
from collections.abc import Iterator, Mapping
from datetime import date, datetime, time, timezone
from pathlib import Path
from typing import Any

from fitness.catalog.core.paths import runtime_root

__all__ = [
    "runtime_users_dir",
    "user_dirs",
    "user_sessions_dir",
    "session_path",
    "session_date",
    "validate_runtime_uid",
    "validate_session_date",
    "validate_session_id",
    "parse_session_doc_id",
    "session_order_key",
    "iter_session_files",
]

_SESSION_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_.-]+$")


def validate_runtime_uid(value: str) -> str:
    """Require a single filesystem-safe user directory name."""
    if not isinstance(value, str) or not value or value in {".", ".."} or any(c in value for c in "/\\\x00"):
        raise ValueError(f"Invalid runtime UID: {value!r}")
    return value


def validate_session_date(value: str) -> str:
    """Require a real calendar date in canonical YYYY-MM-DD form."""
    if not isinstance(value, str) or not _SESSION_DATE_RE.fullmatch(value):
        raise ValueError("Session date must use YYYY-MM-DD")
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        raise ValueError(f"Invalid session date: {value!r}") from None
    if parsed.isoformat() != value:
        raise ValueError(f"Invalid session date: {value!r}")
    return value


def validate_session_id(value: str | None) -> str | None:
    """Require a single safe sidecar ID; empty means the canonical daily session."""
    if value in (None, ""):
        return None
    if not isinstance(value, str) or not _SESSION_ID_RE.fullmatch(value) or ".." in value:
        raise ValueError(f"Invalid session ID: {value!r}")
    return value


def parse_session_doc_id(value: str) -> tuple[str, str | None]:
    """Parse the canonical date or date-plus-sidecar session ID."""
    if not isinstance(value, str):
        raise ValueError(f"Invalid session document ID: {value!r}")
    day, separator, session_id = value.partition("__")
    try:
        day = validate_session_date(day)
        if separator and not session_id:
            raise ValueError("Session ID after __ must not be empty")
        return day, validate_session_id(session_id if separator else None)
    except ValueError:
        raise ValueError(f"Invalid session document ID: {value!r}") from None


def _parse_session_time(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, date):
        parsed = datetime.combine(value, time.min)
    elif isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            try:
                parsed = datetime.combine(date.fromisoformat(value.strip()), time.min)
            except ValueError:
                return None
    else:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def session_order_key(
    doc_id: str, data: Mapping[str, Any], *, mtime_ns: int = 0
) -> tuple[datetime, int, str]:
    """Order sessions by saved_at, then session date, then local file time and ID."""
    when = (_parse_session_time(data.get("saved_at"))
            or _parse_session_time(data.get("date"))
            or _parse_session_time(doc_id.split("__", 1)[0])
            or datetime.min.replace(tzinfo=timezone.utc))
    return when, mtime_ns, doc_id


def runtime_users_dir() -> Path:
    """``~/.aos/fitness/users`` (bzw. ``$FITNESS_AGENT_HOME/users``)."""
    return runtime_root() / "users"


def user_dirs(user_id: str | None = None) -> list[Path]:
    """Alle Runtime-User-Verzeichnisse, oder nur das eine benannte.

    Leere Liste, wenn das Wurzelverzeichnis fehlt oder die benannte UID kein
    Verzeichnis hat.
    """
    root = runtime_users_dir()
    if not root.exists():
        return []
    if user_id:
        user_id = validate_runtime_uid(user_id)
        one = root / user_id
        return [one] if one.is_dir() else []
    return sorted(p for p in root.iterdir() if p.is_dir())


def user_sessions_dir(user_id: str) -> Path:
    """``<users>/<uid>/sessions`` — nicht zwingend existent."""
    return runtime_users_dir() / validate_runtime_uid(user_id) / "sessions"


def session_path(user_id: str, date: str, session_id: str | None = None) -> Path:
    """Kanonischer Pfad einer Session-JSON.

    ``date`` = ``"YYYY-MM-DD"``. Mit ``session_id`` der Sidecar-Name
    ``YYYY-MM-DD__<session_id>.json`` (die Haupt-Session des Tages trägt
    keinen Suffix) — konsistent mit ``fitness/api/config.py::_session_file``
    und ``fitness/firestore/mirror.py::mirror_session``.
    """
    date = validate_session_date(date)
    session_id = validate_session_id(session_id)
    stem = f"{date}__{session_id}" if session_id else date
    return user_sessions_dir(user_id) / f"{stem}.json"


def session_date(path: Path) -> str | None:
    """Datum aus dem Dateinamen (``YYYY-MM-DD`` bzw. ``YYYY-MM-DD__<id>``).

    ``None``, wenn der Name nicht mit einem ISO-Datum beginnt.
    """
    stem = path.stem.split("__", 1)[0]
    try:
        return validate_session_date(stem)
    except ValueError:
        return None


def iter_session_files(
    user_id: str | None = None,
    *,
    date_from: str | None = None,
    date_to: str | None = None,
) -> Iterator[tuple[str, Path]]:
    """Liefert ``(uid, pfad)`` je Session-JSON.

    Sortierung: nach UID, dann nach Dateiname (= chronologisch, da ISO-Datum-
    Präfix). ``date_from`` / ``date_to`` filtern **inklusiv** über das
    Namens-Datum. Dateien ohne parsebares Datum werden übersprungen
    (die Runtime-Session-Ordner enthalten ausschließlich datierte JSONs).
    """
    for udir in user_dirs(user_id):
        sdir = udir / "sessions"
        if not sdir.exists():
            continue
        for path in sorted(sdir.glob("*.json")):
            day = session_date(path)
            if day is None:
                continue
            if date_from and day < date_from:
                continue
            if date_to and day > date_to:
                continue
            yield udir.name, path
