"""Typen für Live-Events (Daemon) und die austauschbare Listener-Schnittstelle."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Protocol

from backend.sync.pull import RemoteDoc


@dataclass(frozen=True)
class RemoteEvent:
    uid: str
    kind: str                 # "added" | "modified" | "removed"
    doc_id: str
    doc: RemoteDoc | None     # None bei "removed"


class Handle(Protocol):
    def alive(self) -> bool: ...
    def stop(self) -> None: ...


class Listener(Protocol):
    def start(self, uids: list[str], emit: Callable[[RemoteEvent], None]) -> Handle: ...
