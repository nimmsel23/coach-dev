"""Lesende Workout-Chronik aus dem SessionStore; erzeugt keine Inbox-Einträge."""
from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from typing import Callable

from backend.core.clients import Client, load_clients
from backend.core.store import InvalidDocId, SessionStore, check_doc_id
from backend.notifier.inbox import Entry, entry_id
from backend.sync.notify import describe


class Chronicle:
    def __init__(self, root: Path, *, days: int = 5, clock: Callable[[], date] = date.today,
                 clients: dict[str, Client] | None = None):
        if days < 1:
            raise ValueError("days muss positiv sein")
        self.store = SessionStore(root)
        self.days, self.clock, self.clients = days, clock, clients
        self.skipped = 0

    @property
    def period(self) -> tuple[date, date]:
        end = self.clock()
        return end - timedelta(days=self.days - 1), end

    def _files(self) -> list[tuple[str, str, Path]]:
        files = []
        for user in sorted((self.store.root / "users").glob("*")):
            try:
                check_doc_id(user.name)
            except InvalidDocId:
                continue
            for doc in sorted(self.store.list_ids(user.name)):
                files.append((user.name, doc, self.store.path(user.name, doc)))
        return files

    def signature(self) -> tuple:
        # Nur stat, kein JSON-Parsing im Polling. Datum hält das Fenster bei Mitternacht aktuell.
        out = [self.clock().isoformat()]
        for uid, doc, path in self._files():
            try:
                st = path.stat()
            except FileNotFoundError:
                continue
            out.append((uid, doc, st.st_mtime_ns, st.st_size))
        return tuple(out)

    def entries(self, *, uid: str | None = None) -> list[Entry]:
        start, end = self.period
        clients = self.clients if self.clients is not None else load_clients()
        out = []
        self.skipped = 0
        for person, doc, _path in self._files():
            if uid and person != uid:
                continue
            data, _error = self.store.read(person, doc)
            if data is None:
                self.skipped += 1
                continue
            try:
                day = date.fromisoformat(str(data.get("date") or doc.split("__")[0])[:10])
            except ValueError:
                self.skipped += 1
                continue
            if not start <= day <= end:
                continue
            client = clients.get(person)
            try:
                rev = int(data.get("rev") or 0)
                summary = describe(data)
            except (TypeError, ValueError, AttributeError):
                self.skipped += 1
                continue
            out.append(Entry(
                id=entry_id(person, doc), uid=person,
                client=client.name if client else person[:12], doc_id=doc,
                date=day.isoformat(), action="chronik", summary=summary,
                saved_at=str(data.get("saved_at") or ""), rev=rev, received_at="",
                mode=str(data.get("sessionMode") or ""), effort=data.get("effort"), unseen=False,
            ))
        out.sort(key=lambda e: (e.date, e.saved_at, e.id), reverse=True)
        return out
