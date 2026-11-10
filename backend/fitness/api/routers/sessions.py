import asyncio
from datetime import datetime
from typing import Any
from fastapi import APIRouter, Request, Query, HTTPException

from fitness.api.config import (
    SESS_ROOT, _uid_from_request, date, _read_json, _write_json,
    _session_file, _parse_session_fname, _freeze_snapshot, _sync_session_to_db,
    logger, load_klienten_registry
)
from db.schemas import SessionResponse, SyncRequest, SyncResponse
from fitness.firestore.mirror import mirror_session
from fitness.catalog.core.session_signal import exercise_has_training_signal
from fitness.runtime.session_store import (
    parse_session_doc_id, session_order_key, validate_session_date, validate_session_id,
)

router = APIRouter()

def _today() -> str:
    return date.today().isoformat()

def _require_uid(request: Request) -> str:
    uid = _uid_from_request(request)
    if not uid or uid == "default":
        raise HTTPException(400, detail="uid Pflicht. Aktive UID fehlt; via ?uid=... oder X-User-UID Header senden.")
    return uid


def _valid_day(value: str) -> str:
    try:
        return validate_session_date(value)
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from None


def _valid_id(value: str | None) -> str | None:
    try:
        return validate_session_id(value)
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from None


def _session_path(uid: str, day: str, sid: str | None):
    return _session_file(uid, _valid_day(day), _valid_id(sid))


def _performed_exercises(session: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        ex for ex in (session.get("exercises") or [])
        if isinstance(ex, dict) and exercise_has_training_signal(ex)
    ]


def _is_activity_only(session: dict[str, Any]) -> bool:
    # Explizit als eigenständige Ausdauer-Hauptsession angelegt (Frontend-
    # ModeSwitcher -> sessionMode: "cardio") darf nie in eine andere Session
    # desselben Tages gemerged werden, selbst wenn exercises leer ist — sonst
    # verschwindet die bewusst geloggte Cardio-Session in der
    # activity-Addon-Liste einer bereits existierenden Kraft-Session.
    if session.get("sessionMode") == "cardio":
        return False
    return bool(session.get("activity")) and not _performed_exercises(session)


def _queue_unreviewed_enrichment(session: dict[str, Any]) -> None:
    """Merged für jede tatsächlich geloggte, noch nicht 'expert' klassifizierte
    Übung wger+yuhonas-Rohdaten (build_external_seed(), via
    process_inbox_file_virtual()) zu einem Inbox-Draft. Läuft im selben
    Backend-Prozess (run_in_executor, kein separater Watcher/Service) direkt
    nach dem Session-Save — bewusst NICHT die frühere
    FITNESS_WATCHER_PROACTIVE_REFINER-Logik (periodischer Scan über
    'meistgenutzte unreviewed Übungen'): die wurde deaktiviert, weil sie
    Übungen anreicherte, die niemand tatsächlich geloggt hatte. Hier ist der
    Scope exakt die Übungen dieser einen Session.
    """
    from fitness.catalog.core.resolver import build_exercise_index, resolve_query, find_by_id
    from fitness.catalog.api.watcher import process_inbox_file_virtual
    from fitness.catalog.agent.gemini import load_gemini_key

    api_key = load_gemini_key()
    records = build_exercise_index()
    seen: set[str] = set()
    for ex in _performed_exercises(session):
        name = ex.get("name") or ex.get("display_name") or ex.get("exercise_id")
        if not name:
            continue
        try:
            resolution = resolve_query(str(name), records)
        except Exception as e:
            logger.warning(f"resolve_query fuer proaktives Enrichment fehlgeschlagen ({name}): {e}")
            continue
        if not resolution.matched or not resolution.canonical_id or resolution.canonical_id in seen:
            continue
        seen.add(resolution.canonical_id)
        record = find_by_id(resolution.canonical_id, records)
        if record and record.source == "expert":
            continue
        try:
            process_inbox_file_virtual(resolution.canonical_id, resolution.display_name, api_key)
        except Exception as e:
            logger.warning(f"Proaktives Enrichment fuer {resolution.canonical_id} fehlgeschlagen: {e}")


def _addon_signature(entry: dict[str, Any]) -> tuple:
    return (
        entry.get("type"),
        entry.get("duration"),
        entry.get("notes"),
        entry.get("swimStyle"),
        entry.get("muscleTarget"),
    )


def _append_activity_addon(
    addons: list[dict[str, Any]], activity: dict[str, Any], source_id: str | None = None
) -> list[dict[str, Any]]:
    addons = [dict(a) for a in addons if isinstance(a, dict)]
    entry = dict(activity)
    if source_id:
        entry.setdefault("_source_id", source_id)
        # Autosave (1.5s Debounce) feuert bei jeder Änderung im Aktivitäts-
        # Formular einer Sidecar-Session (z.B. Cardio-Typ mehrfach umgeschaltet,
        # bevor der User sich entscheidet) — jeder Zwischenstand hat eine
        # eigene source_id-Zugehörigkeit. Ohne dieses Ersetzen sammelten sich
        # pro Browsing-Session mehrere Phantom-Finisher an, einer pro
        # ausprobierter Typ/Dauer-Kombination. Nur der jeweils letzte Stand
        # DERSELBEN source_id zählt; unterschiedliche source_ids (= wirklich
        # getrennt geloggte Finisher) bleiben eigene Einträge.
        addons = [a for a in addons if a.get("_source_id") != source_id]
        addons.append(entry)
    else:
        signature = _addon_signature(entry)
        if not any(_addon_signature(a) == signature for a in addons):
            addons.append(entry)
    return addons


def _merge_activity_addon(base: dict[str, Any], incoming: dict[str, Any], source_id: str | None) -> dict[str, Any]:
    activity = incoming.get("activity")
    if not isinstance(activity, dict) or not activity:
        return base

    merged = dict(base)
    addons = [
        dict(a) for a in (merged.get("activityAddons") or [])
        if isinstance(a, dict)
    ]
    if merged.get("activity") and all(a != merged["activity"] for a in addons):
        addons.insert(0, dict(merged["activity"]))

    addons = _append_activity_addon(addons, activity, source_id)

    merged["activityAddons"] = addons
    merged.setdefault("activity", addons[0])
    if not _performed_exercises(merged):
        merged["sessionMode"] = "cardio"
        merged["activity"] = addons[0]
    return merged

@router.get("/session", response_model=SessionResponse)
def session_get(request: Request, date_: str = Query(None, alias="date"), id: str | None = None):
    uid  = _uid_from_request(request)
    day  = _valid_day(date_ or _today())
    id = _valid_id(id)
    data = _read_json(_session_path(uid, day, id))
    return SessionResponse(ok=True, session=data, date=day)

@router.post("/session")
async def session_post(request: Request, date_: str = Query(None, alias="date"), id: str | None = None):
    uid  = _require_uid(request)
    day  = _valid_day(date_ or _today())
    id = _valid_id(id)
    body = await request.json()

    if _is_activity_only(body):
        canonical = _session_path(uid, day, None)
        existing = _read_json(canonical, {}) if canonical.exists() else {}
        base = existing if isinstance(existing, dict) and existing else {**body, "exercises": []}
        session = _freeze_snapshot({
            **_merge_activity_addon(base, body, id),
            "date": day,
            "session_id": None,
            "saved_at": datetime.utcnow().isoformat(),
        })
        _write_json(canonical, session)
        if id:
            sidecar = _session_path(uid, day, id)
            if sidecar.exists():
                sidecar.unlink()
        _sync_session_to_db(day, session, None)
        asyncio.get_event_loop().run_in_executor(None, mirror_session, day, session, uid)
        logger.info(f"session activity merged  {uid}/{day}  activity={body.get('activity', {}).get('type','')}")
        return {"ok": True, "id": None, "merged": True}

    # Normaler (Nicht-Merge-)Save auf die kanonische Tagesdatei (id=None):
    # activityAddons, die durch einen früheren Finisher-Merge dort schon
    # liegen, dürfen nicht verschwinden, nur weil dieser Save-Call sie nicht
    # kennt (z.B. Autosave beim Editieren der Hauptsession) — sonst löscht
    # das nächste Tippen in der Hauptsession still einen bereits geloggten
    # Finisher (siehe _merge_activity_addon oben).
    if id is None:
        canonical = _session_path(uid, day, None)
        existing = _read_json(canonical, {}) if canonical.exists() else {}
        existing_addons = existing.get("activityAddons") if isinstance(existing, dict) else None

        if "activityAddons" not in body and existing_addons:
            body = {**body, "activityAddons": existing_addons}
            body.setdefault("activity", existing.get("activity"))

        incoming_activity = body.get("activity")
        if isinstance(incoming_activity, dict) and incoming_activity and _performed_exercises(body):
            # Finisher zusammen mit einer Kraftsession gespeichert, die
            # bereits Übungen enthält -> _is_activity_only() weiter unten
            # greift hier nicht (Übungen vorhanden), der Merge-Pfad dort
            # würde also nie erreicht. Ohne diesen Zweig landet der Finisher
            # zwar im "activity"-Feld (Save war technisch erfolgreich), aber
            # nie in activityAddons -> verschwindet sichtbar aus der
            # "Geloggte Finisher"-Liste im Frontend (Fund 2026-08-23,
            # Matthias-Report: "5 min core" wirkte ungespeichert, war aber
            # in jeder betroffenen Session tatsächlich im activity-Feld da).
            current_addons = list(body.get("activityAddons") or existing_addons or [])
            body = {**body, "activityAddons": _append_activity_addon(current_addons, incoming_activity)}

    session = _freeze_snapshot({**body, "date": day, "session_id": id, "saved_at": datetime.utcnow().isoformat()})
    n_ex = len(session.get("exercises", []))
    _write_json(_session_path(uid, day, id), session)
    _sync_session_to_db(day, session, id)
    asyncio.get_event_loop().run_in_executor(None, mirror_session, day, session, uid)
    asyncio.get_event_loop().run_in_executor(None, _queue_unreviewed_enrichment, session)
    logger.info(f"session saved  {uid}/{day}  block={session.get('block','')}  exercises={n_ex}")
    return {"ok": True, "id": id}

@router.delete("/session/activity")
async def session_delete_activity(request: Request, date_: str = Query(None, alias="date"), index: int = Query(...)):
    """Entfernt einen einzelnen Finisher aus activityAddons, ohne die
    gesamte (Kraft-)Session zu löschen. Gegenstück zum Merge in
    _merge_activity_addon oben — bisher gab es keinen Weg zurück."""
    uid = _require_uid(request)
    day = _valid_day(date_ or _today())
    canonical = _session_path(uid, day, None)
    existing = _read_json(canonical, {})
    if not isinstance(existing, dict) or not existing:
        raise HTTPException(404, detail="not_found")
    addons = list(existing.get("activityAddons") or [])
    if index < 0 or index >= len(addons):
        raise HTTPException(404, detail="addon_not_found")
    addons.pop(index)
    existing["activityAddons"] = addons
    existing["activity"] = addons[0] if addons else None
    session = _freeze_snapshot({**existing, "saved_at": datetime.utcnow().isoformat()})
    _write_json(canonical, session)
    _sync_session_to_db(day, session, None)
    asyncio.get_event_loop().run_in_executor(None, mirror_session, day, session, uid)
    logger.info(f"session activity addon deleted  {uid}/{day}  index={index}")
    return {"ok": True, "activityAddons": addons}

@router.delete("/session")
def session_delete(request: Request, date_: str = Query(None, alias="date"), id: str | None = None):
    uid = _require_uid(request)
    day = _valid_day(date_ or _today())
    id = _valid_id(id)
    f   = _session_path(uid, day, id)
    if f.exists():
        f.unlink()
        logger.info(f"session deleted  {uid}/{day}")
    return {"ok": True}

@router.get("/sessions")
def sessions_list(request: Request, date_: str = Query(None, alias="date")):
    uid = _uid_from_request(request)
    day = _valid_day(date_ or _today())
    d   = SESS_ROOT / uid / "sessions"
    if not d.exists():
        return {"ok": True, "sessions": []}
    sessions = []
    for f in sorted(d.glob(f"{day}*.json")):
        try:
            meta_day, meta_sid = parse_session_doc_id(f.stem)
        except ValueError:
            continue
        if meta_day != day:
            continue
        data = _read_json(f, {})
        entry = dict(data)
        entry.update({
            "id": meta_sid,
            "date": meta_day,
            "block": data.get("block"),
            "saved_at": data.get("saved_at"),
        })
        if not isinstance(entry.get("exercises"), list):
            entry["exercises"] = []
        sessions.append(entry)
    return {"ok": True, "sessions": sessions}

@router.get("/session/history")
def session_history(request: Request, limit: int = 10):
    uid   = _uid_from_request(request)
    d     = SESS_ROOT / uid / "sessions"
    if not d.exists():
        return {"ok": True, "sessions": []}
    records = []
    for f in d.glob("*.json"):
        try:
            parse_session_doc_id(f.stem)
        except ValueError:
            continue
        data = _read_json(f)
        if not isinstance(data, dict):
            continue
        try:
            mtime_ns = f.stat().st_mtime_ns
        except OSError:
            mtime_ns = 0
        records.append((session_order_key(f.stem, data, mtime_ns=mtime_ns), f, data))
    records.sort(reverse=True, key=lambda item: item[0])
    out = []
    for _key, f, data in records[:limit]:
        meta_day, meta_sid = _parse_session_fname(f.name)
        out.append({"date": meta_day, "id": meta_sid, **data})
    return {"ok": True, "sessions": out}

@router.get("/session/latest")
def session_latest(request: Request):
    uid   = _uid_from_request(request)
    d     = SESS_ROOT / uid / "sessions"
    if not d.exists():
        raise HTTPException(404)
    records = []
    for f in d.glob("*.json"):
        try:
            parse_session_doc_id(f.stem)
        except ValueError:
            continue
        data = _read_json(f)
        if not isinstance(data, dict):
            continue
        try:
            mtime_ns = f.stat().st_mtime_ns
        except OSError:
            mtime_ns = 0
        records.append((session_order_key(f.stem, data, mtime_ns=mtime_ns), f, data))
    if not records:
        raise HTTPException(404)
    _key, file, data = max(records, key=lambda item: item[0])
    day, _ = _parse_session_fname(file.name)
    return {"ok": True, "session": {"date": day, "data": data}}

@router.delete("/session/{date_path}")
def session_delete_by_date(date_path: str, request: Request, id: str | None = None):
    uid = _require_uid(request)
    date_path = _valid_day(date_path)
    id = _valid_id(id)
    f   = _session_path(uid, date_path, id)
    if f.exists():
        f.unlink()
        logger.info(f"session deleted  {uid}/{date_path}")
    return {"ok": True}

@router.post("/internal/sync/session", response_model=SyncResponse)
async def internal_sync_session(body: SyncRequest):
    day = _valid_day(body.date)
    try:
        n = _sync_session_to_db(day, body.session, session_id=body.session_id)
        return SyncResponse(ok=True, synced=n, date=day)
    except Exception as exc:
        logger.error(f"internal_sync_session: {exc}")
        return SyncResponse(ok=False, synced=0, date=day)

@router.get("/fitness/clients")
def clients(request: Request):
    klienten = load_klienten_registry()
    result = [{"uid": uid, "name": meta["name"], "slug": meta["slug"]} for uid, meta in klienten.items()]

    if not SESS_ROOT.exists():
        return {"ok": True, "clients": result}
    known_uids = {c["uid"] for c in result}
    for uid_dir in SESS_ROOT.iterdir():
        if not uid_dir.is_dir() or uid_dir.name in ("default", "kb") or uid_dir.name in known_uids:
            continue
        name     = uid_dir.name[:8]
        sess_dir = uid_dir / "sessions"
        if sess_dir.exists():
            files = sorted(sess_dir.glob("*.json"), reverse=True)
            if files:
                last = _read_json(files[0])
                if last and last.get("user_name"):
                    name = last["user_name"]
        result.append({"uid": uid_dir.name, "name": name})
    return {"ok": True, "clients": result}
