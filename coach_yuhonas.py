"""Yuhonas free-exercise-db search + detail for Schmiede (:9150)."""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse

from coach_local_plans import local_only

ROOT = Path(__file__).resolve().parent
DEFAULT_YUHONAS = ROOT / "fitness/catalog/kb/vendor/free-exercise-db"
IMG_CDN = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises"


def yuhonas_root() -> Path:
    return Path(os.getenv("YUHONAS_ROOT", str(DEFAULT_YUHONAS)))


@lru_cache(maxsize=1)
def _load_exercises() -> tuple[tuple[dict[str, Any], ...], float]:
    path = yuhonas_root() / "dist" / "exercises.json"
    if not path.is_file():
        raise FileNotFoundError(f"yuhonas exercises.json fehlt: {path}")
    mtime = path.stat().st_mtime
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("yuhonas exercises.json ist kein Array")
    return tuple(data), mtime


def load_exercises() -> list[dict[str, Any]]:
    path = yuhonas_root() / "dist" / "exercises.json"
    cached, mtime = _load_exercises()
    if path.is_file() and path.stat().st_mtime != mtime:
        _load_exercises.cache_clear()
        cached, _ = _load_exercises()
    return list(cached)


def image_urls(ex: dict[str, Any]) -> list[str]:
    images = ex.get("images") or []
    out = []
    root = yuhonas_root()
    for rel in images:
        local = root / "exercises" / rel
        if local.is_file():
            out.append(f"/yuhonas/image/{rel}")
        else:
            out.append(f"{IMG_CDN}/{rel}")
    return out


def summarize(ex: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": ex.get("id"),
        "name": ex.get("name"),
        "level": ex.get("level"),
        "force": ex.get("force"),
        "mechanic": ex.get("mechanic"),
        "equipment": ex.get("equipment"),
        "category": ex.get("category"),
        "primaryMuscles": ex.get("primaryMuscles") or [],
        "secondaryMuscles": ex.get("secondaryMuscles") or [],
        "images": image_urls(ex),
        "source": "yuhonas",
        "yuhonas_id": ex.get("id"),
        "exercise_id": f"yuhonas_{str(ex.get('id') or '').lower()}",
    }


def create_router() -> APIRouter:
    router = APIRouter(tags=["yuhonas"])

    @router.get("/yuhonas/meta")
    def meta(request: Request):
        local_only(request)
        items = load_exercises()
        muscles = sorted({m for ex in items for m in (ex.get("primaryMuscles") or [])})
        equipment = sorted({e for ex in items if (e := ex.get("equipment"))})
        levels = sorted({lv for ex in items if (lv := ex.get("level"))})
        categories = sorted({c for ex in items if (c := ex.get("category"))})
        return {
            "ok": True,
            "count": len(items),
            "muscles": muscles,
            "equipment": equipment,
            "levels": levels,
            "categories": categories,
        }

    @router.get("/yuhonas/search")
    def search(
        request: Request,
        q: str = "",
        muscle: str = "",
        equipment: str = "",
        level: str = "",
        category: str = "",
        limit: int = Query(40, ge=1, le=200),
        offset: int = Query(0, ge=0),
    ):
        local_only(request)
        query = q.strip().lower()
        muscle_q = muscle.strip().lower()
        equip_q = equipment.strip().lower()
        level_q = level.strip().lower()
        cat_q = category.strip().lower()
        hits: list[dict[str, Any]] = []
        for ex in load_exercises():
            name = str(ex.get("name") or "")
            if query and query not in name.lower() and query not in str(ex.get("id") or "").lower():
                continue
            prim = [str(m).lower() for m in (ex.get("primaryMuscles") or [])]
            sec = [str(m).lower() for m in (ex.get("secondaryMuscles") or [])]
            if muscle_q and muscle_q not in prim and muscle_q not in sec:
                continue
            if equip_q and equip_q not in str(ex.get("equipment") or "").lower():
                continue
            if level_q and level_q != str(ex.get("level") or "").lower():
                continue
            if cat_q and cat_q != str(ex.get("category") or "").lower():
                continue
            hits.append(summarize(ex))
        total = len(hits)
        page = hits[offset : offset + limit]
        return {"ok": True, "total": total, "results": page}

    @router.get("/yuhonas/exercise/{exercise_id}")
    def detail(exercise_id: str, request: Request):
        local_only(request)
        for ex in load_exercises():
            if str(ex.get("id")) == exercise_id:
                body = summarize(ex)
                body["instructions"] = ex.get("instructions") or []
                return {"ok": True, "exercise": body}
        raise HTTPException(404, f"yuhonas exercise not found: {exercise_id}")

    @router.get("/yuhonas/image/{path:path}")
    def image(path: str, request: Request):
        local_only(request)
        # path like "3_4_Sit-Up/0.jpg"
        target = (yuhonas_root() / "exercises" / path).resolve()
        root = (yuhonas_root() / "exercises").resolve()
        if not str(target).startswith(str(root)) or not target.is_file():
            raise HTTPException(404, "image not found")
        return FileResponse(target)

    return router
