"""Desktop-Benachrichtigung für eingehende Klienten-Workouts (notify-send → swaync).

Einfacher Modus (Standard): eine Meldung pro Workout über `send`.
Reicher Modus: mit `hub` (backend.notifier.hub) zusätzlich Inbox, Actions,
Ruhezeiten, Stummschaltung, Dringlichkeit — siehe backend/notifier/README.md.
"""
from __future__ import annotations

import os
import subprocess
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Callable

from loguru import logger

from backend.core.conflict import _as_datetime
from backend.sync.pull import Change

LOGO = Path(__file__).resolve().parent / "assets" / "logo.png"   # Fitness-App-Icon (Hantel)
APP_NAME = "Fitness Sync"
MODES = {"strength": "Kraft", "cardio": "Cardio"}
ACTIVITIES = {"climbing": "Klettern", "running": "Laufen", "cycling": "Radfahren", "swimming": "Schwimmen",
              "hiking": "Wandern", "walking": "Gehen", "hiit": "HIIT", "yoga": "Yoga", "rowing": "Rudern"}
Sender = Callable[[str, str], bool]


def send_desktop(title: str, body: str) -> bool:
    env = {**os.environ}
    env.setdefault("DBUS_SESSION_BUS_ADDRESS", f"unix:path=/run/user/{os.getuid()}/bus")
    try:
        subprocess.run(["notify-send", f"--app-name={APP_NAME}", f"--icon={LOGO}", title, body],
                       env=env, timeout=3, check=True)
        return True
    except Exception as exc:
        logger.warning(f"notify-send fehlgeschlagen: {exc}")
        return False


def describe(data: dict, *, rich: bool = False, bold: bool = False) -> str:
    """Kurzbeschreibung eines Workouts.

    rich=True maskiert Texte für Pango-Markup (Kliententexte!), bold=True setzt das Datum fett.
    """
    esc = (lambda t: _escape(t)) if rich else (lambda t: t)
    date = data.get("date") or ""
    parts = [f"<b>{esc(date)}</b>" if (rich and bold and date) else esc(date)]
    mode = data.get("sessionMode")
    if mode:
        parts.append(esc(MODES.get(mode, str(mode))))
    activity = data.get("activity") if isinstance(data.get("activity"), dict) else {}
    if activity.get("type"):
        parts.append(esc(ACTIVITIES.get(activity["type"], str(activity["type"]))))
    for key in ("block", "trainingsart"):
        if data.get(key):
            parts.append(esc(str(data[key])))
            break
    n = len(data.get("exercises") or [])
    if n:
        parts.append(f"{n} Übungen")
    duration = data.get("duration") or activity.get("duration")
    if duration:
        parts.append(esc(f"{duration} min" if str(duration).isdigit() else str(duration)))
    if data.get("effort") not in (None, ""):
        parts.append(f"Effort {esc(data['effort'])}")
    line = " · ".join(p for p in parts if p)
    notes = (data.get("notes") or activity.get("notes") or "").strip().replace("\n", " ")
    if notes:
        line += "\n" + esc(notes[:80] + "…" if len(notes) > 80 else notes)
    return line


def _escape(text) -> str:
    from backend.notifier.popup import escape_markup
    return escape_markup(text)


def _is_recent(data: dict, now: datetime, max_age_days: int) -> bool:
    when = _as_datetime(data.get("saved_at")) or _as_datetime(data.get("date"))
    return True if when is None else now - when <= timedelta(days=max_age_days)


def notify_changes(
    name: str,
    uid: str,
    changes: list[Change],
    *,
    send: Sender,
    dry_run: bool = False,
    max_individual: int | None = None,
    max_age_days: int | None = None,
    now: datetime | None = None,
    hub=None,
) -> int:
    """Gibt die Zahl der (versuchten) Benachrichtigungen zurück.

    * Nur kürzlich gespeicherte Workouts (saved_at binnen `max_age_days`, Standard 3) — ein
      erster Pull eines neuen Klienten soll nicht das ganze Archiv melden.
    * Mehr als `max_individual` (Standard 3) Treffer → eine Sammelmeldung statt Dauerfeuer.
    * `hub` (optional): reicher Modus; Werte aus dessen Config gelten, solange sie nicht
      ausdrücklich übergeben werden.
    """
    cfg = hub.config if hub is not None else None
    if max_individual is None:
        max_individual = cfg.max_individual if cfg else 3
    if max_age_days is None:
        max_age_days = cfg.max_age_days if cfg else 3

    now = now or datetime.now(timezone.utc)
    recent = [c for c in changes if _is_recent(c.data, now, max_age_days)]
    if len(recent) < len(changes):
        logger.bind(event="notify", uid=uid, skipped_old=len(changes) - len(recent)).debug(
            f"notify {name}: {len(changes) - len(recent)} ältere Workouts nicht gemeldet"
        )
    if not recent:
        return 0
    if hub is not None and hub.ignored(name, uid):
        logger.bind(event="notify", uid=uid).debug(f"notify {name}: Klient ist in der Config auf ignore")
        return 0

    rich = hub is not None
    bold = bool(cfg and cfg.markup)

    # (Titel, Body, doc_id, zugehörige Changes)
    if len(recent) <= max_individual:
        messages = [
            (f"{name}: Workout {'eingegangen' if c.action == 'angelegt' else 'aktualisiert'}",
             describe(c.data, rich=rich, bold=bold), c.doc_id, [c]) for c in recent
        ]
    else:
        days = sorted({c.data.get("date") or c.doc_id for c in recent})[-5:]
        body = ", ".join(_escape(d) for d in days) if rich else ", ".join(days)
        messages = [(f"{name}: {len(recent)} Workouts eingegangen", body, None, recent)]

    if hub is not None and not dry_run:
        for c in recent:
            hub.record(name, uid, c, summary=describe(c.data))

    for title, body, doc_id, subset in messages:
        if hub is not None:
            delivery = hub.popup(name, uid, title=title, body=body, doc_id=doc_id, changes=subset, dry_run=dry_run)
            sent, status = delivery.sent, delivery.reason
        else:
            sent = False if dry_run else send(title, body)
            status = "dry-run" if dry_run else ("gesendet" if sent else "fehlgeschlagen")
        logger.bind(event="notify", uid=uid, doc_id=doc_id, title=title, body=body,
                    sent=sent, dry_run=dry_run, status=status).info(
            f"{'[dry-run] würde melden' if dry_run else ('gemeldet' if sent else 'Meldung nicht gesendet (' + status + ')')}: "
            f"{title}{' — ' + body.splitlines()[0] if body.strip() else ''}"
        )
    return len(messages)
