"""Coaching-Lage live aus den Trainingsdaten — ausgeliefert über GET /api/org/coaching (coach_org.py).

Eine Quelle für alle Ansichten: dieselben Sessions wie `coach clients`
(App-Workouts unter ~/.aos/fitness/users/<uid>/fitness/sessions) plus lokal
vorgemerkte Einheiten unter ~/Klienten/<slug>/sessions/. Nichts wird
geschrieben oder zwischengespeichert — jede Anfrage rechnet frisch.
"""
from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path


SPUR = {None: "Klient", "": "Klient", "aktiv": "Klient", "active": "Klient",
        "freund": "Freund", "interessent": "Interessent"}
WINDOW = 28  # Rhythmus = Einheiten der letzten 4 Wochen / 4


def _staged(client_dir: Path | None) -> list[dict]:
    if not client_dir:
        return []
    out = []
    for f in sorted((Path(client_dir) / "sessions").glob("*.json")):
        try:
            s = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(s, dict):
            s.setdefault("date", f.stem[:10])
            out.append(s)
    return out


def lage_label(pause: int | None) -> str:
    if pause is None:
        return "keine Einheit"
    if pause <= 4:
        return "im Rhythmus"
    if pause <= 10:
        return "fällig"
    return "überfällig"


def person(meta, today: date) -> dict:
    from fitness.data import classify
    from fitness.log.clients.service import load_client_sessions

    sessions = {s.get("date"): s for s in _staged(meta.client_dir)}
    sessions.update({s.get("date"): s for s in load_client_sessions(meta)})
    days = sorted((d for d in sessions if d), reverse=True)

    last = days[0] if days else None
    pause = (today - date.fromisoformat(last)).days if last else None
    since = (today - timedelta(days=WINDOW)).isoformat()
    recent = [d for d in days if d >= since]

    # Fällig = der Kraftblock der letzten 90 Tage, der am längsten her ist ("PULL" == "Pull").
    horizon = (today - timedelta(days=90)).isoformat()
    block_last: dict[str, str] = {}
    for d in days:
        s = sessions[d]
        if d < horizon or classify(s) == "cardio":
            continue
        b = (s.get("block") or "").strip().title()
        if b and b not in block_last:
            block_last[b] = d
    faellig = min(block_last, key=block_last.get) if len(block_last) > 1 else None

    efforts = [sessions[d].get("effort") for d in days[:3]]
    efforts = [e for e in efforts if isinstance(e, (int, float))]

    return {
        "slug": meta.slug,
        "name": meta.name or meta.slug,
        "spur": SPUR.get(meta.status, meta.status or "Klient"),
        "app": bool(meta.uids),
        "einheiten": len(days),
        "rhythmus": round(len(recent) / (WINDOW / 7), 1),
        "last": last,
        "last_block": ((sessions[last].get("block") or "").strip().title() or None) if last else None,
        "pause": pause,
        "lage": lage_label(pause),
        "faellig": {"block": faellig, "seit": (today - date.fromisoformat(block_last[faellig])).days}
        if faellig else None,
        "rpe": round(sum(efforts) / len(efforts), 1) if efforts else None,
    }


def build(today: date | None = None) -> dict:
    from fitness.log.clients.service import get_clients_registry

    today = today or date.today()
    rows = [person(m, today) for m in get_clients_registry()
            if m.status not in ("coach", "beendet", "archiv")]
    order = {"überfällig": 0, "fällig": 1, "keine Einheit": 2, "im Rhythmus": 3}
    rows.sort(key=lambda r: (r["spur"] == "Interessent", order[r["lage"]], -(r["pause"] or 0)))
    return {"today": today.isoformat(), "rows": rows}

