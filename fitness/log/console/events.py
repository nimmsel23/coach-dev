"""Kleine Shared-Helfer: Klienten-Name-Lookup, Event-Zeilen-Formatierung."""
from __future__ import annotations

import time

from ...render import c


def client_name(uid: str, registry: dict) -> str:
    for meta in registry.values():
        if uid in (meta.get("uids") or [meta.get("uid")]):
            return meta["name"]
    return uid[:12] + "…"


def timestamp() -> str:
    return time.strftime("%H:%M:%S")


def event_line(label_color: str, label: str, name: str, detail: str) -> str:
    ts = timestamp()
    return f"{c('dim', ts)}  {c('accent', name)}  {c(label_color, label)}  {detail}"
