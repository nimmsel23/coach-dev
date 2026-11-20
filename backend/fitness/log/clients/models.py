"""
fitness.log.clients.models — Datenmodelle für Klienten-Logging und -Analyse.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional


@dataclass
class ClientMeta:
    """Metadaten eines registrierten Klienten."""
    uid: str
    uids: list[str]
    name: str
    slug: str
    client_dir: Optional[Path] = None
    espocrm: Optional[dict[str, Any]] = None
    crm_id: Optional[str] = None
    status: Optional[str] = None


@dataclass
class ClientSessionItem:
    """Ein einzelner Trainingstag / Workout eines Klienten."""
    date: str
    kind: str  # "strength", "cardio", "strength+addon"
    block: str = ""
    effort: Optional[int] = None
    exercises: list[dict[str, Any]] = field(default_factory=list)
    activities: list[dict[str, Any]] = field(default_factory=list)
    total_minutes: int = 0
    location: Optional[str] = None
    notes: Optional[str] = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class TimelineEntry:
    """Chronologischer Eintrag (Session und/oder Journal-Freitext)."""
    date: str
    session: Optional[ClientSessionItem] = None
    journal_notes: list[str] = field(default_factory=list)
    rest_days: Optional[int] = None


@dataclass
class ClientFilter:
    """Filterkriterien für Klientenabfragen."""
    client_name: Optional[str] = None
    days: int = 90
    all_history: bool = False
    since: Optional[str] = None
    until: Optional[str] = None
    workout_type: Optional[str] = None  # None | "strength" | "cardio"
    block: Optional[str] = None
    min_rest: Optional[int] = None
    max_rest: Optional[int] = None
    include_journal: bool = False
    journal_only: bool = False
    live_firestore: bool = True
    detail: bool = False


@dataclass
class ClientStats:
    """Aggregierte Statistiken eines Klienten."""
    client_name: str
    slug: str
    total_sessions: int
    strength_sessions: int
    cardio_sessions: int
    block_counts: dict[str, int] = field(default_factory=dict)
    total_exercises: int = 0
    avg_rpe: Optional[float] = None
    avg_rest_days: Optional[float] = None
    first_date: Optional[str] = None
    last_date: Optional[str] = None
    sessions_per_week: float = 0.0
