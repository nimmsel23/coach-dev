"""Waybar-Custom-Modul: JSON mit Zähler ungesehener Workouts.

  "custom/fitness": {"exec": "python3 -m backend.notifier waybar --follow", "return-type": "json",
                     "on-click": "…/fitness-inbox toggle"}
"""
from __future__ import annotations

import json
import sys
import time
from typing import Callable, TextIO

from backend.notifier.config import WaybarCfg
from backend.notifier.inbox import Inbox
from backend.notifier.popup import escape_markup


def payload(inbox: Inbox, cfg: WaybarCfg) -> dict:
    unseen = inbox.entries(unseen_only=True)
    n = len(unseen)
    if n == 0:
        return {"text": cfg.format_empty, "tooltip": "Keine neuen Workouts", "class": "empty", "alt": "empty",
                "percentage": 0}
    lines = [f"{escape_markup(e.client)}  {escape_markup(e.date)}  {escape_markup(e.summary.splitlines()[0] if e.summary else '')}"
             for e in unseen[: cfg.tooltip_max]]
    if n > cfg.tooltip_max:
        lines.append(f"… und {n - cfg.tooltip_max} weitere")
    return {"text": cfg.format.format(count=n), "tooltip": "\n".join(lines), "class": "unseen", "alt": "unseen",
            "percentage": min(100, n * 10)}


def emit(inbox: Inbox, cfg: WaybarCfg, out: TextIO | None = None) -> None:
    out = out or sys.stdout
    out.write(json.dumps(payload(inbox, cfg), ensure_ascii=False) + "\n")
    out.flush()


def follow(inbox: Inbox, cfg: WaybarCfg, *, out: TextIO | None = None, interval: float = 1.0,
           sleep: Callable[[float], None] = time.sleep, max_loops: int | None = None) -> None:
    """Gibt bei jeder Änderung der Inbox eine neue Zeile aus (und einmal beim Start)."""
    out = out or sys.stdout
    last = None
    loops = 0
    while max_loops is None or loops < max_loops:
        sig = inbox.signature()
        if sig != last:
            emit(inbox, cfg, out)
            last = sig
        loops += 1
        if max_loops is None or loops < max_loops:
            sleep(interval)
