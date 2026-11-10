"""Push-Notifications — tägliche App-Erinnerungen (Workout, Habit, Coverage, Rest-Day).

Siehe src/views/DISCONNECTED.md Abschnitt 11a. Läuft als Background-Task
in catalog/server.py (on_startup) statt als separater Bridge-Cron —
nutzt dieselbe firestore.get_db()-Infrastruktur wie firestore_push.py.
"""
from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta
from typing import Any

from loguru import logger

CHECK_INTERVAL_SECONDS = 60  # wie oft geprüft wird, ob reminderTime erreicht ist


def _today_iso() -> str:
    return date.today().isoformat()


def _get_push_settings(db: Any, uid: str) -> dict | None:
    snap = db.collection("fitness").document(uid).collection("settings").document("push").get()
    return snap.to_dict() if snap.exists else None


def _get_session(db: Any, uid: str, day: str) -> dict | None:
    snap = db.collection("fitness").document(uid).collection("sessions").document(day).get()
    return snap.to_dict() if snap.exists else None


def _get_open_habits(db: Any, uid: str, day: str) -> list[str]:
    habits = list(db.collection("fitness").document(uid).collection("habits").stream())
    if not habits:
        return []
    done_ids = set()
    for rec in db.collection("fitness").document(uid).collection("habitRecords") \
                 .where("date", "==", day).where("completion", "==", "DONE").stream():
        done_ids.add(rec.to_dict().get("habitId"))
    return [h.to_dict().get("name", h.id) for h in habits if h.id not in done_ids]


def _days_since_last_session(db, uid: str) -> int | None:
    docs = list(
        db.collection("fitness").document(uid).collection("sessions")
        .order_by("date", direction="DESCENDING").limit(1).stream()
    )
    if not docs:
        return None
    last_date = docs[0].to_dict().get("date")
    if not last_date:
        return None
    try:
        d = datetime.strptime(last_date, "%Y-%m-%d").date()
    except ValueError:
        return None
    return (date.today() - d).days


def build_notifications(db: Any, uid: str) -> list[dict]:
    """Liefert Liste von {title, body, tab} — eine pro ausgelöster Regel."""
    settings = _get_push_settings(db, uid)
    if not settings or not settings.get("enabled") or not settings.get("token"):
        return []

    types = settings.get("types") or {}
    today = _today_iso()
    notifications: list[dict] = []

    if types.get("workout", True):
        session = _get_session(db, uid, today)
        has_done = bool(session and any(ex.get("done") for ex in (session.get("exercises") or [])))
        if not has_done:
            notifications.append({"title": "VitalOS", "body": "Hey, Zeit für dein Training", "tab": "fitness"})

    if types.get("habit", True):
        open_habits = _get_open_habits(db, uid, today)
        if open_habits:
            names = ", ".join(open_habits[:3])
            notifications.append({"title": "VitalOS", "body": f"Offene Habits heute: {names}", "tab": "habits"})

    if types.get("restday", True):
        days = _days_since_last_session(db, uid)
        if days is not None and days >= 4:
            notifications.append({
                "title": "VitalOS",
                "body": f"Alles ok? Letzte Session war vor {days} Tagen",
                "tab": "fitness",
            })

    # Coverage-Alert nutzt dieselbe Muskel-Coverage-Logik wie /coverage/detailed,
    # bewusst hier weggelassen (Prio 2) — bräuchte KB-Index + Rolle-Gewichte,
    # zu teuer für den täglichen Check ohne Cache. Siehe DISCONNECTED.md 11a.

    return notifications


def send_push(token: str, title: str, body: str, tab: str = "") -> None:
    from firebase_admin import messaging

    message = messaging.Message(
        notification=messaging.Notification(title=title, body=body),
        data={"tab": tab},
        token=token,
    )
    messaging.send(message)


def check_and_notify() -> int:
    """Einmaliger Check-Durchlauf. Gibt Anzahl gesendeter Notifications zurück."""
    from fitness.firestore import get_db, UID

    db = get_db()
    notifications = build_notifications(db, UID)
    settings = _get_push_settings(db, UID) or {}
    token = settings.get("token")
    if not token:
        return 0

    sent = 0
    for n in notifications:
        try:
            send_push(token, n["title"], n["body"], n.get("tab", ""))
            sent += 1
        except Exception as e:
            logger.error(f"push send failed ({n['tab']}): {e}")
    if sent:
        logger.info(f"push: {sent} Benachrichtigung(en) gesendet")
    return sent


async def run_daily_scheduler() -> None:
    """Prüft minütlich ob reminderTime erreicht ist, feuert dann einmal pro Tag."""
    last_fired_date: str | None = None
    while True:
        try:
            from fitness.firestore import get_db, UID
            db = get_db()
            settings = _get_push_settings(db, UID)
            reminder_time = (settings or {}).get("reminderTime", "18:00")
            now = datetime.now()
            hh, mm = (int(x) for x in reminder_time.split(":"))
            target = now.replace(hour=hh, minute=mm, second=0, microsecond=0)

            if now >= target and last_fired_date != _today_iso():
                check_and_notify()
                last_fired_date = _today_iso()
        except Exception as e:
            logger.error(f"push scheduler tick failed: {e}")

        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
