"""Datenschicht der Console-TUI: reine Funktionen ohne UI, einzeln testbar.

Liest nur Dateien (Klienten-Registry, Sessions, Journal, Drafts) — kein Server.
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

from ...constants import WEEKDAYS_DE
from ...data import load_client_registry, parse_date_stem, performed_exercises
from ...paths import AOS_USERS
from .daemon import UNIT as DAEMON_UNIT
from .drafts import list_drafts
from .gap_check import NON_COACHING_STATUSES

GAP_WARN_DAYS = 3
GAP_ALERT_DAYS = 6  # = coach_ai.GAP_THRESHOLD_DAYS


@dataclass
class Client:
    slug: str
    name: str
    uids: list[str]
    status: str = ""
    meta: dict = field(default_factory=dict)
    last_date: str | None = None
    last_block: str = ""
    days_since: int | None = None
    sessions_28d: int = 0
    open_drafts: int = 0

    @property
    def coaching(self) -> bool:
        return self.status not in NON_COACHING_STATUSES


def clients(registry: dict | None = None) -> list[Client]:
    """Ein Eintrag pro Klient (die Registry führt Multi-UID-Klienten mehrfach)."""
    registry = registry if registry is not None else load_client_registry()
    seen: dict[str, Client] = {}
    for meta in registry.values():
        slug = meta["slug"]
        if slug in seen:
            continue
        seen[slug] = Client(
            slug=slug, name=meta["name"], uids=list(meta.get("uids") or [meta["uid"]]),
            status=meta.get("status") or "", meta=meta,
        )
    out = list(seen.values())
    pending = open_draft_counts()
    today = date.today()
    cutoff = (today - timedelta(days=28)).isoformat()
    for c in out:
        dates: list[tuple[str, Path]] = []
        for uid in c.uids:
            sdir = AOS_USERS / uid / "fitness" / "sessions"
            if sdir.exists():
                for f in sdir.glob("*.json"):
                    d = parse_date_stem(f.stem)
                    if d:
                        dates.append((d, f))
        if dates:
            dates.sort(reverse=True)
            c.last_date = dates[0][0]
            c.days_since = (today - date.fromisoformat(c.last_date)).days
            c.sessions_28d = len({d for d, _ in dates if d >= cutoff})
            c.last_block = (_read(dates[0][1]) or {}).get("block") or ""
        c.open_drafts = sum(pending.get(u, 0) for u in c.uids)
    return out


def sort_clients(items: list[Client], mode: str) -> list[Client]:
    if mode == "gap":  # längste Pause zuerst, Klienten ohne Daten ganz oben
        return sorted(items, key=lambda c: (-(c.days_since if c.days_since is not None else 10**6), c.name))
    if mode == "name":
        return sorted(items, key=lambda c: c.name.lower())
    return sorted(items, key=lambda c: (c.last_date or "", c.name), reverse=True)  # zuletzt aktiv


def gap_style(c: Client) -> str:
    if c.days_since is None:
        return "dim"
    if not c.coaching:
        return "dim"
    if c.days_since >= GAP_ALERT_DAYS:
        return "bold red"
    if c.days_since >= GAP_WARN_DAYS:
        return "yellow"
    return "green"


# ── Sessions ──────────────────────────────────────────────────────────────────

def _read(path: Path) -> dict | None:
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else None
    except Exception:
        return None


def session_files(c: Client) -> list[tuple[str, Path]]:
    """[(datum, pfad)] neueste zuerst, über alle UIDs des Klienten."""
    out: list[tuple[str, Path]] = []
    for uid in c.uids:
        sdir = AOS_USERS / uid / "fitness" / "sessions"
        if sdir.exists():
            for f in sdir.glob("*.json"):
                d = parse_date_stem(f.stem)
                if d:
                    out.append((d, f))
    return sorted(out, key=lambda t: (t[0], t[1].name), reverse=True)


def fmt_sets(sets: list[dict]) -> str:
    """[{reps:8,weight:60}]*3 → '3×8 @ 60 kg'; verschieden → '8@60 · 8@60 · 6@65'."""
    if not sets:
        return "—"
    def w(s):  # Gewicht
        v = str(s.get("weight", "") or "").strip()
        return f"{v} kg" if v else "KG"
    def r(s):
        v = str(s.get("reps", "") or "").strip()
        return v or "?"
    pairs = [(r(s), w(s)) for s in sets]
    if len(set(pairs)) == 1:
        reps, weight = pairs[0]
        return f"{len(pairs)}×{reps}" + ("" if weight == "KG" else f" @ {weight}")
    return " · ".join(f"{rp}" + ("" if wt == "KG" else f"@{wt.removesuffix(' kg')}") for rp, wt in pairs)


def session_text(session: dict) -> "Text":
    """Detail-Ansicht einer Session als rich.Text (Kliententexte werden nie als Markup geparst)."""
    from rich.text import Text

    d = str(session.get("date", "?"))
    try:
        wd = WEEKDAYS_DE[date.fromisoformat(d[:10]).weekday()]
    except Exception:
        wd = ""
    t = Text()
    t.append(f"{wd} {d}".strip(), style="bold")
    for label, key in (("Block", "block"), ("Art", "trainingsart"), ("Ort", "location")):
        if session.get(key):
            t.append("  ·  ", style="dim")
            t.append(f"{label}: {session[key]}")
    if session.get("effort"):
        t.append("  ·  ", style="dim")
        t.append(f"RPE {session['effort']}")
    if session.get("duration"):
        t.append("  ·  ", style="dim")
        t.append(f"{session['duration']} min")
    t.append("\n\n")
    exs = performed_exercises(session) or list(session.get("exercises") or [])
    for ex in exs:
        name = str(ex.get("name") or ex.get("exercise_id") or ex.get("id") or "?")
        t.append("  ")
        t.append(name, style="cyan")
        t.append(f"  {fmt_sets(ex.get('setsArray') or [])}")
        if ex.get("note"):
            t.append(f"  — {ex['note']}", style="dim")
        t.append("\n")
    if not exs:
        t.append("  keine Übungen\n", style="dim")
    acts = list(session.get("activityAddons") or [])
    if not acts and session.get("activity"):
        acts = [session["activity"]]
    for a in acts:
        bits = [str(a.get("type", "")), f"{a['duration']} min" if a.get("duration") else "",
                str(a.get("muscleTarget") or ""), str(a.get("notes") or "")]
        t.append("  + " + " · ".join(b for b in bits if b) + "\n", style="magenta")
    if session.get("notes"):
        t.append("\nNotiz: ", style="dim")
        t.append(str(session["notes"]))
    return t


# ── Journal ───────────────────────────────────────────────────────────────────

def journal_entries(c: Client, limit: int = 5) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for uid in c.uids:
        jdir = AOS_USERS / uid / "fitness" / "journal"
        if jdir.exists():
            for f in jdir.glob("*.md"):
                try:
                    out.append((f.stem, f.read_text(encoding="utf-8").strip()))
                except Exception:
                    pass
    return sorted(out, key=lambda t: t[0], reverse=True)[:limit]


# ── Drafts ────────────────────────────────────────────────────────────────────

CLOSED = {"approved", "discarded", "dismissed"}


def open_draft_counts() -> dict[str, int]:
    counts: dict[str, int] = {}
    for d in list_drafts():
        if d.get("status") not in CLOSED:
            counts[d.get("uid", "")] = counts.get(d.get("uid", ""), 0) + 1
    return counts


def drafts_for(c: Client | None, include_closed: bool = False) -> list[dict]:
    out = []
    for d in list_drafts():
        if c is not None and d.get("uid") not in c.uids:
            continue
        if not include_closed and d.get("status") in CLOSED:
            continue
        out.append(d)
    return out


# ── Daemon ────────────────────────────────────────────────────────────────────

def daemon_state() -> str:
    """active | inactive | failed | … (systemctl --user is-active)."""
    try:
        r = subprocess.run(["systemctl", "--user", "is-active", DAEMON_UNIT], capture_output=True, text=True, timeout=3)
        return r.stdout.strip() or "unknown"
    except Exception:
        return "unknown"
