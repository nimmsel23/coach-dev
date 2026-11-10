"""
firestore.fuel — Fuel-Daten ↔ Firestore (fitness-aos)

Collections:
  nutrition/{uid}/logs/{date}       — Tageslog (Mahlzeiten, Wasser)
  supplements/{uid}/logs/{date}     — Supplements-Tageslog
  supplements/{uid}/meta/catalog    — Supplements-Katalog

Kein Watcher — Fuel schreibt fire-and-forget beim Loggen.
Bulk-Push via push_fuel() aus fuel/bin/fuel sync.
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from loguru import logger

from ._db import get_db, UID

FUEL_DATA_DIR = Path(
    os.getenv("AOS_FUEL_DATA_DIR", str(Path.home() / ".aos" / "fuel"))
).expanduser()


def _fuel_bridge_disabled() -> bool:
    raw = str(os.getenv("FITNESS_DISABLE_FUEL_BRIDGE", "")).strip().lower()
    return raw in {"1", "true", "yes", "on"}


# ── Lokale Pfade ──────────────────────────────────────────────────────────────

def _nutrition_path(d: str, data_dir: Path) -> Path:
    return data_dir / "nutrition" / f"{d}.json"

def _supplements_path(d: str, data_dir: Path) -> Path:
    return data_dir / "supplements" / "logs" / f"{d}.json"

def _supplements_catalog_path(data_dir: Path) -> Path:
    return data_dir / "supplements" / "catalog.json"


def _nutrition_catalog_path(data_dir: Path) -> Path:
    return data_dir / "nutrition" / "catalog.json"


# ── Helfer ────────────────────────────────────────────────────────────────────

def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text())
    except Exception as e:
        logger.warning(f"fuel: Lesen fehlgeschlagen {path}: {e}")
        return default

def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2))

def _strip_meta(obj: dict) -> dict:
    # owner_uid ist ein Sync-Sidecar (Cross-User-Guard), kein Nutzinhalt —
    # aus dem Content-Hash raushalten, damit der Stempel keine Re-Push-Welle
    # auslöst. In pull_fuel() wird er danach explizit wieder gesetzt.
    return {k: v for k, v in obj.items() if k not in ("updated_at", "_firestore_updated", "_local_mtime", "_content_hash", "saved_at", "owner_uid")}

def _merge_by_id(a: list[dict], b: list[dict]) -> list[dict]:
    by_id: dict[str, dict] = {}
    for item in a + b:
        iid = item.get("id")
        if not iid:
            continue
        existing = by_id.get(iid)
        if existing is None or item.get("time", "") > existing.get("time", ""):
            by_id[iid] = _strip_meta(item)
    return sorted(by_id.values(), key=lambda x: x.get("time", ""))

def _data_dir(uid: str) -> Path:
    if uid == "default":
        return FUEL_DATA_DIR
    data_dir = FUEL_DATA_DIR / "users" / uid
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def _owner_ok(data: Any, uid: str, label: str) -> bool:
    """Cross-User-Schutz: ein Dokument unter nutrition/<X>/… bzw.
    supplements/<X>/… gehört ausschliesslich <X>. Trägt es ein owner_uid,
    das nicht zum erwarteten uid passt, ist es fremd hereingesynct — nicht
    verarbeiten. Fehlendes owner_uid = Alt-Dokument → toleriert (bekommt den
    Stempel beim nächsten Push)."""
    if isinstance(data, dict):
        owner = data.get("owner_uid")
        if owner and owner != uid:
            logger.warning(
                f"fuel: OWNER MISMATCH {label} owner_uid={owner} expected={uid} "
                f"— übersprungen (cross-user guard)"
            )
            return False
    return True


# ── Fire-and-forget (wird vom fuel-dev Server pro Request aufgerufen) ─────────

def mirror_fuel_nutrition(date: str, data: dict, uid: str = UID) -> None:
    if _fuel_bridge_disabled():
        logger.info(f"fuel-bridge scope=runtime direction=push uid={uid} target=nutrition result=skip reason=bridge_disabled")
        return
    try:
        if not _owner_ok(data, uid, f"nutrition/{uid}/logs/{date}"):
            return
        db = get_db()
        db.collection("nutrition").document(uid).collection("logs").document(date).set(
            {**data, "date": date, "owner_uid": uid, "saved_at": datetime.utcnow().isoformat()}
        )
    except Exception as e:
        logger.warning(f"mirror_fuel_nutrition fehler ({date}, {uid}): {e}")

def mirror_fuel_supplements(date: str, data: dict, uid: str = UID) -> None:
    if _fuel_bridge_disabled():
        logger.info(f"fuel-bridge scope=runtime direction=push uid={uid} target=supplements result=skip reason=bridge_disabled")
        return
    try:
        if not _owner_ok(data, uid, f"supplements/{uid}/logs/{date}"):
            return
        db = get_db()
        db.collection("supplements").document(uid).collection("logs").document(date).set(
            {**data, "date": date, "owner_uid": uid, "saved_at": datetime.utcnow().isoformat()}
        )
    except Exception as e:
        logger.warning(f"mirror_fuel_supplements fehler ({date}, {uid}): {e}")

def mirror_fuel_catalog(data: dict, uid: str = UID, kind: str = "nutrition") -> None:
    """kind: 'nutrition' | 'supplements'"""
    if _fuel_bridge_disabled():
        logger.info(f"fuel-bridge scope=catalog direction=push uid={uid} target={kind} result=skip reason=bridge_disabled")
        return
    try:
        db = get_db()
        col = "nutrition" if kind == "nutrition" else "supplements"
        db.collection(col).document(uid).collection("meta").document("catalog").set(
            {**data, "owner_uid": uid, "saved_at": datetime.utcnow().isoformat()}, merge=True
        )
    except Exception as e:
        logger.warning(f"mirror_fuel_catalog fehler ({kind}, {uid}): {e}")


# ── Bulk-Sync (für CLI push/pull) ─────────────────────────────────────────────

def _push_nutrition(date: str, uid: str, data_dir: Path) -> str:
    data = _read_json(_nutrition_path(date, data_dir), None)
    if not data:
        return "leer"
    if not _owner_ok(data, uid, f"nutrition/{uid}/logs/{date} (lokal)"):
        return "fremd (skip)"
    db = get_db()
    db.collection("nutrition").document(uid).collection("logs").document(date).set(
        {**data, "date": date, "owner_uid": uid, "saved_at": datetime.utcnow().isoformat()}
    )
    return f"{len(data.get('meals', []))} Mahlzeiten"

def _push_supplements(date: str, uid: str, data_dir: Path) -> str:
    data = _read_json(_supplements_path(date, data_dir), None)
    if not data:
        return "leer"
    if not _owner_ok(data, uid, f"supplements/{uid}/logs/{date} (lokal)"):
        return "fremd (skip)"
    db = get_db()
    db.collection("supplements").document(uid).collection("logs").document(date).set(
        {**data, "date": date, "owner_uid": uid, "saved_at": datetime.utcnow().isoformat()}
    )
    return f"{len(data.get('entries', []))} Einträge"

def _push_catalog(uid: str, data_dir: Path) -> str:
    local = _read_json(_supplements_catalog_path(data_dir), {"items": []})
    items = local.get("items", [])
    if not items:
        return "leer"
    db = get_db()
    doc_ref = db.collection("supplements").document(uid).collection("meta").document("catalog")
    snap = doc_ref.get()
    remote = snap.to_dict().get("items", []) if snap.exists else []
    merged = _merge_by_id(items, remote)
    _write_json(_supplements_catalog_path(data_dir), {"items": merged})
    doc_ref.set({"items": merged, "owner_uid": uid}, merge=True)
    return f"{len(merged)} Items"

def _collect_dates(data_dir: Path) -> list[str]:
    dates: set[str] = set()
    for sub in (data_dir / "nutrition", data_dir / "supplements" / "logs"):
        if sub.exists():
            for f in sub.glob("????-??-??.json"):
                dates.add(f.stem)
    return sorted(dates)


_BATCH_LIMIT = 400  # Firestore: 500 ops/batch hard limit


def _mtime_ms(p: Path) -> int:
    try:
        return int(p.stat().st_mtime * 1000)
    except FileNotFoundError:
        return 0


def _content_hash(obj: Any) -> str:
    import hashlib
    return hashlib.sha1(
        json.dumps(_strip_meta(obj) if isinstance(obj, dict) else obj, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()[:12]

def _hash_matches(stored: Any, computed: str) -> bool:
    if not stored:
        return False
    stored_s = str(stored)
    return stored_s == computed or stored_s.startswith(computed) or computed.startswith(stored_s)

def _is_same_content(remote: dict, local: dict) -> bool:
    remote_hash = remote.get("_content_hash")
    local_hash = _content_hash(local)
    if _hash_matches(remote_hash, local_hash):
        return True
    return _content_hash(remote) == local_hash


def push_fuel(uid: str = UID) -> dict:
    """Alle lokalen Fuel-Daten → Firestore. Batched + idempotent (mtime/hash skip).

    Kein _quota_ok-Probe-Write mehr: erster echter Batch-Commit zeigt's selbst.
    """
    from google.api_core.exceptions import ResourceExhausted

    if _fuel_bridge_disabled():
        logger.info(f"fuel-bridge scope=runtime direction=push uid={uid} result=skip reason=bridge_disabled")
        return {"dates": 0, "written": 0, "skipped": 0, "disabled": True}

    db = get_db()
    data_dir = _data_dir(uid)
    dates = _collect_dates(data_dir)
    results: dict[str, Any] = {"dates": len(dates), "written": 0, "skipped": 0}

    batch = db.batch()
    ops = 0

    def commit_batch():
        nonlocal batch, ops
        if ops == 0:
            return
        batch.commit()
        batch = db.batch()
        ops = 0

    def queue_set(ref, payload):
        nonlocal ops
        batch.set(ref, payload, merge=True)
        ops += 1
        results["written"] += 1
        if ops >= _BATCH_LIMIT:
            commit_batch()

    def remote_meta(ref) -> dict:
        snap = ref.get()
        return snap.to_dict() if snap.exists else {}

    try:
        for d in dates:
            # Nutrition
            np = _nutrition_path(d, data_dir)
            if np.exists():
                mtime = _mtime_ms(np)
                ref = db.collection("nutrition").document(uid).collection("logs").document(d)
                remote = remote_meta(ref)
                data = _read_json(np, None)
                if data and not _owner_ok(data, uid, f"nutrition/{uid}/logs/{d} (lokal)"):
                    results["skipped"] += 1
                elif data and _is_same_content(remote, data):
                    results["skipped"] += 1
                elif data and remote.get("_local_mtime", 0) >= mtime:
                    results["skipped"] += 1
                elif data:
                    queue_set(ref, {**data, "date": d, "owner_uid": uid, "_local_mtime": mtime,
                                    "_content_hash": _content_hash(data),
                                    "saved_at": datetime.utcnow().isoformat()})

            # Supplements
            sp = _supplements_path(d, data_dir)
            if sp.exists():
                mtime = _mtime_ms(sp)
                ref = db.collection("supplements").document(uid).collection("logs").document(d)
                remote = remote_meta(ref)
                data = _read_json(sp, None)
                if data and not _owner_ok(data, uid, f"supplements/{uid}/logs/{d} (lokal)"):
                    results["skipped"] += 1
                elif data and _is_same_content(remote, data):
                    results["skipped"] += 1
                elif data and remote.get("_local_mtime", 0) >= mtime:
                    results["skipped"] += 1
                elif data:
                    queue_set(ref, {**data, "date": d, "owner_uid": uid, "_local_mtime": mtime,
                                    "_content_hash": _content_hash(data),
                                    "saved_at": datetime.utcnow().isoformat()})

        # Supplements Catalog (Hash-Idempotenz, kein read+merge+write mehr)
        cat_path = _supplements_catalog_path(data_dir)
        if cat_path.exists():
            local = _read_json(cat_path, {"items": []})
            items = local.get("items", [])
            if items:
                ref = db.collection("supplements").document(uid).collection("meta").document("catalog")
                new_hash = _content_hash(items)
                if _hash_matches(remote_meta(ref).get("_content_hash"), new_hash):
                    results["skipped"] += 1
                else:
                    queue_set(ref, {"items": items, "owner_uid": uid, "_content_hash": new_hash,
                                    "saved_at": datetime.utcnow().isoformat()})

        nutrition_cat_path = _nutrition_catalog_path(data_dir)
        if nutrition_cat_path.exists():
            local = _read_json(nutrition_cat_path, {"items": []})
            items = local.get("items", [])
            if items:
                ref = db.collection("nutrition").document(uid).collection("meta").document("catalog")
                new_hash = _content_hash(items)
                if _hash_matches(remote_meta(ref).get("_content_hash"), new_hash):
                    results["skipped"] += 1
                else:
                    queue_set(ref, {"items": items, "owner_uid": uid, "_content_hash": new_hash,
                                    "saved_at": datetime.utcnow().isoformat()})

        commit_batch()
        logger.success(f"fuel push uid={uid}: {results['written']} writes, {results['skipped']} skipped")

    except ResourceExhausted:
        logger.error("Quota erschöpft — Push abgebrochen (reset ~09:00 lokal)")
        results["error"] = "quota_exceeded"
    except Exception as e:
        if "429" in str(e) or "Quota" in str(e):
            logger.error("Quota erschöpft — Push abgebrochen")
            results["error"] = "quota_exceeded"
        else:
            logger.error(f"Push-Fehler: {e}")
            results["error"] = str(e)

    return results


def pull_fuel(uid: str = UID) -> dict:
    """Firestore → lokale Fuel-Daten."""
    if _fuel_bridge_disabled():
        logger.info(f"fuel-bridge scope=runtime direction=pull uid={uid} result=skip reason=bridge_disabled")
        return {"nutrition": 0, "supplements": 0, "disabled": True}
    db = get_db()
    data_dir = _data_dir(uid)
    count = {"nutrition": 0, "supplements": 0}

    for snap in db.collection("nutrition").document(uid).collection("logs").stream():
        raw = snap.to_dict()
        if not _owner_ok(raw, uid, f"nutrition/{uid}/logs/{snap.id}"):
            continue
        _write_json(_nutrition_path(snap.id, data_dir), {**_strip_meta(raw), "owner_uid": uid})
        count["nutrition"] += 1

    for snap in db.collection("supplements").document(uid).collection("logs").stream():
        raw = snap.to_dict()
        if not _owner_ok(raw, uid, f"supplements/{uid}/logs/{snap.id}"):
            continue
        _write_json(_supplements_path(snap.id, data_dir), {**_strip_meta(raw), "owner_uid": uid})
        count["supplements"] += 1

    doc = db.collection("supplements").document(uid).collection("meta").document("catalog").get()
    if doc.exists and _owner_ok(doc.to_dict(), uid, f"supplements/{uid}/meta/catalog"):
        _write_json(_supplements_catalog_path(data_dir), {**_strip_meta(doc.to_dict()), "owner_uid": uid})

    doc = db.collection("nutrition").document(uid).collection("meta").document("catalog").get()
    if doc.exists and _owner_ok(doc.to_dict(), uid, f"nutrition/{uid}/meta/catalog"):
        _write_json(_nutrition_catalog_path(data_dir), {**_strip_meta(doc.to_dict()), "owner_uid": uid})

    return count
