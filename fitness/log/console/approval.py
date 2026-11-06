"""Interaktive Freigabe von Feedback-Entwuerfen per Tastendruck.

Schritt 2 im console-Ausbau (Persistenz -> interaktive Freigabe -> Senden an
Klient, siehe console/__init__.py). Baut auf drafts.py auf: der Freigabe-
Status wird ins bereits persistierte Draft-JSON zurueckgeschrieben, kein
zweiter State-Speicher.

Nur Feedback-Entwuerfe durchlaufen die Freigabe — Gap-Erklaerungen sind rein
informativ, niemand "verschickt" sie an einen Klienten.
"""
from __future__ import annotations

import queue as _queue
from dataclasses import dataclass
from pathlib import Path

from .drafts import mark_status
from .events import event_line


@dataclass
class PendingDraft:
    path: Path
    name: str
    text: str


def handle_key(
    key: str,
    current: "PendingDraft | None",
    review_queue: "_queue.Queue[PendingDraft]",
    events: "_queue.Queue[str]",
) -> "PendingDraft | None":
    if current is None:
        return current

    if key == "a":
        mark_status(current.path, "approved")
        events.put(event_line("green", "Freigegeben", current.name, current.text[:80]))
    elif key == "d":
        mark_status(current.path, "discarded")
        events.put(event_line("dim", "Verworfen", current.name, current.text[:80]))
    elif key == "s":
        events.put(event_line("dim", "Uebersprungen (bleibt pending)", current.name, ""))
    else:
        return current

    try:
        return review_queue.get_nowait()
    except _queue.Empty:
        return None
