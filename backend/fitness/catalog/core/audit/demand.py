from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

from fitness.catalog.core.resolver import build_exercise_index
from fitness.catalog.core.session_signal import exercise_has_training_signal

UNREVIEWED_SOURCES = {"bulk", "inbox", "yuhonas"}


@dataclass
class DemandEntry:
    exercise_id: str
    display_name: str
    source: str
    log_count: int


@dataclass
class DemandAuditResult:
    total_unreviewed: int
    total_logged_users_sessions: int
    entries: list[DemandEntry] = field(default_factory=list)
    error: str | None = None


def _count_logged_exercises() -> Counter:
    """Zaehlt exercise_id-Vorkommen ueber die sessions-Collection ALLER User in Firestore."""
    from fitness.firestore._db import get_db

    db = get_db()
    counts: Counter = Counter()
    for doc in db.collection_group("sessions").stream():
        data = doc.to_dict() or {}
        for ex in data.get("exercises", []) or []:
            if not isinstance(ex, dict) or not exercise_has_training_signal(ex):
                continue
            ex_id = ex.get("exercise_id") or ex.get("id")
            if ex_id:
                counts[ex_id] += 1
    return counts


def run_demand_audit(limit: int = 20) -> DemandAuditResult:
    """Demand-Driven Audit: welche unreviewten Exercises werden real am haeufigsten geloggt.

    Kreuzt die tatsaechliche Nutzung (Firestore sessions, alle User) gegen den
    KB-Stand (build_exercise_index) und liefert die am haeufigsten geloggten,
    noch nicht auf 'expert'-Tier gehobenen Exercises - Grundlage fuer die
    Gemini-Enrichment/Inbox-Review-Pipeline (analog zu anatomy-kb's
    DAEMON_REFINEMENT.md, hier fuer den fitness-catalog selbst).
    """
    index = build_exercise_index()
    unreviewed = {r.exercise_id: r for r in index if r.source in UNREVIEWED_SOURCES}

    try:
        log_counts = _count_logged_exercises()
    except Exception as exc:
        return DemandAuditResult(
            total_unreviewed=len(unreviewed),
            total_logged_users_sessions=0,
            entries=[],
            error=str(exc),
        )

    entries = [
        DemandEntry(
            exercise_id=ex_id,
            display_name=rec.display_name,
            source=rec.source,
            log_count=log_counts.get(ex_id, 0),
        )
        for ex_id, rec in unreviewed.items()
    ]
    entries = [e for e in entries if e.log_count > 0]
    entries.sort(key=lambda e: e.log_count, reverse=True)

    return DemandAuditResult(
        total_unreviewed=len(unreviewed),
        total_logged_users_sessions=sum(log_counts.values()),
        entries=entries[:limit],
    )
