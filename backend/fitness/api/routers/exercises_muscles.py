from __future__ import annotations

from fastapi import APIRouter, HTTPException

from fitness.api.config import logger
from fitness.anatomy import resolve as anatomy_resolve
from fitness.catalog import muscles_store
from fitness.catalog.core.muscles import iter_muscle_documents

router = APIRouter()


@router.get("/fitness/muscles")
async def muscles_list():
    try:
        muscles = []
        for mid in muscles_store.list_muscles():
            doc = muscles_store.load_muscle(mid) or {}
            muscles.append({
                "muscle_id": mid,
                "wger_id": doc.get("wger_id"),
                "latin": doc.get("label_lat", ""),
                "name_en": doc.get("label_en", ""),
                "has_anatomy": bool(doc.get("origin")),
            })
        return {"count": len(muscles), "muscles": muscles}
    except Exception as exc:
        logger.error(f"muscles_list: {exc}")
        raise HTTPException(502, detail=str(exc))


@router.get("/fitness/muscles/all")
def muscles_all():
    try:
        return {"ok": True, "muscles": [doc for _doc_id, doc in iter_muscle_documents()]}
    except Exception as exc:
        logger.error(f"muscles_all: {exc}")
        raise HTTPException(500, detail=str(exc))


@router.get("/fitness/muscles/viz")
def muscles_viz():
    try:
        from fitness.catalog.core.loader import load_catalog_yaml

        taxonomy = load_catalog_yaml("muscle_index.yml") or {}
        index_muscles = taxonomy.get("muscles", {}) if isinstance(taxonomy, dict) else {}

        wger: dict = {}
        for muscle_id, info in index_muscles.items():
            if not isinstance(info, dict):
                continue
            wger_id = info.get("wger_id")
            if wger_id:
                wger[muscle_id] = wger_id

        region_files = [
            data for _doc_id, data in iter_muscle_documents()
            if data.get("kb_level") == "region" and isinstance(data.get("muscles"), list)
        ]
        region_files.sort(key=lambda d: len(d["muscles"]))

        region: dict = {}
        region_labels: dict = {}
        for data in region_files:
            word = data.get("region") or data.get("doc_id") or data.get("id", "")
            if not word:
                continue
            region_labels.setdefault(word, data.get("label_de") or data.get("display_name") or word)
            for member in data["muscles"]:
                region.setdefault(member, word)

        body_muscles: dict = {}
        labels: dict = {}
        for _doc_id, data in iter_muscle_documents():
            if data.get("kb_level") != "muscle":
                continue
            muscle_id = data.get("id")
            if not muscle_id:
                continue
            viz = data.get("viz") or {}
            bm = viz.get("body_muscles")
            if bm and bm.get("ids"):
                body_muscles[muscle_id] = {"view": bm["view"], "ids": bm["ids"]}
            labels[muscle_id] = data.get("label_de") or data.get("display_name") or muscle_id
        body_muscles_slugs = {k: v["ids"][0] for k, v in body_muscles.items() if v.get("ids")}
        return {
            "wger": wger,
            "labels": labels,
            "region": region,
            "region_labels": region_labels,
            "body_muscles": body_muscles,
            "body_muscles_slugs": body_muscles_slugs,
        }
    except Exception as exc:
        logger.error(f"muscles_viz: {exc}")
        raise HTTPException(500, detail=str(exc))


@router.get("/fitness/muscles/{id}")
async def muscle_detail_anatomy(id: str):
    muscle_id = id if muscles_store.load_muscle(id) else anatomy_resolve.canonical_id(id)
    if muscle_id:
        doc = muscles_store.load_muscle(muscle_id)
        if doc:
            return doc
    raise HTTPException(404, detail="not_found")
