from __future__ import annotations

import json
import os
import hashlib
import sqlite3
from pathlib import Path
from typing import Any
from loguru import logger
import yaml
from .paths import REPO_DIR

# ── Config ────────────────────────────────────────────────────────────────────

FUEL_DATA_DIR = Path(
    os.getenv("AOS_FUEL_DATA_DIR", str(Path.home() / ".aos" / "fuel"))
).expanduser()

SA_PATH = Path(
    os.getenv("FUEL_FIRESTORE_SA", str(Path.home() / ".env" / "firebase-fitness.json"))
).expanduser()

DEFAULT_UID = os.getenv("FUEL_CLOUD_UID", "default")
BATCH_LIMIT = 400  # Firestore: 500 ops/batch hard limit
ROOT = REPO_DIR

# ── Lazy Firestore connection ─────────────────────────────────────────────────

_fs = None


def get_fs():
    global _fs
    if _fs is not None:
        return _fs
    if not SA_PATH.exists():
        raise FileNotFoundError(
            f"Service Account nicht gefunden: {SA_PATH}\n"
            "Firebase Console → Projekteinstellungen → Service Accounts → Schlüssel generieren"
        )
    import firebase_admin
    from firebase_admin import credentials, firestore as fb_firestore

    if not firebase_admin._apps:
        cred = credentials.Certificate(str(SA_PATH))
        firebase_admin.initialize_app(cred)
    _fs = fb_firestore.client()
    logger.info("fuel-firestore: Firestore verbunden")
    return _fs


def _discover_uids() -> list[str]:
    """Findet alle UID-Verzeichnisse unter ~/.aos/fuel/users/."""
    users_dir = FUEL_DATA_DIR / "users"
    if not users_dir.exists():
        return []
    return sorted([p.name for p in users_dir.iterdir() if p.is_dir() and p.name != "default"])


def data_dir_for(uid: str) -> Path:
    """Liefert das lokale Verzeichnis für eine UID (legacy 'default' → flat)."""
    if uid == "default":
        return FUEL_DATA_DIR
    d = FUEL_DATA_DIR / "users" / uid
    d.mkdir(parents=True, exist_ok=True)
    return d


def _mtime_ms(p: Path) -> int:
    try:
        return int(p.stat().st_mtime * 1000)
    except FileNotFoundError:
        return 0


def simple_hash(obj: Any) -> str:
    return hashlib.sha1(
        json.dumps(obj, sort_keys=True, ensure_ascii=False, default=_json_default).encode()
    ).hexdigest()[:12]


# ── Lokale Pfade ──────────────────────────────────────────────────────────────

def _nutrition_path(d: str, data_dir: Path) -> Path:
    return data_dir / "nutrition" / f"{d}.json"


def _journal_path(d: str, data_dir: Path) -> Path:
    return data_dir / "nutrition_journal" / f"{d}.md"


def _supplements_path(d: str, data_dir: Path) -> Path:
    return data_dir / "supplements" / "logs" / f"{d}.json"


def _supplements_catalog_path(data_dir: Path) -> Path:
    return data_dir / "supplements" / "catalog.json"


def _nutrition_catalog_path(data_dir: Path) -> Path:
    return data_dir / "nutrition" / "catalog.json"


def _legacy_nutrition_catalog_items() -> list[dict]:
    items: list[dict] = []
    seen_ids: set[str] = set()

    meals_dir = ROOT / "catalogs" / "nutrition" / "meals"
    if meals_dir.exists():
        for ext in ("yaml", "yml", "json"):
            for f in meals_dir.glob(f"*.{ext}"):
                iid = f.stem
                if iid in seen_ids and ext == "json":
                    continue
                try:
                    raw = f.read_text(encoding="utf-8")
                    item = json.loads(raw) if ext == "json" else yaml.safe_load(raw)
                    if item:
                        items.append(item)
                        seen_ids.add(iid)
                except Exception as e:
                    logger.error(f"Fehler beim Laden von Meal-File {f.name}: {e}")

    nutrition_dir = ROOT / "catalogs" / "nutrition"
    for legacy_name in ("catalog.yaml", "catalog.json"):
        legacy_path = nutrition_dir / legacy_name
        if legacy_path.exists():
            try:
                raw = legacy_path.read_text(encoding="utf-8")
                data = json.loads(raw) if legacy_name.endswith(".json") else yaml.safe_load(raw)
                legacy_items = data.get("items") if isinstance(data, dict) else data
                if isinstance(legacy_items, list):
                    for item in legacy_items:
                        iid = item.get("id")
                        if iid and iid not in seen_ids:
                            items.append(item)
                            seen_ids.add(iid)
                    break
            except Exception as e:
                logger.error(f"Fehler beim Laden von legacy catalog {legacy_name}: {e}")

    return items


def _load_local_nutrition_catalog_items(data_dir: Path) -> list[dict]:
    local_path = _nutrition_catalog_path(data_dir)
    local_items = _read_json(local_path, {"items": []}).get("items", [])
    if local_items:
        return local_items
    legacy_items = _legacy_nutrition_catalog_items()
    if legacy_items:
        logger.warning(
            f"fuel-sync scope=catalog source=legacy-repo uid={data_dir.name} "
            f"path={local_path} result=fallback count={len(legacy_items)}"
        )
    return legacy_items


# ── Datei-Helfer ──────────────────────────────────────────────────────────────

def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning(f"Lesen fehlgeschlagen {path}: {e}")
        return default


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, default=_json_default),
        encoding="utf-8",
    )


def _json_default(value: Any) -> Any:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _strip_firestore_fields(obj: dict) -> dict:
    """Entfernt Firestore-interne Felder (updated_at, Timestamps)."""
    return {k: v for k, v in obj.items() if k not in ("updated_at", "_firestore_updated")}


def _locally_deleted_meal_ids() -> set[str]:
    """IDs aller lokal tombstoned Meal-Catalog-Einträge (*.yaml.deleted etc.).

    Schwester-Implementierung zu listDeletedMealIds() in
    nutrition-catalog.mjs — eine lokale Löschung muss auch beim Python-Sync
    gewinnen, egal was Firestore noch an alten Docs hat.
    """
    meals_dir = ROOT / "catalogs" / "nutrition" / "meals"
    if not meals_dir.exists():
        return set()
    ids = set()
    for f in meals_dir.glob("*.deleted"):
        stem = f.name
        for ext in (".yaml.deleted", ".yml.deleted", ".json.deleted"):
            if stem.endswith(ext):
                ids.add(stem[: -len(ext)])
                break
    return ids


# ── Merge ─────────────────────────────────────────────────────────────────────

def _merge_by_id(a: list[dict], b: list[dict]) -> list[dict]:
    """Union zweier Listen by 'id'. Neuestes 'time'-Feld gewinnt bei Konflikt."""
    by_id: dict[str, dict] = {}
    for item in a + b:
        iid = item.get("id")
        if not iid:
            continue
        existing = by_id.get(iid)
        if existing is None or item.get("time", "") > existing.get("time", ""):
            by_id[iid] = _strip_firestore_fields(item)
    return sorted(by_id.values(), key=lambda x: x.get("time", ""))


# ── Sync Operations ───────────────────────────────────────────────────────────

def sync_nutrition(d: str, direction: str, uid: str, data_dir: Path) -> dict:
    fs = get_fs()
    local_path = _nutrition_path(d, data_dir)
    local = _read_json(local_path, {"date": d, "meals": [], "water_ml": 0})

    doc_ref = fs.collection("nutrition").document(uid).collection("logs").document(d)
    snap = doc_ref.get()
    remote = snap.to_dict() if snap.exists else {"date": d, "meals": [], "water_ml": 0}

    remote_meals = [_strip_firestore_fields(m) for m in (remote.get("meals") or [])]
    local_meals = local.get("meals") or []

    if direction == "push":
        merged_meals = _merge_by_id(local_meals, remote_meals)
    elif direction == "pull":
        merged_meals = remote_meals
    else:
        merged_meals = _merge_by_id(local_meals, remote_meals)

    water_ml = remote.get("water_ml") or local.get("water_ml", 0)

    result = {"date": d, "meals": merged_meals, "water_ml": water_ml}
    _write_json(local_path, result)
    doc_ref.set({"date": d, "meals": merged_meals, "water_ml": water_ml}, merge=True)

    return {"meals": len(merged_meals), "water_ml": water_ml}


def sync_supplements(d: str, direction: str, uid: str, data_dir: Path) -> dict:
    fs = get_fs()
    local_path = _supplements_path(d, data_dir)
    local = _read_json(local_path, {"date": d, "intakes": []})

    doc_ref = fs.collection("supplements").document(uid).collection("logs").document(d)
    snap = doc_ref.get()
    remote = snap.to_dict() if snap.exists else {"date": d, "intakes": []}

    remote_intakes = [_strip_firestore_fields(i) for i in (remote.get("intakes") or [])]
    local_intakes = local.get("intakes") or []

    if direction == "push":
        merged = _merge_by_id(local_intakes, remote_intakes)
    elif direction == "pull":
        merged = remote_intakes
    else:
        merged = _merge_by_id(local_intakes, remote_intakes)

    _write_json(local_path, {"date": d, "intakes": merged})
    doc_ref.set({"date": d, "intakes": merged}, merge=True)

    return {"intakes": len(merged)}


def sync_journal(d: str, direction: str, uid: str, data_dir: Path) -> dict:
    fs = get_fs()
    local_path = _journal_path(d, data_dir)
    local_content = local_path.read_text(encoding="utf-8") if local_path.exists() else ""
    local_mtime = local_path.stat().st_mtime if local_path.exists() else 0.0

    doc_ref = fs.collection("nutrition").document(uid).collection("journal").document(d)
    snap = doc_ref.get()
    remote_content = snap.to_dict().get("content", "") if snap.exists else ""

    if direction == "push":
        result_content = local_content
    elif direction == "pull":
        result_content = remote_content
    else:
        remote_ts = 0.0
        if snap.exists:
            updated_at = snap.to_dict().get("updated_at")
            if updated_at and hasattr(updated_at, "timestamp"):
                remote_ts = updated_at.timestamp()
        result_content = remote_content if remote_ts > local_mtime else local_content

    if result_content:
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_text(result_content, encoding="utf-8")
        doc_ref.set({"date": d, "content": result_content}, merge=True)

    return {"journal_chars": len(result_content)}


def sync_supplements_catalog(direction: str, uid: str, data_dir: Path) -> dict:
    fs = get_fs()
    local_path = _supplements_catalog_path(data_dir)
    local_items = _read_json(local_path, {"items": []}).get("items", [])

    doc_ref = fs.collection("supplements").document(uid).collection("meta").document("catalog")
    snap = doc_ref.get()
    remote_items = snap.to_dict().get("items", []) if snap.exists else []

    if direction == "push":
        merged_items = _merge_by_id(local_items, remote_items)
    elif direction == "pull":
        merged_items = remote_items
    else:
        merged_items = _merge_by_id(local_items, remote_items)

    _write_json(local_path, {"items": merged_items})
    doc_ref.set({"items": merged_items}, merge=True)

    return {"catalog_items": len(merged_items)}


def _export_catalog_json(items: list[dict]) -> None:
    """Regeneriert die Legacy-catalog.json rein als Export der aktuellen
    Meal-YAMLs — kein unabhängiges Schreibziel mehr (Fix 2026-08-01: der
    Firestore-Pull schrieb hier vorher ungefiltert rein und ignorierte
    Tombstones, wodurch gelöschte Einträge wie Ashwagandha/Käsekrainer über
    catalog_lookup.py wieder auftauchten). SSOT bleiben die Einzel-Files
    unter catalogs/nutrition/meals/ — catalog.json ist nur noch ein
    generierter Snapshot für Alt-Konsumenten, die eine einzelne JSON-Datei
    erwarten.
    """
    nutrition_dir = ROOT / "catalogs" / "nutrition"
    nutrition_dir.mkdir(parents=True, exist_ok=True)
    _write_json(nutrition_dir / "catalog.json", {"items": items})


def sync_nutrition_catalog(direction: str, uid: str, data_dir: Path) -> dict:
    fs = get_fs()
    local_catalog_path = _nutrition_catalog_path(data_dir)

    if direction == "pull":
        doc_ref = fs.collection("nutrition").document(uid).collection("meta").document("catalog")
        snap = doc_ref.get()
        remote_items = snap.to_dict().get("items", []) if snap.exists else []
        _write_json(
            local_catalog_path,
            {"items": [_strip_firestore_fields(item) for item in remote_items]},
        )
        logger.info(
            f"fuel-sync scope=catalog direction=pull uid={uid} "
            f"path={local_catalog_path} result=ok count={len(remote_items)}"
        )
        return {"catalog_items": len(remote_items)}

    local_items = _load_local_nutrition_catalog_items(data_dir)

    doc_ref = fs.collection("nutrition").document(uid).collection("meta").document("catalog")
    snap = doc_ref.get()
    remote_items = snap.to_dict().get("items", []) if snap.exists else []

    # Eine lokale Löschung (Tombstone-Rename auf .deleted) muss IMMER gewinnen
    # — unabhängig davon, ob Firestore die ID noch führt. Ohne diesen Filter
    # kommen tombstoned Katalog-Einträge (z.B. Ashwagandha, Käsekrainer) über
    # jeden push/pull wieder rein, weil _merge_by_id nur addieren kann.
    deleted_ids = _locally_deleted_meal_ids()
    remote_items = [it for it in remote_items if it.get("id") not in deleted_ids]

    if direction == "push":
        merged_items = _merge_by_id(local_items, remote_items)
        doc_ref.set({"items": merged_items}, merge=True)
    elif direction == "push-snapshot":
        # Echter Snapshot-Push: lokale Dateien sind die Wahrheit, kein Union-
        # Merge mit Remote — sonst tauchen lokal gelöschte Katalog-Einträge
        # (z.B. bei einer Duplikat-Bereinigung) nach dem nächsten Push wieder
        # in Firestore auf (_merge_by_id kann nur hinzufügen, nie entfernen).
        merged_items = [_strip_firestore_fields(item) for item in local_items]
        doc_ref.set({"items": merged_items})  # kein merge=True — echtes Overwrite
    else:
        merged_items = _merge_by_id(local_items, remote_items)
        doc_ref.set({"items": merged_items}, merge=True)

    _write_json(local_catalog_path, {"items": merged_items})
    logger.info(
        f"fuel-sync scope=catalog direction={direction} uid={uid} "
        f"path={local_catalog_path} result=ok count={len(merged_items)}"
    )
    return {"catalog_items": len(merged_items)}


def push_micros_catalog(fs) -> dict:
    """Pushes meal_micros table from local SQLite to Firestore public micros catalog."""
    db_paths = []
    repo_db = ROOT / "data" / "catalogs" / "nutrition" / "nutrition.db"
    if repo_db.exists():
        db_paths.append(repo_db)
        
    global_data_dir = FUEL_DATA_DIR
    users_dir = global_data_dir / "users"
    if users_dir.exists():
        for u_dir in users_dir.iterdir():
            if u_dir.is_dir():
                user_db = u_dir / "nutrition" / "nutrition.db"
                if user_db.exists():
                    db_paths.append(user_db)
                    
    single_user_db = global_data_dir / "nutrition" / "nutrition.db"
    if single_user_db.exists():
        db_paths.append(single_user_db)
        
    all_micros = {}
    for db_path in db_paths:
        try:
            conn = sqlite3.connect(str(db_path))
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='meal_micros'")
            if cursor.fetchone():
                cursor.execute("SELECT * FROM meal_micros")
                rows = cursor.fetchall()
                for row in rows:
                    meal_name = row["meal_name"]
                    data = dict(row)
                    data.pop("id", None)
                    data.pop("created_at", None)
                    
                    if meal_name not in all_micros:
                        all_micros[meal_name] = data
                    else:
                        existing = all_micros[meal_name]
                        if data.get("updated_at", "") > existing.get("updated_at", ""):
                            all_micros[meal_name] = data
            conn.close()
        except Exception as e:
            logger.error(f"Fehler beim Lesen von SQLite DB ({db_path}): {e}")
            
    if not all_micros:
        return {"skipped": 1}
        
    ref = fs.collection("nutrition").document("public").collection("meta").document("micros")
    snap = ref.get()
    
    items = list(all_micros.values())
    new_hash = simple_hash(items)
    
    if snap.exists and snap.to_dict().get("_content_hash") == new_hash:
        return {"skipped": 1}
    else:
        from firebase_admin import firestore as fb_firestore
        ref.set({
            "items": items,
            "_content_hash": new_hash,
            "updated_at": fb_firestore.SERVER_TIMESTAMP
        })
        logger.info(f"fuel-firestore: {len(items)} meal micros pushed to public catalog")
        return {"written": 1}


# ── Batch Pushes / Pulls ──────────────────────────────────────────────────────

def collect_dates(data_dir: Path) -> list[str]:
    """Alle lokalen Datumsfiles aus nutrition/ + supplements/logs/."""
    dates: set[str] = set()
    for sub in (data_dir / "nutrition", data_dir / "supplements" / "logs"):
        if sub.exists():
            for f in sub.glob("????-??-??.json"):
                dates.add(f.stem)
    return sorted(dates)


def collect_remote_dates(uid: str) -> list[str]:
    """Alle vorhandenen Remote-Tage für eine UID aus Nutrition/Supplements/Journal."""
    fs = get_fs()
    dates: set[str] = set()
    collections = [
        fs.collection("nutrition").document(uid).collection("logs"),
        fs.collection("supplements").document(uid).collection("logs"),
        fs.collection("nutrition").document(uid).collection("journal"),
    ]
    for col in collections:
        for snap in col.stream():
            if snap.id:
                dates.add(snap.id)
    return sorted(dates)


def push_uid_batched(uid: str, data_dir: Path) -> dict:
    """Push aller lokalen Daten für eine UID — batched + idempotent (mtime/hash skip)."""
    from firebase_admin import firestore as fb_firestore

    fs = get_fs()
    batch = fs.batch()
    ops = 0
    stats = {"written": 0, "skipped": 0}

    def commit_if_full():
        nonlocal batch, ops
        if ops >= BATCH_LIMIT:
            batch.commit()
            batch = fs.batch()
            ops = 0

    def batch_set(ref, payload):
        nonlocal ops
        batch.set(ref, payload, merge=True)
        ops += 1
        stats["written"] += 1
        commit_if_full()

    def remote_meta(ref) -> dict:
        snap = ref.get()
        return snap.to_dict() if snap.exists else {}

    server_ts = fb_firestore.SERVER_TIMESTAMP

    dates = collect_dates(data_dir)
    for d in dates:
        # Nutrition
        np = _nutrition_path(d, data_dir)
        if np.exists():
            mtime = _mtime_ms(np)
            ref = fs.collection("nutrition").document(uid).collection("logs").document(d)
            meta = remote_meta(ref)
            if meta.get("_local_mtime", 0) >= mtime:
                stats["skipped"] += 1
            else:
                data = _read_json(np, {"date": d, "meals": [], "water_ml": 0})
                batch_set(ref, {**data, "_local_mtime": mtime, "updated_at": server_ts})

        # Supplements
        sp = _supplements_path(d, data_dir)
        if sp.exists():
            mtime = _mtime_ms(sp)
            ref = fs.collection("supplements").document(uid).collection("logs").document(d)
            meta = remote_meta(ref)
            if meta.get("_local_mtime", 0) >= mtime:
                stats["skipped"] += 1
            else:
                data = _read_json(sp, {"date": d, "intakes": []})
                batch_set(ref, {**data, "_local_mtime": mtime, "updated_at": server_ts})

        # Journal
        jp = _journal_path(d, data_dir)
        if jp.exists():
            mtime = _mtime_ms(jp)
            ref = fs.collection("nutrition").document(uid).collection("journal").document(d)
            meta = remote_meta(ref)
            if meta.get("_local_mtime", 0) >= mtime:
                stats["skipped"] += 1
            else:
                content = jp.read_text(encoding="utf-8")
                batch_set(ref, {"date": d, "content": content, "_local_mtime": mtime, "updated_at": server_ts})

    # Supplements Catalog
    cat_path = _supplements_catalog_path(data_dir)
    if cat_path.exists():
        items = _read_json(cat_path, {"items": []}).get("items", [])
        ref = fs.collection("supplements").document(uid).collection("meta").document("catalog")
        meta = remote_meta(ref)
        new_hash = simple_hash(items)
        if meta.get("_content_hash") == new_hash:
            stats["skipped"] += 1
        else:
            batch_set(ref, {"items": items, "_content_hash": new_hash, "updated_at": server_ts})

    # Nutrition Catalog
    nutrition_items = _load_local_nutrition_catalog_items(data_dir)
    if nutrition_items:
        deleted_ids = _locally_deleted_meal_ids()
        nutrition_items = [it for it in nutrition_items if it.get("id") not in deleted_ids]

    if nutrition_items:
        ref = fs.collection("nutrition").document(uid).collection("meta").document("catalog")
        meta = remote_meta(ref)
        new_hash = simple_hash(nutrition_items)
        if meta.get("_content_hash") == new_hash:
            stats["skipped"] += 1
        else:
            batch_set(ref, {"items": nutrition_items, "_content_hash": new_hash, "updated_at": server_ts})
        logger.info(
            f"fuel-sync scope=catalog direction=push uid={uid} "
            f"path={_nutrition_catalog_path(data_dir)} result=ok count={len(nutrition_items)}"
        )

    if ops > 0:
        batch.commit()

    # Public Shared Micros Catalog
    try:
        push_micros_catalog(fs)
    except Exception as e:
        logger.error(f"Fehler beim Pushen des Micros Catalogs: {e}")

    return stats


def cli_push(uid: str | None = None, data_dir: Path | None = None) -> None:
    """Push: wenn uid=None → alle entdeckten UIDs aus ~/.aos/fuel/users/."""
    if uid:
        uids = [uid]
    else:
        uids = _discover_uids()
        if not uids:
            logger.warning(f"Keine UID-Verzeichnisse unter {FUEL_DATA_DIR / 'users'} gefunden.")
            return
        logger.info(f"Auto-Discovery: {len(uids)} UID(s) gefunden → {uids}")

    errors = []
    for u in uids:
        dd = data_dir or data_dir_for(u)
        logger.info(f"🚀 push uid={u} (dir={dd})")
        try:
            stats = push_uid_batched(u, dd)
            logger.success(f"  ✓ uid={u}: {stats['written']} writes, {stats['skipped']} skipped")
        except Exception as e:
            logger.error(f"  ✗ uid={u}: {e}")
            errors.append(f"{u}: {e}")
    if errors:
        raise RuntimeError("Firestore push failed: " + "; ".join(errors))


def cli_pull(uid: str | None = None, data_dir: Path | None = None) -> None:
    """Pull: wenn uid=None → alle entdeckten UIDs."""
    if uid:
        uids = [uid]
    else:
        uids = _discover_uids()
        if not uids:
            logger.warning("Keine UIDs lokal gefunden.")
            return

    errors = []
    for u in uids:
        dd = data_dir or data_dir_for(u)
        dates = set(collect_dates(dd))
        try:
            dates.update(collect_remote_dates(u))
        except Exception as e:
            logger.warning(f"Remote-Date-Discovery fehlgeschlagen für uid={u}: {e}")
            errors.append(f"{u} date discovery: {e}")
        dates = sorted(dates)
        logger.info(f"📥 pull uid={u}: {len(dates)} Tage")
        for d in dates:
            r = {}
            for name, fn in [
                ("nutrition", sync_nutrition),
                ("supplements", sync_supplements),
                ("journal", sync_journal),
            ]:
                try:
                    r[name] = fn(d, "pull", u, dd)
                except Exception as e:
                    r[name] = {"error": str(e)}
                    errors.append(f"{u} {d} {name}: {e}")
            logger.info(f"  → {d}: {r}")

        # Catalog pulls
        cat = {}
        for name, fn in [
            ("supplements_catalog", sync_supplements_catalog),
            ("nutrition_catalog", sync_nutrition_catalog),
        ]:
            try:
                cat[name] = fn("pull", u, dd)
            except Exception as e:
                cat[name] = {"error": str(e)}
                errors.append(f"{u} catalog {name}: {e}")
        logger.info(f"  → catalog: {cat}")
        logger.success(f"  ✓ pull uid={u} abgeschlossen")
    if errors:
        raise RuntimeError("Firestore pull failed: " + "; ".join(errors))
