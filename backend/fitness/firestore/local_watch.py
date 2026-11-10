"""Lokaler Filesystem-Watcher (watchdog) für Session-JSONs unter
~/.aos/fitness/users/*/sessions/*.json.

Warum: mirror_session() feuert bisher nur, wenn eine Session über die API
(POST /session) gespeichert wird. Manuelle/skriptgetriebene Reparaturen an
den JSON-Dateien selbst (Duplikat-Cleanup, session_id-Korrekturen o.ä. — wie
am 2026-08-22 nötig) gingen bisher lokal, ohne dass Firestore automatisch
nachgezogen wurde — jeder solche Fix musste bisher manuell zusätzlich per
Firestore-SDK nachgetragen werden. Dieser Watcher schließt die Lücke:
jede lokale Dateiänderung (Create/Modify/Delete/Move) wird automatisch nach
Firestore gespiegelt, unabhängig davon, wer/was sie ausgelöst hat.

Loop-Vermeidung: mirror.py::on_session (Firestore → lokal, Pull-Richtung)
markiert seine eigenen lokalen Writes in mirror._recent_pull_writes. Dieser
Watcher unterdrückt sein eigenes Echo für ein paar Sekunden danach, statt in
einen Push↔Pull-Ping-Pong zu laufen.
"""
from __future__ import annotations

import json
import re
import threading
import time
from pathlib import Path

from loguru import logger
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from fitness.catalog.core.paths import runtime_root
from fitness.firestore.mirror import mirror_session, mirror_session_delete, _recent_pull_writes

_SESSION_FILE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})(?:__(.+))?\.json$")
_DEBOUNCE_SECONDS = 1.5
_ECHO_SUPPRESS_SECONDS = 5.0


def _parse_session_path(path: Path) -> tuple[str, str, str | None] | None:
    """(uid, date, session_id) für eine gültige users/<uid>/sessions/*.json,
    sonst None (filtert .bak/.pre-patch-bak, training_history.sqlite etc.
    implizit über den Regex-Match auf den vollen Dateinamen)."""
    m = _SESSION_FILE_RE.match(path.name)
    if not m:
        return None
    parts = path.parts
    try:
        idx = parts.index("sessions")
        uid = parts[idx - 1]
    except (ValueError, IndexError):
        return None
    return uid, m.group(1), m.group(2)


class SessionFileHandler(FileSystemEventHandler):
    def __init__(self) -> None:
        self._timers: dict[str, threading.Timer] = {}
        self._lock = threading.Lock()

    def _schedule(self, path: Path, action: str) -> None:
        key = str(path)
        with self._lock:
            existing = self._timers.get(key)
            if existing:
                existing.cancel()
            timer = threading.Timer(_DEBOUNCE_SECONDS, self._run, args=(path, action))
            timer.daemon = True
            self._timers[key] = timer
            timer.start()

    def _run(self, path: Path, action: str) -> None:
        with self._lock:
            self._timers.pop(str(path), None)
        parsed = _parse_session_path(path)
        if not parsed:
            return
        uid, date, session_id = parsed
        doc_id = f"{date}__{session_id}" if session_id else date

        recent = _recent_pull_writes.get(doc_id)
        if recent is not None and time.monotonic() - recent < _ECHO_SUPPRESS_SECONDS:
            return

        if action == "deleted":
            mirror_session_delete(doc_id, uid)
            logger.info(f"session → Firestore {doc_id} gelöscht (lokal entfernt, uid={uid})")
            return

        if not path.exists():
            return
        try:
            session = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning(f"local_watch: {path.name} nicht lesbar: {exc}")
            return
        mirror_session(date, session, uid)
        logger.info(f"session → Firestore {doc_id} (lokale Änderung gespiegelt, uid={uid})")

    def on_created(self, event):
        if not event.is_directory:
            self._schedule(Path(event.src_path), "changed")

    def on_modified(self, event):
        if not event.is_directory:
            self._schedule(Path(event.src_path), "changed")

    def on_deleted(self, event):
        if not event.is_directory:
            self._schedule(Path(event.src_path), "deleted")

    def on_moved(self, event):
        if not event.is_directory:
            self._schedule(Path(event.dest_path), "changed")
            self._schedule(Path(event.src_path), "deleted")


def start_session_file_watcher() -> Observer:
    users_dir = runtime_root() / "users"
    users_dir.mkdir(parents=True, exist_ok=True)
    observer = Observer()
    observer.schedule(SessionFileHandler(), str(users_dir), recursive=True)
    observer.start()
    logger.info(f"Session-Filesystem-Watcher gestartet: {users_dir}")
    return observer
