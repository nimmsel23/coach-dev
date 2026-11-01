"""Sperrliste für Nicht-Übungen (Aktivitäten wie HIIT), siehe kb/registry/non_exercises.yml.

Matching nur über IDs (exercise_id / id / wger_id / yuhonas_id), nie über Namen.
"""
from __future__ import annotations

from typing import Any

from fitness.catalog.core.loader import load_catalog_yaml


def _text(value: Any) -> str:
    return str(value).strip() if value not in (None, "") else ""


def load_non_exercise_ids() -> dict[str, set[str]]:
    """Gibt {'ids': {...}, 'wger': {...}, 'yuhonas': {...}} aus der Registry zurück."""
    try:
        doc = load_catalog_yaml("registry/non_exercises.yml") or {}
    except FileNotFoundError:
        return {"ids": set(), "wger": set(), "yuhonas": set()}
    ids: set[str] = set()
    wger: set[str] = set()
    yuhonas: set[str] = set()
    for entry in doc.get("entries") or []:
        if not isinstance(entry, dict):
            continue
        if _text(entry.get("exercise_id")):
            ids.add(_text(entry["exercise_id"]))
        if _text(entry.get("wger_id")):
            wger.add(_text(entry["wger_id"]))
        if _text(entry.get("yuhonas_id")):
            yuhonas.add(_text(entry["yuhonas_id"]).casefold())
    return {"ids": ids, "wger": wger, "yuhonas": yuhonas}


def is_non_exercise(entry: Any, blocked: dict[str, set[str]] | None = None) -> bool:
    """True, wenn der Katalog-/Roh-Eintrag auf der Sperrliste steht."""
    if not isinstance(entry, dict):
        return False
    blocked = blocked if blocked is not None else load_non_exercise_ids()
    for key in ("exercise_id", "id"):
        if _text(entry.get(key)) in blocked["ids"]:
            return True
    if _text(entry.get("wger_id")) in blocked["wger"]:
        return True
    yuhonas_id = _text(entry.get("yuhonas_id"))
    return bool(yuhonas_id) and yuhonas_id.casefold() in blocked["yuhonas"]
