import os
import yaml
import asyncio
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Request, Query, HTTPException

from fitness.api.config import (
    PORT, ENV, RUNTIME, BODY_DIR, SESS_ROOT, _HERE, _DIST_DIR, _uid_from_request, _read_json, _write_json,
    _wger_post, logger
)
from db.schemas import HealthResponse, BodyResponse

# ── firestore imports ─────────────────────────────────────────────────────────
from fitness.firestore.mirror import mirror_session
from fitness.firestore.mirror import get_status as firestore_status
try:
    from fitness.firestore.sync import pull as firestore_pull, pull_workout_logs as firestore_pull_workout_logs
    _FIRESTORE_PULL_AVAILABLE = True
except ImportError:
    _FIRESTORE_PULL_AVAILABLE = False

router = APIRouter()
_THEME_FILE = RUNTIME / "theme.json"

@router.post("/fitness/note-backfill")
def note_backfill(uid: str | None = None, apply: bool = False):
    """On-demand: Haiku liest Session-JSONs mit leerem reps/weight oder fehlendem block
    und schlaegt Korrekturen aus den geloggten Fakten vor; bei apply=True schreibt der
    Backend-Prozess selbst (mit .bak-Backup), Haiku editiert nichts direkt."""
    from fitness.runtime.note_backfill import fix_sessions, find_suspect_default_effort

    results = fix_sessions(user_id=uid, apply=apply)
    suspects = find_suspect_default_effort(user_id=uid)
    return {
        "dry_run": not apply,
        "session_count": len(results),
        "sessions": [r.__dict__ for r in results],
        "suspect_default_effort": suspects,
    }

def _today() -> str:
    return date.today().isoformat()

def _require_uid(request: Request) -> str:
    uid = _uid_from_request(request)
    if not uid or uid == "default":
        raise HTTPException(400, detail="uid Pflicht. Aktive UID fehlt; via ?uid=... oder X-User-UID Header senden.")
    return uid


def _require_local_request(request: Request) -> None:
    if not request.client or request.client.host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(403, detail="Lokaler Fitness-Sync ist nur auf diesem Rechner verfügbar.")
    if request.url.hostname not in ("127.0.0.1", "localhost", "::1"):
        raise HTTPException(403, detail="Lokaler Hostname erforderlich.")
    origin = request.headers.get("origin")
    if origin:
        from urllib.parse import urlsplit
        parsed = urlsplit(origin)
        if parsed.netloc != request.url.netloc or parsed.scheme != request.url.scheme:
            raise HTTPException(403, detail="Fremder Ursprung abgelehnt.")

@router.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(ok=True, port=PORT, runtime=str(RUNTIME), env=ENV)

@router.get("/theme")
def theme_get():
    return _read_json(_THEME_FILE, {"theme": "mocha"})

@router.post("/theme")
async def theme_post(request: Request):
    body = await request.json()
    _write_json(_THEME_FILE, body)
    return {"ok": True}

def _body_dir(uid: str):
    return SESS_ROOT / uid / "body"

@router.get("/fitness/body", response_model=BodyResponse)
def body_get(request: Request, days: int = Query(30, le=365, ge=1)):
    uid = _uid_from_request(request)
    # Pro-uid-Ordner zuerst, globaler BODY_DIR als Legacy-Fallback für
    # Einträge von vor diesem Fix — vorher war BODY_DIR ein einziger Topf
    # für alle Klienten, Gewicht/Schlaf/HF hätten sich pro Datum überschrieben.
    own_dir = _body_dir(uid)
    own_dir.mkdir(parents=True, exist_ok=True)
    by_date: dict[str, dict] = {}
    for f in BODY_DIR.glob("????-??-??.json"):
        if (e := _read_json(f)):
            by_date[f.stem] = e
    for f in own_dir.glob("????-??-??.json"):
        if (e := _read_json(f)):
            by_date[f.stem] = e  # eigener Ordner hat Vorrang vor Legacy-Global
    entries = [by_date[d] for d in sorted(by_date, reverse=True)[:days]]
    return {"ok": True, "entries": entries}

@router.post("/fitness/body")
async def body_post(request: Request):
    uid = _uid_from_request(request)
    dir_ = _body_dir(uid)
    dir_.mkdir(parents=True, exist_ok=True)
    payload  = await request.json()
    day      = payload.get("date", _today())
    f        = dir_ / f"{day}.json"
    existing = _read_json(f, {"date": day})
    _write_json(f, {**existing, **payload, "updated_at": datetime.utcnow().isoformat()})
    if payload.get("weight_kg") is not None:
        asyncio.create_task(_wger_post("/weightentry/", {"date": day, "weight": str(payload["weight_kg"])}))
        logger.info(f"body saved  {uid}/{day}  weight={payload['weight_kg']}kg  → wger sync")
    else:
        logger.info(f"body saved  {uid}/{day}")
    return {"ok": True, "day": day}

@router.get("/firestore/status")
def fs_status():
    return firestore_status()

@router.post("/firestore/sync")
def fs_sync(request: Request):
    uid      = _require_uid(request)
    sess_root = RUNTIME / "users"
    sess_dir = sess_root / uid / "sessions"
    if not sess_dir.exists():
        return {"ok": True, "synced": 0}
    files = sorted(sess_dir.glob("*.json"), reverse=True)[:30]
    count = 0
    for f in files:
        sess = _read_json(f)
        if not sess:
            continue
        base = f.name.removesuffix(".json")
        day = base.split("__")[0]
        mirror_session(day, sess, uid)
        count += 1
    logger.info(f"firestore/sync  {uid}  {count} sessions")
    return {"ok": True, "synced": count}

@router.post("/firestore/pull")
def fs_pull(request: Request):
    uid = _require_uid(request)
    status = firestore_status()
    if not status.get("ok"):
        raise HTTPException(503, detail="Firestore nicht verbunden")
    if not _FIRESTORE_PULL_AVAILABLE:
        raise HTTPException(503, detail="firestore.sync.pull nicht verfügbar")
    sess_root = RUNTIME / "users"
    sess_dir = sess_root / uid / "sessions"
    sess_dir.mkdir(parents=True, exist_ok=True)
    try:
        result = firestore_pull(uid=uid)
        logger.info(f"firestore/pull  {uid}  {result}")
        return {
            "ok": True,
            "uid": uid,
            **result,
            "pulled": result.get("sessions", 0),
            "journal_pulled": result.get("journal", 0),
            "habit_journal_pulled": result.get("habit_journal", 0),
            "habit_record_pulled": result.get("habit_record", 0),
            "conflicts": result.get("conflicts", 0),
            "conflict_dates": result.get("conflict_dates", []),
        }
    except Exception as exc:
        logger.error(f"firestore/pull {uid}: {exc}")
        raise HTTPException(500, detail=str(exc))


@router.post("/firestore/pull-workout-logs")
def fs_pull_workout_logs(request: Request):
    """Local-only, metadata-only pull for the selected client's cloud workouts."""
    _require_local_request(request)
    uid = _require_uid(request)
    status = firestore_status()
    if not status.get("ok"):
        raise HTTPException(503, detail="Firestore nicht verbunden")
    if not _FIRESTORE_PULL_AVAILABLE:
        raise HTTPException(503, detail="firestore.sync.pull_workout_logs nicht verfügbar")
    try:
        result = firestore_pull_workout_logs(uid=uid)
        logger.info(f"firestore/pull-workout-logs  {uid}  {result}")
        return {"ok": True, **result, "storage": "local-fitness-runtime/cloud-workouts"}
    except Exception as exc:
        logger.error(f"firestore/pull-workout-logs {uid}: {exc}")
        raise HTTPException(500, detail="Lokale Workout-Projektion konnte nicht aktualisiert werden.")

@router.get("/fitness/config")
def fitness_config():
    # config.yml ist echtes YAML (von wger.py/obsidian.py via load_catalog_yaml
    # gelesen) — _read_json() (json.loads) crashte hier immer still auf dem
    # Except-Fallback, GET lieferte dadurch dauerhaft ein leeres {} zurück.
    from fitness.catalog.core.yaml_utils import load_yaml
    try:
        config = load_yaml(_HERE.parent / "catalog" / "config.yml") or {}
    except Exception as exc:
        logger.warning(f"fitness_config: {exc}")
        config = {}
    return {"ok": True, "config": config, "source": "local_yaml"}

@router.post("/fitness/config")
async def fitness_config_post(request: Request):
    # Dito: mit _write_json() (json.dump) wäre die echte YAML-Config mit
    # JSON-Text überschrieben worden — wger.py/obsidian.py hätten danach
    # beim nächsten load_catalog_yaml("config.yml") gecrasht.
    from fitness.catalog.core.yaml_utils import dump_yaml
    body = await request.json()
    dump_yaml(body, _HERE.parent / "catalog" / "config.yml")
    return {"ok": True}
