"""Alias-Auflösung für Muskel-IDs.

Nutzt das aliases:-Feld, das schon in kb/muscles/**/*.yml gepflegt wird
(z.B. 601_quadriceps_femoris.yml: aliases: [quads, quadriceps, quadrizeps]) —
kein separates Index-/Normalisierungs-Schema nötig.
"""
from __future__ import annotations

from typing import Optional

from fitness.catalog.core.muscles import iter_muscle_documents


def canonical_id(name: str) -> Optional[str]:
    """Findet die kanonische Muskel-ID für ID, Alias oder Label (fuzzy, case-insensitive)."""
    key = name.lower().strip()
    if not key:
        return None
    for doc_id, doc in iter_muscle_documents():
        if doc.get("kb_level") != "muscle":
            continue
        if key == doc_id.lower():
            return doc_id
        if key in {a.lower() for a in (doc.get("aliases") or [])}:
            return doc_id
        for field in ("display_name", "label_de", "label_en", "label_lat"):
            val = doc.get(field)
            if val and key in str(val).lower():
                return doc_id
    return None
