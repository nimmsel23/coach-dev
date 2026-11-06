"""Write-capable muscle KB service for the catalog SSOT.

This module is the canonical read/write layer for `fitness/catalog/kb/muscles`.
HTTP adapters may still expose routes under `/fitness/anatomy/*`, but the
underlying data belongs to the catalog knowledge base, not a separate anatomy
subsystem.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

import yaml

from fitness.catalog.core.muscles import (
    build_muscle_document,
    iter_muscle_documents,
    iter_muscle_files,
    load_muscle_index,
)

_COMPUTED_FIELDS = {"doc_id", "kb_level", "region", "catalog_id"}


def list_muscles() -> list[str]:
    return sorted(doc_id for doc_id, doc in iter_muscle_documents() if doc.get("kb_level") == "muscle")


def find_muscle_path(muscle_id: str) -> Optional[Path]:
    for path in iter_muscle_files():
        if path.stem == muscle_id:
            return path
    return None


def load_muscle(muscle_id: str) -> Optional[dict[str, Any]]:
    path = find_muscle_path(muscle_id)
    if not path:
        return None
    built = build_muscle_document(path, load_muscle_index())
    return built[1] if built else None


def save_muscle(muscle_id: str, data: dict[str, Any]) -> Path:
    path = find_muscle_path(muscle_id)
    if not path:
        raise FileNotFoundError(
            f"Keine KB-Datei für Muskel-ID '{muscle_id}' unter fitness/catalog/kb/muscles/"
        )
    clean = {k: v for k, v in data.items() if k not in _COMPUTED_FIELDS}
    path.write_text(
        yaml.dump(clean, allow_unicode=True, default_flow_style=False, sort_keys=False),
        encoding="utf-8",
    )
    return path


def update_muscle(muscle_id: str, anatomy: dict[str, Any], force: bool = False) -> tuple[Path, bool]:
    existing = load_muscle(muscle_id)
    if existing is None:
        raise FileNotFoundError(f"Keine KB-Datei für Muskel-ID '{muscle_id}'")
    if force or not existing.get("origin"):
        for field in ("origin", "insertion", "innervation", "function"):
            if anatomy.get(field):
                existing[field] = anatomy[field]
    return save_muscle(muscle_id, existing), True
