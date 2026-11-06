"""watchdog FileSystemEventHandler fuer Session-/Journal-Aenderungen.

Beobachtet den physischen Pfad `runtime_root()/users` (NICHT AOS_USERS /
~/.aos/users/): `<uid>/fitness` ist dort nur ein Symlink, watchdog folgt bei
rekursivem Watch keinen Symlinks (gleicher Gotcha wie im bestehenden
Enrichment-Watcher, siehe fitness/catalog/api/watcher.py).
"""
from __future__ import annotations

import json
import queue as _queue
from pathlib import Path
from typing import Callable

from watchdog.events import FileSystemEventHandler

from .events import client_name, event_line


class SessionJournalHandler(FileSystemEventHandler):
    def __init__(
        self,
        events: "_queue.Queue[str]",
        registry: dict,
        on_session: Callable[[str, str, dict], None],
    ) -> None:
        self._events = events
        self._registry = registry
        self._on_session = on_session

    def on_created(self, event):
        self._handle(event)

    def on_modified(self, event):
        self._handle(event)

    def _handle(self, event) -> None:
        if event.is_directory:
            return
        path = Path(event.src_path)
        parts = path.parts
        if "users" not in parts:
            return
        uid_idx = parts.index("users") + 1
        if uid_idx >= len(parts):
            return
        uid = parts[uid_idx]
        name = client_name(uid, self._registry)

        if path.suffix == ".json" and "sessions" in parts:
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                return
            block = data.get("block") or "?"
            n_ex = len(data.get("exercises") or [])
            self._events.put(event_line("white", "Session", name, f"[{block}] {n_ex} Uebungen"))
            self._on_session(uid, name, data)
        elif path.suffix == ".md" and "journal" in parts:
            self._events.put(event_line("cyan", "Journal", name, path.stem))
