from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from fitness.catalog.core.paths import RUNTIME_SUBDIRS, runtime_root


@dataclass
class BootstrapEvent:
    level: str
    message: str


def bootstrap(force: bool = False) -> list[BootstrapEvent]:
    events: list[BootstrapEvent] = []
    runtime = runtime_root()
    runtime.mkdir(parents=True, exist_ok=True)
    events.append(BootstrapEvent("OK", f"{runtime} exists"))
    for relative_dir in RUNTIME_SUBDIRS:
        directory = runtime / relative_dir
        directory.mkdir(parents=True, exist_ok=True)
        events.append(BootstrapEvent("OK", f"{relative_dir} ready"))
    return events
