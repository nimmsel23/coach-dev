"""
Firestore Handler — anatomy-kb Enrichment → Firestore fitness-aos

Verantwortlich nur für anatomy-kb eigene Daten:
  muscles/*.yml       → fitness/kb/muscles/
  anatomy_teaching/   → fitness/kb/anatomy/
  catalog-index.json  → fitness/kb/index/catalog

Exercises-Sync: Nicht hier — das ist catalog/firestore_push.py

Endpoints:
  POST /api/firestore/sync               muscles + anatomy + index
  POST /api/firestore/sync/muscles       muscles/*.yml
  POST /api/firestore/sync/anatomy       anatomy_teaching/*.yml
  POST /api/firestore/sync/index         catalog-index.json
  GET  /api/firestore/status             letzter Sync-Status

?dry=1 für Dry-Run.
"""
from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

import yaml
from loguru import logger

from anatomy_kb.config import ANATOMY_KB_ROOT, ANATOMY_TEACHING

MUSCLES_DIR = ANATOMY_KB_ROOT / "muscles"
_last: dict = {}


def _get_db():
    # Das Paket firestore/ liegt in fitness-dev/fitness/ (Nachbar von catalog/). Hinten anhängen,
    # nicht vorne einfügen: fitness/http.py würde sonst das stdlib-Modul http überdecken.
    from anatomy_kb.config import CATALOG_DIR
    if CATALOG_DIR is not None:
        fitness_pkg = str(CATALOG_DIR.parent)
        if fitness_pkg not in sys.path:
            sys.path.append(fitness_pkg)
    from firestore.kb import get_db
    return get_db()


def _sync_muscles(db, dry_run: bool = False) -> dict:
    """anatomy-kb/muscles/*.yml → Firestore fitness/kb/muscles/

    Schreibt je Muskel zwei Dokumente:
      1. Nach canonical muscle_id (pectoralis_major)
      2. Nach rbh_slug (chest, chest-left, chest-right) für BodyMap-Lookups
    """
    from anatomy_kb.muscle_store import load_index
    from firestore.kb import batch_write

    index = load_index()
    col = db.collection("fitness").document("kb").collection("muscles")
    counts = {"ok": 0, "skip": 0, "error": 0}
    slug_docs: dict[str, dict] = {}

    # Pass 1: canonical muscle_id Dokumente + slug-Daten sammeln
    muscle_records = []
    for yml in sorted(MUSCLES_DIR.glob("*.yml")):
        try:
            doc = yaml.safe_load(yml.read_text(encoding="utf-8"))
        except Exception:
            counts["skip"] += 1
            continue
        if not isinstance(doc, dict) or not doc.get("origin"):
            counts["skip"] += 1
            continue

        muscle_id = doc.get("muscle_id", yml.stem)
        meta = index.get(muscle_id, {})
        sync_doc = {**doc}
        for field in ["rbh_slugs", "name_de", "name_en", "latin", "wger_id", "is_front"]:
            if field in meta and not sync_doc.get(field):
                sync_doc[field] = meta[field]

        muscle_records.append((muscle_id, sync_doc))

        # Slug-Dokumente aufbauen
        for slug in _expand_slugs(sync_doc.get("rbh_slugs") or []):
            if slug not in slug_docs:
                slug_docs[slug] = _make_slug_doc(slug, muscle_id, sync_doc)
            else:
                _merge_slug_doc(slug_docs[slug], muscle_id, sync_doc)

    r = batch_write(db, col, iter(muscle_records), dry_run=dry_run, use_hash=False)
    counts["ok"] += r["ok"]
    counts["error"] += r["error"]

    # Pass 2: slug-basierte Dokumente
    r2 = batch_write(db, col, slug_docs.items(), dry_run=dry_run, use_hash=False)
    counts["ok"] += r2["ok"]
    counts["error"] += r2["error"]

    return counts


def _expand_slugs(base_slugs: list[str]) -> list[str]:
    result = []
    for s in base_slugs:
        result += [s, f"{s}-left", f"{s}-right"]
    return result


def _make_slug_doc(slug: str, muscle_id: str, doc: dict) -> dict:
    display = (doc.get("name_de") or doc.get("name_en")
               or slug.replace("-left", "").replace("-right", "").replace("-", " ").title())
    return {
        "display_name": display,
        "name_de": doc.get("name_de"),
        "name_en": doc.get("name_en"),
        "latin_name": doc.get("latin"),
        "origin": doc.get("origin"),
        "insertion": doc.get("insertion"),
        "innervation": doc.get("innervation"),
        "function": doc.get("function"),
        "is_slug_group": True,
        "muscles": [muscle_id],
    }


def _merge_slug_doc(existing: dict, muscle_id: str, doc: dict) -> None:
    if muscle_id not in existing["muscles"]:
        existing["muscles"].append(muscle_id)
    for field in ["origin", "insertion", "innervation", "function"]:
        if doc.get(field) and doc[field] not in (existing.get(field) or ""):
            existing[field] = f"{existing.get(field) or ''}\n\n---\n\n{doc[field]}"
    for field in ["name_de", "name_en"]:
        val = doc.get(field)
        if val and val not in (existing.get(field) or ""):
            existing[field] = f"{existing.get(field) or ''} / {val}".strip(" / ")
    if doc.get("latin") and doc["latin"] not in (existing.get("latin_name") or ""):
        existing["latin_name"] = f"{existing.get('latin_name') or ''} / {doc['latin']}".strip(" / ")


def _sync_anatomy(db, dry_run: bool = False) -> dict:
    """catalog/kb/anatomy_teaching/*.yml → Firestore fitness/kb/anatomy/{exercise_id}"""
    from firestore.kb import batch_write

    col = db.collection("fitness").document("kb").collection("anatomy")

    def _records():
        for yml in sorted([*ANATOMY_TEACHING.glob("*.yml"), *ANATOMY_TEACHING.glob("*.yaml")]):
            try:
                doc = yaml.safe_load(yml.read_text(encoding="utf-8"))
            except Exception:
                continue
            if not isinstance(doc, dict):
                continue
            lessons = doc.get("lessons") or ([doc] if "exercise_id" in doc else [])
            for lesson in lessons:
                ex_id = str(lesson.get("exercise_id") or "")
                if ex_id:
                    yield ex_id, lesson

    return batch_write(db, col, _records(), dry_run=dry_run, use_hash=False)


def _sync_index(db, dry_run: bool = False) -> dict:
    """catalog-index.json → Firestore fitness/kb/index/catalog"""
    index_file = ANATOMY_KB_ROOT / "catalog-index.json"
    counts = {"ok": 0, "skip": 0, "error": 0}
    if not index_file.exists():
        logger.error(f"Index-Datei nicht gefunden: {index_file}")
        counts["error"] += 1
        return counts
    try:
        data = json.loads(index_file.read_text(encoding="utf-8"))
        col = db.collection("fitness").document("kb").collection("index")
        if dry_run:
            logger.info(f"[dry] index/catalog (v{data.get('version')})")
        else:
            col.document("catalog").set(data)
            logger.info(f"index/catalog (v{data.get('version')})")
        counts["ok"] += 1
    except Exception as exc:
        logger.error(f"index/catalog: {exc}")
        counts["error"] += 1
    return counts


def _run_sync(dry_run: bool = False) -> dict:
    db = _get_db()
    return {
        "muscles": _sync_muscles(db, dry_run),
        "anatomy": _sync_anatomy(db, dry_run),
        "index":   _sync_index(db, dry_run),
    }


# End of file - web handlers removed in favor of FastAPI server.py

