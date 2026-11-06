"""Workout-Sessions für Klienten (~/Klienten/<id>/) manuell loggen.

Schreibt entweder direkt über die laufende fitness-api (:9150, POST /session,
inkl. SQLite-Sync + Firestore-Mirror) wenn der Klient eine firebase_uid hat,
oder staged lokal unter ~/Klienten/<id>/sessions/ wenn (noch) keine UID
vergeben ist (z.B. Status "interessent").
"""
from __future__ import annotations

import json
from datetime import datetime, date as _date
from pathlib import Path
from typing import Any

import requests

KLIENTEN_ROOT = Path.home() / "Klienten"
API_BASE = "http://127.0.0.1:9150"


def _client_json(client: str) -> dict[str, Any]:
    path = KLIENTEN_ROOT / client / "client.json"
    if not path.exists():
        raise FileNotFoundError(f"Kein Klient '{client}' unter {path}")
    return json.loads(path.read_text())


def log_workout(
    client: str,
    exercises: list[dict[str, Any]],
    day: str | None = None,
    block: str = "",
    duration: str = "",
    location: str = "",
    trainingsart: str = "Kraft",
    session_mode: str = "strength",
) -> dict[str, Any]:
    """Loggt ein Workout für einen Klienten. Gibt {'mode': 'api'|'staged', ...} zurück."""
    info = _client_json(client)
    uid = info.get("firebase_uid")
    day = day or _date.today().isoformat()

    session = {
        "date": day,
        "sessionMode": session_mode,
        "exercises": exercises,
        "duration": duration,
        "block": block,
        "location": location,
        "trainingsart": trainingsart,
        "session_id": None,
        "sessionGate": {"status": "completed", "startedAt": None, "gps": None, "endedAt": None},
    }

    if uid:
        resp = requests.post(
            f"{API_BASE}/session",
            params={"date": day},
            headers={"X-User-UID": uid},
            json=session,
            timeout=10,
        )
        resp.raise_for_status()
        return {"mode": "api", "uid": uid, "response": resp.json()}

    # kein firebase_uid -> lokal staged, nicht app-sichtbar
    out_dir = KLIENTEN_ROOT / client / "sessions"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"{day}.json"
    session["saved_at"] = datetime.utcnow().isoformat()
    session["_staged_reason"] = "kein firebase_uid in client.json — noch nicht app-sichtbar"
    out_file.write_text(json.dumps(session, indent=2, ensure_ascii=False))
    return {"mode": "staged", "path": str(out_file)}
