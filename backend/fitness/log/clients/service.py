"""
fitness.log.clients.service — Datenabfrage, Aggregation und Analyse für Klienten.
"""
from __future__ import annotations

import json
import os
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Optional

from ...constants import ACTIVITY_EMOJI, ACTIVITY_LABEL
from ...data import (
    activity_minutes,
    classify,
    load_client_registry,
    performed_exercises,
    rollup_training_days,
    session_activities,
)
from ...paths import AOS_USERS, KLIENTEN_DIR
from .models import (
    ClientFilter,
    ClientMeta,
    ClientSessionItem,
    ClientStats,
    TimelineEntry,
)

_JOURNAL_BLOCK_RE = re.compile(r"<!--\s*(\w+):([^>]*?)\s*-->\s*(.*?)(?=<!--|\Z)", re.DOTALL)
_JOURNAL_HABIT_MARKERS = {"fshr", "fshid"}


# ── Registry & Suche ──────────────────────────────────────────────────────────

def get_clients_registry(needle: Optional[str] = None) -> list[ClientMeta]:
    """
    Lädt alle Klienten aus der Registry, dedupliziert nach Slug und
    filtert optional nach Suchbegriff (Name oder Slug).
    """
    registry = load_client_registry()
    if not registry:
        return []

    seen_slugs: set[str] = set()
    clients: list[ClientMeta] = []
    search = needle.strip().lower() if needle else None

    for meta in registry.values():
        slug = meta.get("slug", "")
        if slug in seen_slugs:
            continue
        seen_slugs.add(slug)

        name = meta.get("name", "")
        if search and search not in slug.lower() and search not in name.lower():
            continue

        uids = list(meta.get("uids") or ([meta["uid"]] if meta.get("uid") else []))
        clients.append(
            ClientMeta(
                uid=uids[0] if uids else "",
                uids=uids,
                name=name,
                slug=slug,
                client_dir=meta.get("client_dir"),
                espocrm=meta.get("espocrm"),
                crm_id=meta.get("crm_id"),
                status=meta.get("status"),
            )
        )
    return clients


# ── Sessions ──────────────────────────────────────────────────────────────────

def load_client_sessions(
    meta: ClientMeta,
    start_date: str = "0000-00-00",
    end_date: str = "9999-99-99",
) -> list[dict[str, Any]]:
    """
    Sammelt alle lokalen Workout-JSONs über alle verknüpften UIDs des Klienten
    und fasst mehrere Einheiten am selben Tag zusammen (rollup).
    """
    all_files: list[Path] = []
    for uid in meta.uids:
        sdir = AOS_USERS / uid / "fitness" / "sessions"
        if sdir.exists():
            all_files.extend(sdir.glob("*.json"))

    raw_sessions: list[dict[str, Any]] = []
    for f in all_files:
        d = f.stem[:10]
        if len(d) < 10 or d < start_date or d > end_date:
            continue
        try:
            s = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        s.setdefault("date", d)
        s["_stem"] = f.stem
        raw_sessions.append(s)

    rolled = rollup_training_days(raw_sessions)
    rolled.sort(key=lambda s: s.get("date", ""), reverse=True)
    return rolled


def parse_session_item(s: dict[str, Any]) -> ClientSessionItem:
    """Wandelt ein rohes Session-Dict in ein typisiertes ClientSessionItem um."""
    kind = classify(s)
    acts = session_activities(s)
    if not acts and isinstance(s.get("activity"), dict):
        acts = [s["activity"]]
    exs = performed_exercises(s)
    dur = activity_minutes(s)
    block = (s.get("block") or "").strip()
    effort = s.get("effort")

    return ClientSessionItem(
        date=s.get("date", ""),
        kind=kind,
        block=block,
        effort=effort,
        exercises=exs,
        activities=acts,
        total_minutes=dur,
        location=s.get("location"),
        notes=s.get("notes"),
        raw=s,
    )


# ── Rest-Days Berechnung ──────────────────────────────────────────────────────

def calculate_block_rest_gaps(sessions: list[dict[str, Any]]) -> dict[str, int]:
    """
    Berechnet für jede Kraft-Session die vergangenen Tage seit dem
    letzten Workout desselben Trainingsblocks (z.B. Push, Pull, Legs).
    Gibt {YYYY-MM-DD: rest_days} zurück.
    """
    rest_days_by_date: dict[str, int] = {}
    last_seen_by_block: dict[str, date] = {}

    for s in sorted(sessions, key=lambda x: x.get("date", "")):
        if classify(s) == "cardio":
            continue
        block = (s.get("block") or "").strip().lower()
        if not block:
            continue
        d_str = s.get("date", "")
        try:
            d_date = datetime.strptime(d_str, "%Y-%m-%d").date()
        except ValueError:
            continue

        prev = last_seen_by_block.get(block)
        if prev is not None:
            rest_days_by_date[d_str] = (d_date - prev).days
        last_seen_by_block[block] = d_date

    return rest_days_by_date


# ── Journal ───────────────────────────────────────────────────────────────────

def parse_journal_blocks(text: str) -> list[tuple[str, str]]:
    """Extrahiert formatierte Blöcke aus Markdown-Dateien."""
    blocks = []
    for m in _JOURNAL_BLOCK_RE.finditer(text):
        marker, _id, content = m.group(1), m.group(2), m.group(3).strip()
        if content:
            blocks.append((marker, content))
    if not blocks and text.strip():
        blocks.append(("?", text.strip()))
    return blocks


def journal_preview(text: str, width: int = 100) -> str:
    """Filtert Habit-Syncs heraus und formatiert Freitext-Notizen einzeilig."""
    blocks = parse_journal_blocks(text)
    content_blocks = [c for m, c in blocks if m not in _JOURNAL_HABIT_MARKERS]
    if not content_blocks:
        return ""
    preview = " / ".join(content_blocks).replace("\n", " ").strip()
    if len(preview) > width:
        preview = preview[:width] + "…"
    return preview


def _journal_dirs_for_uid(uid: str) -> list[Path]:
    """Findet alle lokalen Journal-Verzeichnisse unter ~/.aos/users/<uid>/."""
    user_root = AOS_USERS / uid
    if not user_root.exists():
        return []
    found: list[Path] = []
    for root, _dirs, _files in os.walk(user_root, followlinks=True):
        if Path(root).name == "journal":
            found.append(Path(root))
    return found


def _firestore_journal_texts(uid: str, cutoff: str) -> dict[str, list[str]]:
    """Live-Abfrage gegen Firestore fitness/{uid}/journal für neue ungesyncte Einträge."""
    try:
        from fitness.firestore._db import get_db
        db = get_db()
        from google.cloud.firestore_v1.base_query import FieldFilter
        docs = db.collection("fitness").document(uid).collection("journal").where(
            filter=FieldFilter("date", ">=", cutoff)
        ).stream()
    except Exception:
        return {}

    out: dict[str, list[str]] = {}
    for doc in docs:
        data = doc.to_dict() or {}
        d = str(data.get("date") or "")
        text = str(data.get("text") or "").strip()
        if not d or not text:
            continue
        out.setdefault(d, []).append(text)
    return out


def load_client_journal(
    meta: ClientMeta,
    cutoff: str = "0000-00-00",
    live_firestore: bool = True,
) -> dict[str, list[str]]:
    """
    Sammelt Journal-Einträge aus lokalen Markdown-Dateien und optional
    ungesyncte Einträge direkt aus Cloud Firestore.
    Gibt ein Mapping {YYYY-MM-DD: [text, ...]} zurück.
    """
    journal_by_date: dict[str, list[str]] = {}

    for uid in meta.uids:
        for jdir in _journal_dirs_for_uid(uid):
            for f in jdir.glob("*.md"):
                d = f.stem[:10]
                if len(d) != 10 or d < cutoff:
                    continue
                try:
                    preview = journal_preview(f.read_text(encoding="utf-8"))
                    if preview:
                        journal_by_date.setdefault(d, []).append(preview)
                except Exception:
                    continue

    if live_firestore:
        for uid in meta.uids:
            for d, texts in _firestore_journal_texts(uid, cutoff).items():
                existing = journal_by_date.setdefault(d, [])
                for text in texts:
                    clean_text = text.replace("\n", " ").strip()
                    if clean_text and not any(clean_text in ex for ex in existing):
                        existing.append(clean_text)

    return journal_by_date


# ── Timeline Zusammenstellung ─────────────────────────────────────────────────

def build_client_timeline(
    meta: ClientMeta,
    sessions: list[dict[str, Any]],
    journal_by_date: dict[str, list[str]],
    filters: ClientFilter,
) -> list[TimelineEntry]:
    """
    Verbindet Sessions und Journal-Einträge zu einer chronologischen Timeline
    und wendet alle Filter (Block, Typ, Rest-Tage) sauber an.
    """
    session_by_date = {s.get("date", ""): s for s in sessions}
    rest_gaps = calculate_block_rest_gaps(sessions)

    all_dates = set(session_by_date)
    if filters.include_journal or filters.journal_only:
        all_dates |= set(journal_by_date)

    timeline: list[TimelineEntry] = []

    for d in sorted(all_dates, reverse=True):
        if filters.since and d < filters.since:
            continue
        if filters.until and d > filters.until:
            continue

        raw_s = session_by_date.get(d)
        session_item: Optional[ClientSessionItem] = None
        gap = rest_gaps.get(d)

        if raw_s is not None and not filters.journal_only:
            parsed = parse_session_item(raw_s)
            keep = True

            if filters.workout_type:
                wtype = filters.workout_type.lower()
                if wtype == "strength" and parsed.kind == "cardio":
                    keep = False
                elif wtype == "cardio" and parsed.kind != "cardio":
                    keep = False

            if keep and filters.block:
                if parsed.block.strip().lower() != filters.block.strip().lower():
                    keep = False

            if keep and filters.min_rest is not None:
                if parsed.kind == "cardio" or gap is None or gap < filters.min_rest:
                    keep = False

            if keep and filters.max_rest is not None:
                if parsed.kind == "cardio" or gap is None or gap > filters.max_rest:
                    keep = False

            if keep:
                session_item = parsed

        j_notes = journal_by_date.get(d, []) if (filters.include_journal or filters.journal_only) else []

        if session_item is not None or j_notes:
            timeline.append(
                TimelineEntry(
                    date=d,
                    session=session_item,
                    journal_notes=j_notes,
                    rest_days=gap,
                )
            )

    return timeline


# ── Statistiken ───────────────────────────────────────────────────────────────

def compute_client_stats(meta: ClientMeta, sessions: list[dict[str, Any]], days_window: int = 90) -> ClientStats:
    """Berechnet aggregierte Kennzahlen für das Klienten-Coaching."""
    strength_sessions = [s for s in sessions if classify(s) != "cardio"]
    cardio_sessions = [s for s in sessions if classify(s) == "cardio"]

    block_counts: dict[str, int] = {}
    rpe_values: list[int] = []
    total_exercises = 0

    for s in strength_sessions:
        bl = (s.get("block") or "?").strip()
        block_counts[bl] = block_counts.get(bl, 0) + 1
        eff = s.get("effort")
        if isinstance(eff, int):
            rpe_values.append(eff)
        total_exercises += len(performed_exercises(s))

    rest_gaps = calculate_block_rest_gaps(sessions)
    gap_values = list(rest_gaps.values())

    first_date = min((s.get("date", "") for s in sessions), default=None)
    last_date = max((s.get("date", "") for s in sessions), default=None)

    total_s = len(sessions)
    weeks = max(1.0, days_window / 7.0)
    per_week = round(total_s / weeks, 1)

    return ClientStats(
        client_name=meta.name,
        slug=meta.slug,
        total_sessions=total_s,
        strength_sessions=len(strength_sessions),
        cardio_sessions=len(cardio_sessions),
        block_counts=block_counts,
        total_exercises=total_exercises,
        avg_rpe=round(sum(rpe_values) / len(rpe_values), 1) if rpe_values else None,
        avg_rest_days=round(sum(gap_values) / len(gap_values), 1) if gap_values else None,
        first_date=first_date,
        last_date=last_date,
        sessions_per_week=per_week,
    )
