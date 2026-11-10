from __future__ import annotations

import dataclasses

from fastapi import APIRouter, HTTPException, Request

from fitness.api.config import _get_index, _record_to_dict, _wger_get
from fitness.catalog.agent.inbox_actions import _git_commit_paths, _rebuild_runtime_catalog
from fitness.catalog.agent.teaching import find_lesson
from fitness.catalog.core.resolver import find_by_id, resolve_query

from .exercise_store import save_exercise_document

router = APIRouter()


@router.get("/exercises/search")
async def exercises_search(request: Request, q: str = "", limit: int = 12):
    limit = min(limit, 50)
    if len(q) < 1:
        return {"ok": True, "results": [], "total": 0}

    idx = _get_index()
    results = []
    qn = q.lower()
    for ex in idx:
        fields = [
            ex.exercise_id or "",
            ex.display_name or "",
            ex.german or "",
            *(ex.aliases or []),
            *(getattr(ex, "search_aliases", None) or []),
            *(ex.tags or []),
        ]
        if any(qn in f.lower() for f in fields if f):
            row = {
                "exercise_id": ex.exercise_id,
                "display_name": ex.display_name or ex.exercise_id,
                "primary_muscles": ex.primary_muscles or [],
                "secondary_muscles": ex.secondary_muscles or [],
                "source": "expert" if "expert" in (ex.tags or []) else "local",
                "yuhonas_id": getattr(ex, "yuhonas_id", None),
            }
            results.append(row)

    if results:
        return {"ok": True, "results": results[:limit], "total": len(results)}

    if len(q) >= 2:
        data = await _wger_get("/exerciseinfo/", f"limit={limit}&name__search={q}&language=2")
        results = []
        for e in data.get("results") or []:
            trans = next((t for t in e.get("translations", []) if t.get("language") == 2), {})
            name = trans.get("name") or e.get("name") or ""
            if not name:
                continue
            results.append({
                "exercise_id": e.get("uuid") or str(e.get("id")),
                "display_name": name,
                "category": (e.get("category") or {}).get("name", ""),
                "primaryMuscles": [(m.get("name_en") or m.get("name", "")) for m in (e.get("muscles") or []) if m.get("name_en") or m.get("name")],
                "secondaryMuscles": [(m.get("name_en") or m.get("name", "")) for m in (e.get("muscles_secondary") or []) if m.get("name_en") or m.get("name")],
                "source": "wger",
            })
        return {"ok": True, "results": results, "total": len(results)}

    return {"ok": True, "results": []}


@router.get("/fitness/search")
async def fitness_search(request: Request, q: str = "", limit: int = 12, sources: str = "wger,yuhonas"):
    return await exercises_search(request, q, limit)


@router.get("/exercises/by-group")
async def exercises_by_group(group: str = ""):
    if not group:
        return {"ok": True, "exercises": []}

    normalized = group.lower().replace(" ", "_")
    idx = _get_index()
    local = []
    for ex in idx:
        primary = [str(x).lower() for x in (ex.primary_muscles or [])]
        secondary = [str(x).lower() for x in (ex.secondary_muscles or [])]
        tags = [str(x).lower() for x in (ex.tags or [])]
        haystack = primary + secondary + tags + [str(ex.category or "").lower()]
        if group.lower() in haystack or normalized in haystack:
            local.append({
                "id": ex.exercise_id,
                "name_en": ex.display_name or ex.exercise_id,
                "relevance": "primary",
            })

    if local:
        return {"ok": True, "exercises": local}

    data = await _wger_get("/exerciseinfo/", f"limit=20&muscles__name_en__icontains={group}&language=2")
    exercises = []
    for e in data.get("results") or []:
        trans = next((t for t in e.get("translations", []) if t.get("language") == 2), {})
        name = trans.get("name") or e.get("name") or ""
        if name:
            exercises.append({
                "id": e.get("uuid") or str(e.get("id")),
                "name_en": name,
                "relevance": "primary",
                "source": "wger",
            })
    return {"ok": True, "exercises": exercises}


@router.get("/fitness/exercises/all")
def exercises_all():
    idx = _get_index()
    return {"ok": True, "exercises": [_record_to_dict(r) for r in idx]}


@router.post("/fitness/exercises/{id}")
async def exercise_save(id: str, request: Request):
    body = await request.json()
    exercise_id = body.get("exercise_id") or body.get("id") or id
    saved_path = save_exercise_document(exercise_id, body)
    _git_commit_paths([saved_path], f"chore(catalog): update exercise {exercise_id} via coach sheet")
    _rebuild_runtime_catalog()
    return {"ok": True, "id": exercise_id}


@router.get("/fitness/resolve")
def fitness_resolve(q: str = ""):
    if not q:
        return {"ok": False, "error": "missing q"}
    result = resolve_query(q)
    data = dataclasses.asdict(result) if hasattr(result, "canonical_id") else dict(result)
    if getattr(result, "canonical_id", None):
        rec = find_by_id(result.canonical_id, _get_index())
        if rec:
            data["exercise"] = _record_to_dict(rec)
            data["lesson"] = find_lesson(result.canonical_id)
    return data


@router.get("/exercise/{id}")
def exercise_detail(id: str):
    ex = find_by_id(id, _get_index())
    if not ex:
        raise HTTPException(404, detail="not_found")
    result = _record_to_dict(ex)
    result["lesson"] = find_lesson(id)
    return {"ok": True, "exercise": result}
