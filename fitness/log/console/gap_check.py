"""Periodischer Trainingsluecken-Check ueber alle Klienten.

**Fix 1 (2026-08-24):** try/except PRO Klient, ein defekter Klienten-Datensatz
killt nicht mehr den ganzen Loop (siehe git log fuer Details).

**Fix 2 (2026-08-24):** der eigentliche Grund fuer "haengt bei Schöffy" war
gar kein Crash — Klienten ohne Luecke werden in <1s uebersprungen (kein
Event), ein Klient MIT ungeklaerter Luecke loest zwei synchrone KI-Calls aus
(Gemini + Haiku-CLI-Review, ~15-25s). Steht so ein Klient als letzter in der
Registry-Reihenfolge, ist er das letzte sichtbare Lebenszeichen fuer die
naechsten `interval` Sekunden (Default 30min) — sieht aus wie ein Haenger,
ist aber die korrekte Wartezeit bis zum naechsten Zyklus. Jetzt: kurze
"Pruefe..."-Zeile bevor die KI-Calls starten + Zyklus-Abschluss-Zeile mit
Zeitpunkt des naechsten Checks, damit klar ist dass der Loop lebt.

**Fix 3 (2026-08-24):** Schöffy hat die App einmalig ausprobiert
(`status: "freund"` in client.json, eine einzige Session) — kein aktives
Coaching-Verhaeltnis, trotzdem meldete jeder Zyklus seine "Luecke" erneut.
NON_COACHING_STATUSES filtert Klienten ohne echtes Coaching-Verhaeltnis
("freund", "interessent") vor dem Gap-Check raus.
"""
from __future__ import annotations

import queue as _queue
import time
from datetime import date

from loguru import logger

from ...paths import AOS_USERS
from .drafts import save_draft
from .events import event_line

NON_COACHING_STATUSES = frozenset({"freund", "interessent"})


def gap_check_loop(
    registry: dict,
    events: "_queue.Queue[str]",
    interval: int,
) -> None:
    from fitness.catalog.agent.coach_ai import check_training_gap

    while True:
        checked = 0
        for meta in registry.values():
            name = meta.get("name", "?")
            if meta.get("status") in NON_COACHING_STATUSES:
                continue
            checked += 1
            try:
                _check_one_client(meta, events, check_training_gap)
            except Exception as exc:
                logger.exception(f"console gap-check fehlgeschlagen fuer Klient '{name}' — ueberspringe, Loop laeuft weiter")
                events.put(event_line("red", "Fehler", name, f"Gap-Check: {exc}"))
        next_check = time.strftime("%H:%M:%S", time.localtime(time.time() + interval))
        events.put(event_line("dim", "Zyklus fertig", f"{checked} Klienten geprueft", f"naechster Check ~{next_check}"))
        time.sleep(interval)


def _check_one_client(meta: dict, events: "_queue.Queue[str]", check_training_gap) -> None:
    from fitness.catalog.agent.coach_ai import GAP_THRESHOLD_DAYS

    uids = meta.get("uids") or [meta.get("uid")]
    name = meta["name"]

    last_date = None
    for uid in uids:
        sdir = AOS_USERS / uid / "fitness" / "sessions"
        if not sdir.exists():
            continue
        dates = sorted((f.stem[:10] for f in sdir.glob("*.json") if len(f.stem) >= 10), reverse=True)
        if dates and (last_date is None or dates[0] > last_date):
            last_date = dates[0]

    journal_text = ""
    for uid in uids:
        jdir = AOS_USERS / uid / "fitness" / "journal"
        if not jdir.exists():
            continue
        for jf in sorted(jdir.glob("*.md"), reverse=True)[:5]:
            journal_text += jf.read_text(encoding="utf-8") + "\n"

    if last_date:
        try:
            days_gap = (date.today() - date.fromisoformat(last_date)).days
        except Exception:
            days_gap = None
        if days_gap is not None and days_gap >= GAP_THRESHOLD_DAYS:
            events.put(event_line("dim", "Pruefe Trainingsluecke", name, f"{days_gap}d seit letzter Session — KI-Analyse laeuft…"))

    result = check_training_gap(name, last_date, journal_text)
    if result and not result.get("explained"):
        days_gap = result.get("days_gap", "?")
        reason = result.get("reason", "")
        gap_label = f"Trainingsluecke ({days_gap}d)"
        events.put(event_line("red", gap_label, name, reason))
        save_draft(uids[0], name, "gap", reason, days_gap=days_gap, last_session_date=last_date)
