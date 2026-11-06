from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from fitness.catalog.core.muscle_normalization import normalize_exercise_muscle_list
from fitness.catalog.core.resolver import build_exercise_index
from fitness.catalog.core.source_merge import _entries_from_file, find_source_entries

_REGION_PREFIX = re.compile(r"^(\d)")


def _region(muscle_id: str) -> str:
    """Erste Ziffer der Muskel-Id = Koerperregion (1xx=Brust, 2xx=Ruecken,
    3xx=Schultern, 4xx=Arme, 5xx=Core, 6xx=Beine, 7xx=Waden, siehe
    CLAUDE.md-Konvention). wger/yuhonas listen typischerweise nur 1-3
    Hauptmuskeln und ordnen Rolle (primary/secondary) oft anders zu als der
    Katalog — ein Exakt-Id- oder sogar Parent-Abgleich produzierte dadurch
    ueberwiegend Falsch-Positive bei legitimer Katalog-Anreicherung (z.B.
    "cable_row"-Sekundaermuskel brachialis: biomechanisch korrekt, aber in
    keiner der schmalen Rohquellen gelistet). Regions-Ebene ist die
    verlaessliche Grenze: ein Muskel aus einer KOMPLETT anderen Koerperregion
    als alles, was wger/yuhonas nennen, ist der eigentliche Fehlerfall
    ("komplett falscher Muskel"), den dieser Audit finden soll."""
    match = _REGION_PREFIX.match(muscle_id)
    return match.group(1) if match else muscle_id

# Nur "inbox" pruefen (Gemini-angereicherte Drafts) — NICHT "bulk" (die
# rohen wger-Bulk-Importe selbst, ~1640 Records: die gegen ihre eigene
# wger-Herkunft zu pruefen ist ein trivialer No-Op und macht den Audit bei
# der Katalog-Groesse unbrauchbar langsam) und nicht "expert"/approved
# (von einem Menschen bereits bestaetigt, ein Coach-ergaenzter Muskel ohne
# wger/yuhonas-Beleg ist dort kein Fehler, sondern Expertenwissen).
CHECKED_SOURCES = {"inbox"}

# Stabilizers sind eine reine Katalog-Erweiterung — weder wger noch yuhonas
# kennen dieses Konzept, ein Abgleich wuerde dort fast immer "unbelegt"
# schreien, obwohl das der Normalfall ist. Nur primary/secondary pruefen,
# das sind die Rollen, die beide Rohquellen tatsaechlich klassifizieren.
CHECKED_ROLES = ("primary_muscles", "secondary_muscles")


@dataclass
class MuscleFlag:
    exercise_id: str
    display_name: str
    role: str  # "primary_muscles" | "secondary_muscles"
    muscle_id: str
    sources_checked: list[str]


@dataclass
class SourceConsistencyResult:
    total_checked: int
    total_without_source: int
    flags: list[MuscleFlag] = field(default_factory=list)


def _source_muscle_ids(wger_entry: dict[str, Any] | None, yuhonas_entry: dict[str, Any] | None) -> set[str]:
    """Rohe Muskel-Ids/-Namen aus wger + yuhonas zu einer vergleichbaren Menge
    kanonischer Ids zusammenfassen. wger-Rohdaten liegen bereits in
    Katalog-Taxonomie vor (siehe unreviewed_wger.yml), yuhonas-Rohdaten sind
    freie englische Namen ("hamstrings", "glutes") und muessen erst ueber
    canonicalize_muscle_id()/muscle_index.yml's string_aliases normalisiert
    werden."""
    ids: set[str] = set()
    if wger_entry:
        ids.update(wger_entry.get("primary_muscles") or [])
        ids.update(wger_entry.get("secondary_muscles") or [])
    if yuhonas_entry:
        raw_names = (yuhonas_entry.get("primary_muscles") or []) + (yuhonas_entry.get("secondary_muscles") or [])
        ids.update(normalize_exercise_muscle_list(raw_names, str(yuhonas_entry.get("display_name") or "")))
    return ids


def run_source_consistency_audit() -> SourceConsistencyResult:
    """Nutzt die rohen unreviewed_wger.yml/unreviewed_yuhonas.yml-Eintraege als
    Source-of-Truth und prueft, ob primary_muscles/secondary_muscles eines
    unreviewten Katalog-/Inbox-Records auf REGIONS-Ebene (Brust/Ruecken/
    Schultern/Arme/Core/Beine/Waden) durch mindestens eine der beiden
    Rohquellen gedeckt sind. Bewusst kein Exakt-Id-Abgleich: wger/yuhonas
    listen typischerweise nur 1-3 Hauptmuskeln und ordnen Rollen anders zu
    als der Katalog, ein strengerer Abgleich produzierte fast nur
    Falsch-Positive bei legitimer Anreicherung (siehe `_region()`). Ein
    Muskel aus einer Koerperregion, die KEINE verlinkte Quelle ueberhaupt
    erwaehnt, ist die eigentlich harte Auffaelligkeit (potenziell von Gemini
    erfunden/komplett fehlklassifiziert) — kein Hard-Error, sondern ein
    Hinweis fuer die manuelle Review (Coach-Sheet/Coach-Inbox).

    Records ohne verlinkte Quelle (find_source_entries findet weder wger noch
    yuhonas) koennen nicht geprueft werden und landen in total_without_source,
    nicht in flags — kein SOT vorhanden heisst nicht automatisch "falsch"."""
    records = build_exercise_index()
    flags: list[MuscleFlag] = []
    checked = 0
    without_source = 0

    # Einmal laden, an find_source_entries() durchreichen — sonst laedt
    # jeder der ~40 Records dieselben zwei YAML-Dateien neu (dominierte
    # vorher die Laufzeit, siehe Docstring von find_source_entries()).
    wger_entries = _entries_from_file("unreviewed_wger.yml")
    yuhonas_entries = _entries_from_file("unreviewed_yuhonas.yml")

    for record in records:
        if record.source not in CHECKED_SOURCES:
            continue

        found = find_source_entries(
            record.display_name,
            record.exercise_id,
            record=record,
            wger_entries=wger_entries,
            yuhonas_entries=yuhonas_entries,
        )
        wger_entry, yuhonas_entry = found.get("wger"), found.get("yuhonas")
        if not wger_entry and not yuhonas_entry:
            without_source += 1
            continue

        checked += 1
        corroborated = _source_muscle_ids(wger_entry, yuhonas_entry)
        if not corroborated:
            continue
        corroborated_regions = {_region(m) for m in corroborated}

        sources_checked = [name for name, entry in (("wger", wger_entry), ("yuhonas", yuhonas_entry)) if entry]
        for role in CHECKED_ROLES:
            for muscle_id in getattr(record, role, None) or []:
                if _region(muscle_id) not in corroborated_regions:
                    flags.append(
                        MuscleFlag(
                            exercise_id=record.exercise_id,
                            display_name=record.display_name,
                            role=role,
                            muscle_id=muscle_id,
                            sources_checked=sources_checked,
                        )
                    )

    return SourceConsistencyResult(
        total_checked=checked,
        total_without_source=without_source,
        flags=flags,
    )
