"""6Pack-Archiv pro Klient: Firestore -> ~/.aos/coach/clients/<uid>/6pack.jsonl.gz.

Liest per Admin-SDK (Coach-Sicht, ohne Browser-Login) alles, was die 6Pack-App
in Firestore ablegt, und schreibt es chronologisch als JSONL (gzip, eine Zeile
pro Ereignis):

  users/{uid}/meta/sixpack                  Programm-Fortschritt  -> day_completed + program
  fitness/{uid}/sessions/*   (6Pack)        volle Einheiten       -> session
  fitness/{uid}/workoutIndex/*.entries.*    ältere Einheiten als  -> session_index
                                            Kurzfassung (nur wenn die volle Session fehlt)

Selfies (sixpackSelfies/*) werden bewusst nicht gelesen: nur der Eigentümer darf sie.
Die Datei wird bei jedem Sync komplett neu und atomar geschrieben.
"""
from __future__ import annotations

import gzip
import json
import logging
import os
import re
import tempfile
from datetime import date as date_cls, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

log = logging.getLogger("coach.sixpack")
router = APIRouter(prefix="/api/coach/sixpack")

ARCHIVE_NAME = "6pack.jsonl.gz"
UID_RE = re.compile(r"[\w-]{1,128}", re.ASCII)
DAYS_PER_WEEK = 7
# Reihenfolge bei gleichem Zeitstempel: Tag abgehakt -> Einheit -> Stand
_ORDER = {"day_completed": 0, "session": 1, "session_index": 1, "program": 2}


PROJECT = os.getenv("FIREBASE_FITNESS_PROJECT", "fitness-aos")
_db = None


def clients_root() -> Path:
    base = os.getenv("COACH_DATA_DIR", str(Path.home() / ".aos" / "coach"))
    return Path(os.getenv("COACH_SIXPACK_ARCHIVE_DIR", str(Path(base) / "clients")))


def load_registry() -> dict[str, dict]:
    """uid -> {name, slug} aus ~/Klienten/*/client.json (firebase_uid / firebase_uids)."""
    root = Path(os.getenv("COACH_KLIENTEN_DIR", str(Path.home() / "Klienten")))
    registry: dict[str, dict] = {}
    if not root.is_dir():
        return registry
    for slug_dir in sorted(root.iterdir()):
        cfg_path = slug_dir / "client.json"
        if not slug_dir.is_dir() or slug_dir.name.startswith("_") or not cfg_path.is_file():
            continue
        try:
            cfg = json.loads(cfg_path.read_text())
        except (OSError, ValueError):
            continue
        uids = set(cfg.get("firebase_uids") or [])
        uids.add(cfg.get("firebase_uid") or cfg.get("uid"))
        for uid in filter(None, uids):
            registry[uid] = {"name": cfg.get("name") or slug_dir.name, "slug": slug_dir.name}
    return registry


def archive_path(uid: str) -> Path:
    return clients_root() / uid / ARCHIVE_NAME


def _json_default(value: Any) -> Any:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _plain(value: Any) -> Any:
    """Firestore-Werte (Timestamps u. ä.) in reines JSON überführen."""
    return json.loads(json.dumps(value, default=_json_default, ensure_ascii=False))


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):  # updatedAt aus dem Client: Millisekunden
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat()
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _source_app(session: dict) -> str | None:
    source = session.get("source")
    return source if isinstance(source, str) else (source or {}).get("app")


def is_sixpack(session: dict) -> bool:
    return _source_app(session) == "sixpack" or (session.get("program") or {}).get("id") == "sixpack"


def _session_ts(session: dict) -> str:
    gate = session.get("sessionGate") or {}
    return gate.get("endedAt") or gate.get("startedAt") or _iso(session.get("saved_at")) or ""


def build_events(uid: str, program: dict | None, sessions: list[dict], index_entries: list[dict]) -> list[dict]:
    """Alle Ereignisse eines Klienten, chronologisch (Datum, Zeitstempel, Art)."""
    events: list[dict] = []
    seen_ids = {s["_docId"] for s in sessions}

    for day, done_on in sorted((program or {}).get("completedOn", {}).items(), key=lambda kv: int(kv[0])):
        day_no = int(day)
        events.append({
            "type": "day_completed", "uid": uid, "date": done_on, "ts": "",
            "day": day_no, "week": (day_no - 1) // DAYS_PER_WEEK + 1, "dayInWeek": (day_no - 1) % DAYS_PER_WEEK + 1,
        })

    for s in sessions:
        doc_id = s.pop("_docId")
        events.append({
            "type": "session", "uid": uid, "id": doc_id,
            "date": s.get("date") or doc_id.split("__")[0], "ts": _session_ts(s), "data": s,
        })

    for entry in index_entries:
        if entry["id"] in seen_ids:
            continue
        events.append({
            "type": "session_index", "uid": uid, "id": entry["id"],
            "date": entry.get("date") or entry["id"].split("__")[0], "ts": entry.get("startedAt") or "", "data": entry,
        })

    events.sort(key=lambda e: (str(e.get("date") or ""), str(e.get("ts") or ""), _ORDER[e["type"]], str(e.get("id") or e.get("day") or "")))
    if program is not None:  # aktueller Stand immer als letzte Zeile, unabhängig von Zeitstempeln
        events.append({
            "type": "program", "uid": uid, "date": (program.get("lastCompletedOn") or ""),
            "ts": _iso(program.get("saved_at")) or _iso(program.get("updatedAt")) or "", "data": program,
        })
    return events


def fetch_client(db, uid: str) -> list[dict]:
    """Liest die 6Pack-Daten eines Klienten aus Firestore (read-only)."""
    program_snap = db.collection("users").document(uid).collection("meta").document("sixpack").get()
    program = _plain(program_snap.to_dict()) if program_snap.exists else None

    fitness = db.collection("fitness").document(uid)
    sessions = []
    for snap in fitness.collection("sessions").stream():
        data = _plain(snap.to_dict() or {})
        if is_sixpack(data):
            data["_docId"] = snap.id
            sessions.append(data)

    index_entries = []
    for snap in fitness.collection("workoutIndex").stream():
        for doc_id, entry in ((snap.to_dict() or {}).get("entries") or {}).items():
            entry = _plain(entry)
            if isinstance(entry, dict) and is_sixpack(entry):
                index_entries.append({**entry, "id": entry.get("id") or doc_id})

    return build_events(uid, program, sessions, index_entries)


def write_archive(uid: str, events: list[dict]) -> Path:
    """Atomar schreiben: temp-Datei im Zielordner, dann replace."""
    path = archive_path(uid)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".6pack-", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as gz:
            for event in events:
                gz.write((json.dumps(event, ensure_ascii=False, default=_json_default) + "\n").encode("utf-8"))
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
    return path


def read_archive(uid: str) -> list[dict]:
    path = archive_path(uid)
    if not path.is_file():
        return []
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def active_dates(events: list[dict]) -> set[date_cls]:
    """Kalendertage mit Aktivität: abgehakter Programm-Tag (inkl. Ruhetage, die die
    App automatisch abhakt) oder geloggte Einheit."""
    days = set()
    for e in events:
        if e["type"] in ("day_completed", "session", "session_index") and e.get("date"):
            try:
                days.add(date_cls.fromisoformat(str(e["date"])[:10]))
            except ValueError:
                continue
    return days


def compute_streaks(days: set[date_cls], today: date_cls | None = None) -> dict:
    """Streak = lückenlose Folge von Kalendertagen mit Aktivität.

    Die aktuelle Streak bleibt bestehen, wenn heute noch nichts gemacht wurde,
    aber gestern (der Tag ist noch nicht vorbei); sie reißt erst, wenn auch
    gestern leer war."""
    today = today or date_cls.today()
    ordered = sorted(days)
    longest, longest_end, run, prev = 0, None, 0, None
    for d in ordered:
        run = run + 1 if prev and d - prev == timedelta(days=1) else 1
        if run > longest:
            longest, longest_end = run, d
        prev = d

    current = 0
    cursor = today if today in days else today - timedelta(days=1)
    while cursor in days:
        current += 1
        cursor -= timedelta(days=1)

    return {
        "current": current,
        "longest": longest,
        "longestEnd": longest_end.isoformat() if longest_end else None,
        "lastActive": ordered[-1].isoformat() if ordered else None,
        "activeDays": len(ordered),
        "daysSinceActive": (today - ordered[-1]).days if ordered else None,
    }


def _summary(uid: str, events: list[dict], path: Path) -> dict:
    kinds: dict[str, int] = {}
    for e in events:
        kinds[e["type"]] = kinds.get(e["type"], 0) + 1
    dated = [e["date"] for e in events if e.get("date")]
    return {
        "uid": uid, "path": str(path), "events": len(events), "kinds": kinds,
        "first": min(dated) if dated else None, "last": max(dated) if dated else None,
        "streaks": compute_streaks(active_dates(events)),
    }


def _check_uid(uid: str) -> str:
    if not UID_RE.fullmatch(uid):
        raise HTTPException(400, detail="invalid_uid")
    return uid


def _get_db():
    """Firestore per Admin-SDK (Coach-Sicht). Service-Account wie im restlichen Stack."""
    global _db
    if _db:
        return _db
    import firebase_admin
    from firebase_admin import credentials, firestore
    cred = Path(os.getenv("COACH_FIREBASE_CREDENTIALS", str(Path.home() / ".env" / "firebase-fitness.json")))
    if not cred.is_file():
        raise FileNotFoundError(f"Service-Account fehlt: {cred}")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(str(cred)), {"projectId": PROJECT})
    _db = firestore.client()
    return _db


def sync_clients(uids: list[str], get_db: Callable = _get_db) -> dict:
    db = get_db()
    results, errors = [], []
    for uid in uids:
        try:
            events = fetch_client(db, uid)
            if not events:
                results.append({"uid": uid, "events": 0, "skipped": "no_sixpack_data"})
                continue
            results.append(_summary(uid, events, write_archive(uid, events)))
        except Exception as exc:  # ein kaputter Klient stoppt die anderen nicht
            log.warning("6pack sync %s: %s", uid, exc)
            errors.append({"uid": uid, "error": str(exc)})
    return {"ok": not errors, "synced": results, "errors": errors}


@router.post("/sync")
def sync(uid: str = Query("", description="Nur dieser Klient; leer = alle registrierten Klienten")):
    if uid:
        uids = [_check_uid(uid)]
    else:
        uids = sorted(load_registry())
    try:
        return sync_clients(uids)
    except FileNotFoundError as exc:  # Service-Account fehlt
        raise HTTPException(503, detail=str(exc)) from None


@router.get("")
def status():
    registry = load_registry()
    clients = []
    for uid, meta in sorted(registry.items(), key=lambda kv: kv[1].get("name", "")):
        path = archive_path(uid)
        stat = path.stat() if path.is_file() else None
        clients.append({
            "uid": uid, "name": meta.get("name"), "archive": stat is not None,
            "streaks": compute_streaks(active_dates(read_archive(uid))) if stat else None,
            "bytes": stat.st_size if stat else None,
            "updated": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat() if stat else None,
        })
    return {"ok": True, "clients": clients}


@router.get("/{uid}")
def get_archive(uid: str, download: bool = Query(False), since: str = Query("")):
    _check_uid(uid)
    path = archive_path(uid)
    if not path.is_file():
        raise HTTPException(404, detail="no_archive")
    if download:
        return FileResponse(path, media_type="application/gzip", filename=ARCHIVE_NAME)
    if since:
        try:
            date_cls.fromisoformat(since)
        except ValueError:
            raise HTTPException(400, detail="invalid_since") from None
    events = [e for e in read_archive(uid) if not since or str(e.get("date") or "") >= since]
    return {"ok": True, "uid": uid, "streaks": compute_streaks(active_dates(read_archive(uid))), "events": events}
