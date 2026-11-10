from __future__ import annotations

from typing import Any

from fitness.catalog.core.loader import load_catalog_directory_yaml


def load_all_notes() -> list[dict[str, Any]]:
    notes: list[dict[str, Any]] = []
    for _, document in load_catalog_directory_yaml("coaching_notes"):
        if isinstance(document, dict) and document.get("id"):
            notes.append(document)
    return notes


def find_note(note_id: str) -> dict[str, Any] | None:
    for note in load_all_notes():
        if note.get("id") == note_id:
            return note
    return None


def load_open_product_signals() -> list[dict[str, Any]]:
    """Produkt-/UX-Reibungspunkte aus coaching_notes (status: open), über alle Notes."""
    signals: list[dict[str, Any]] = []
    for note in load_all_notes():
        for signal in note.get("product_signals") or []:
            if isinstance(signal, dict) and signal.get("status", "open") == "open":
                signals.append({**signal, "note_id": note.get("id")})
    return signals


def find_notes_by_tag(tag: str) -> list[dict[str, Any]]:
    tag = tag.strip().lower()
    matches: list[dict[str, Any]] = []
    for note in load_all_notes():
        tags = [str(t).lower() for t in (note.get("tags") or [])]
        activity_types = [str(t).lower() for t in (note.get("applies_to", {}).get("activity_types") or [])]
        topics = [str(t).lower() for t in (note.get("applies_to", {}).get("topics") or [])]
        if tag in tags or tag in activity_types or tag in topics:
            matches.append(note)
    return matches
