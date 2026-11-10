"""Lokaler Filesystem-Watcher (watchdog) für kb/muscles/**/*.yml.

kb/muscles/ ist push-only (lokal ist die alleinige Quelle, kein Firestore-
Watcher liest davon zurück) — Live-Push spart das manuelle `fitness-catalog
push-changed` bzw. Warten auf den nächsten `git push` (der pre-push-Hook
deckt denselben Fall bereits als Fallback ab, git-diff-basiert, siehe
.githooks/pre-push).
"""
from __future__ import annotations

import threading
from pathlib import Path

from loguru import logger
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from fitness.catalog.core.loader import catalog_path
from fitness.catalog.api.firestore_push import push_changed_muscle_files

_DEBOUNCE_SECONDS = 2.0


class MuscleKbHandler(FileSystemEventHandler):
    def __init__(self, root: Path) -> None:
        self._root = root
        self._pending: set[str] = set()
        self._timer: threading.Timer | None = None
        self._lock = threading.Lock()

    def _queue(self, src_path: str) -> None:
        path = Path(src_path)
        if path.suffix != ".yml":
            return
        try:
            rel = path.relative_to(self._root).as_posix()
        except ValueError:
            return
        with self._lock:
            self._pending.add(rel)
            if self._timer:
                self._timer.cancel()
            self._timer = threading.Timer(_DEBOUNCE_SECONDS, self._flush)
            self._timer.daemon = True
            self._timer.start()

    def _flush(self) -> None:
        with self._lock:
            changed = self._pending
            self._pending = set()
            self._timer = None
        if not changed:
            return
        try:
            result = push_changed_muscle_files(changed)
            logger.success(f"kb/muscles → Firestore (live): {sorted(changed)} — {result}")
        except Exception as exc:
            logger.warning(f"kb/muscles Live-Push fehlgeschlagen: {exc}")

    def on_created(self, event):
        if not event.is_directory:
            self._queue(event.src_path)

    def on_modified(self, event):
        if not event.is_directory:
            self._queue(event.src_path)

    def on_moved(self, event):
        if not event.is_directory:
            self._queue(event.dest_path)


def start_muscle_kb_watcher() -> Observer:
    root = catalog_path("muscles")
    observer = Observer()
    observer.schedule(MuscleKbHandler(root), str(root), recursive=True)
    observer.start()
    logger.info(f"Muscle-KB-Filesystem-Watcher gestartet: {root}")
    return observer
