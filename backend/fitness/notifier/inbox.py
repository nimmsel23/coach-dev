"""Persistente Workout-Inbox: <root>/notifier/inbox.json (gesehen/ungesehen).

Ein Eintrag pro Session (id = "<uid>/<doc_id>"). Eine später aktualisierte
Session wird wieder ungesehen: „gesehen" merkt sich den saved_at-Stand, den
du gesehen hast. Zugriffe sind per flock serialisiert (Pull, TUI und Waybar
laufen in getrennten Prozessen), geschrieben wird atomar.
"""
from __future__ import annotations

import fcntl
import json
import os
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from loguru import logger

VERSION = 1
MAX_ENTRIES = 300


@dataclass
class Entry:
    id: str
    uid: str
    client: str
    doc_id: str
    date: str
    action: str                 # angelegt | aktualisiert
    summary: str
    saved_at: str
    rev: int
    received_at: str
    mode: str = ""
    effort: Any = None
    unseen: bool = True

    @property
    def marker(self) -> str:
        return marker_of(self.saved_at, self.rev)


def marker_of(saved_at: Any, rev: Any) -> str:
    return f"{saved_at or ''}|{rev or 0}"


def entry_id(uid: str, doc_id: str) -> str:
    return f"{uid}/{doc_id}"


class Inbox:
    def __init__(self, directory: Path):
        self.dir = Path(directory)
        self.path = self.dir / "inbox.json"
        self._lock_path = self.dir / "inbox.lock"

    # --- Low-Level -------------------------------------------------------
    @contextmanager
    def _locked(self) -> Iterator[None]:
        self.dir.mkdir(parents=True, exist_ok=True)
        with open(self._lock_path, "w") as fh:
            fcntl.flock(fh, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(fh, fcntl.LOCK_UN)

    def _load(self) -> dict:
        if not self.path.exists():
            return {"version": VERSION, "entries": {}, "seen": {}}
        try:
            data = json.loads(self.path.read_text())
            if not isinstance(data, dict) or not isinstance(data.get("entries"), dict):
                raise ValueError("unerwartete Struktur")
            data.setdefault("seen", {})
            return data
        except Exception as exc:
            broken = self.path.with_name("inbox.json.corrupt")
            os.replace(self.path, broken)
            logger.warning(f"inbox.json defekt ({exc}); nach {broken.name} verschoben, starte leer")
            return {"version": VERSION, "entries": {}, "seen": {}}

    def _save(self, data: dict) -> None:
        tmp = self.path.with_name(".inbox.json.tmp")
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        os.replace(tmp, self.path)

    @staticmethod
    def _to_entry(raw: dict, seen: dict) -> Entry:
        e = Entry(**{k: raw.get(k) for k in Entry.__dataclass_fields__ if k != "unseen"})
        e.unseen = seen.get(e.id) != e.marker
        return e

    # --- Schreiben -------------------------------------------------------
    def record(self, *, uid: str, client: str, doc_id: str, data: dict, action: str, summary: str,
               now: datetime | None = None) -> bool:
        """True, wenn der Eintrag neu ist oder einen neuen Stand hat (→ ungesehen)."""
        now = now or datetime.now(timezone.utc)
        eid = entry_id(uid, doc_id)
        entry = {
            "id": eid, "uid": uid, "client": client, "doc_id": doc_id,
            "date": data.get("date") or doc_id.split("__")[0], "action": action, "summary": summary,
            "saved_at": str(data.get("saved_at") or ""), "rev": int(data.get("rev") or 0),
            "received_at": now.isoformat(), "mode": data.get("sessionMode") or "", "effort": data.get("effort"),
        }
        with self._locked():
            state = self._load()
            old = state["entries"].get(eid)
            if old and marker_of(old.get("saved_at"), old.get("rev")) == marker_of(entry["saved_at"], entry["rev"]):
                return False
            state["entries"][eid] = entry
            self._prune(state)
            self._save(state)
            return True

    def mark_seen(self, ids: list[str], *, expected: dict[str, str] | None = None) -> int:
        with self._locked():
            state = self._load()
            n = 0
            for eid in ids:
                raw = state["entries"].get(eid)
                if raw is None:
                    continue
                m = marker_of(raw.get("saved_at"), raw.get("rev"))
                # Eine während der Anzeige eingegangene Revision bleibt neu.
                if expected is not None and expected.get(eid) != m:
                    continue
                if state["seen"].get(eid) != m:
                    state["seen"][eid] = m
                    n += 1
            if n:
                self._save(state)
            return n

    def mark_unseen(self, ids: list[str]) -> int:
        with self._locked():
            state = self._load()
            n = sum(1 for eid in ids if state["seen"].pop(eid, None) is not None)
            if n:
                self._save(state)
            return n

    def mark_all_seen(self, uid: str | None = None) -> int:
        ids = [e.id for e in self.entries(uid=uid, unseen_only=True)]
        return self.mark_seen(ids)

    @staticmethod
    def _prune(state: dict) -> None:
        entries = state["entries"]
        if len(entries) <= MAX_ENTRIES:
            return
        # älteste bereits gesehene zuerst entfernen, ungesehene bleiben
        def key(item):
            return item[1].get("saved_at") or item[1].get("received_at") or ""
        seen = state["seen"]
        removable = sorted((i for i in entries.items()
                            if seen.get(i[0]) == marker_of(i[1].get("saved_at"), i[1].get("rev"))), key=key)
        for eid, _ in removable[: len(entries) - MAX_ENTRIES]:
            entries.pop(eid, None)
            seen.pop(eid, None)

    # --- Lesen -----------------------------------------------------------
    def entries(self, *, unseen_only: bool = False, uid: str | None = None) -> list[Entry]:
        if not self.path.exists():          # Lesen soll nichts anlegen (weder Ordner noch Lock)
            return []
        with self._locked():
            state = self._load()
        out = [self._to_entry(raw, state["seen"]) for raw in state["entries"].values()]
        if uid:
            out = [e for e in out if e.uid == uid]
        if unseen_only:
            out = [e for e in out if e.unseen]
        out.sort(key=lambda e: (e.saved_at or e.received_at, e.received_at), reverse=True)
        return out

    def get(self, eid: str) -> Entry | None:
        return next((e for e in self.entries() if e.id == eid), None)

    def unseen_count(self) -> int:
        return len(self.entries(unseen_only=True))

    def signature(self) -> tuple[int, int]:
        """(mtime_ns, size) für günstiges Polling in TUI/Waybar."""
        try:
            st = self.path.stat()
            return st.st_mtime_ns, st.st_size
        except FileNotFoundError:
            return 0, 0

    def as_dict(self, e: Entry) -> dict:
        return asdict(e)
