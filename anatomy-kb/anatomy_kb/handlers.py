"""
HTTP-Handler für die anatomy-kb Knowledge API.

Jeder Handler ist zustandslos:
  request → catalog function → JSON response

catalog wird via server.py injiziert (kein direkter Import hier),
damit die Handler auch ohne laufenden Server testbar bleiben.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from aiohttp import web

if TYPE_CHECKING:
    from catalog import coverage as cov_module
    from catalog import planner as plan_module
    from catalog import resolver as res_module
    from catalog import teaching as teach_module


def ok(data) -> web.Response:
    return web.Response(
        text=json.dumps(data, ensure_ascii=False, indent=2),
        content_type="application/json",
    )


def err(msg: str, status: int = 400) -> web.Response:
    return web.Response(
        text=json.dumps({"error": msg}, ensure_ascii=False),
        content_type="application/json",
        status=status,
    )


# Handler-Funktionen werden via functools.partial mit den Modulen gebunden
# (siehe server.py: app["modules"] = {...})

def _modules(request: web.Request) -> dict:
    return request.app["modules"]


async def health(request: web.Request) -> web.Response:
    m = _modules(request)
    exercises = m["resolver"].build_exercise_index()
    lessons = m["teaching"].load_all_lessons()
    return ok({
        "status": "ok",
        "runtime_root": str(m["runtime_root"]()),
        "exercises": len(exercises),
        "anatomy_lessons": len(lessons),
    })


async def exercises(request: web.Request) -> web.Response:
    """Alle Übungen als kompakte Liste."""
    records = _modules(request)["resolver"].build_exercise_index()
    return ok([
        {
            "exercise_id": r.exercise_id,
            "display_name": r.display_name,
            "german": r.german,
            "movement_pattern": r.movement_pattern,
            "equipment": r.equipment or [],
            "primary_muscles": r.primary_muscles or [],
            "tags": r.tags or [],
        }
        for r in records
    ])


async def exercise(request: web.Request) -> web.Response:
    """Vollständige Exercise-Daten via Resolver."""
    res = _modules(request)["resolver"]
    exercise_id = request.match_info["id"]
    result = res.resolve_query(exercise_id)
    if not result.matched:
        return err(f"Übung nicht gefunden: {exercise_id}", 404)

    records = res.build_exercise_index()
    record = res.find_by_id(result.canonical_id, records)
    if record is None:
        return err(f"Übung nicht gefunden: {exercise_id}", 404)

    return ok({
        "exercise_id": record.exercise_id,
        "display_name": record.display_name,
        "german": record.german,
        "movement_pattern": record.movement_pattern,
        "equipment": record.equipment or [],
        "primary_muscles": record.primary_muscles or [],
        "secondary_muscles": record.secondary_muscles or [],
        "stabilizers": record.stabilizers or [],
        "variations": record.variations or [],
        "coaching_notes": record.coaching_notes or [],
        "common_errors": record.common_errors or [],
        "tags": record.tags or [],
        "wger_muscle_ids": record.wger_muscle_ids or {},
    })


async def teaching(request: web.Request) -> web.Response:
    """Anatomy-Lesson. ?mode=trainer|client"""
    teach = _modules(request)["teaching"]
    exercise_id = request.match_info["id"]
    mode = request.rel_url.query.get("mode", "trainer")
    if mode not in ("trainer", "client"):
        return err("mode muss trainer oder client sein")

    lesson = teach.find_lesson(exercise_id)
    if lesson is None:
        return err(f"Keine Anatomy-Lesson für: {exercise_id}", 404)

    return ok({
        "exercise_id": exercise_id,
        "mode": mode,
        "lesson": lesson,
        "markdown": teach.teach_exercise(exercise_id, mode=mode),
    })


async def coverage(request: web.Request) -> web.Response:
    """Coverage + BodyMap-Regions. ?sets=3&rpe=7"""
    cov = _modules(request)["coverage"]
    exercise_id = request.match_info["id"]
    try:
        sets = int(request.rel_url.query.get("sets", "3"))
        rpe = int(request.rel_url.query.get("rpe", "7"))
    except ValueError:
        return err("sets und rpe müssen Zahlen sein")

    try:
        return ok(cov.calculate_coverage(exercise_id, sets=sets, rpe=rpe))
    except ValueError as e:
        return err(str(e), 404)


async def bodymap(request: web.Request) -> web.Response:
    """Nur BodyMap-Regions für React BodyMap.jsx.

    primary/secondary/light — BodyMap.jsx braucht keine eigene Muskellogik.
    """
    cov = _modules(request)["coverage"]
    exercise_id = request.match_info["id"]
    try:
        result = cov.calculate_coverage(exercise_id, sets=3, rpe=7)
    except ValueError as e:
        return err(str(e), 404)

    regions = result.get("body_region_scores", {})
    primary, secondary, light = [], [], []
    for region, score in regions.items():
        if score >= 0.7:
            primary.append(region)
        elif score >= 0.3:
            secondary.append(region)
        else:
            light.append(region)

    return ok({"exercise_id": exercise_id, "primary": primary, "secondary": secondary, "light": light})


async def resolve(request: web.Request) -> web.Response:
    """Alias- und Fuzzy-Resolver. ?q=kh+schraegbank"""
    query = request.rel_url.query.get("q", "").strip()
    if not query:
        return err("Parameter q fehlt")

    result = _modules(request)["resolver"].resolve_query(query)
    return ok({
        "query": result.query,
        "matched": result.matched,
        "canonical_id": result.canonical_id,
        "display_name": result.display_name,
        "source": result.source,
        "confidence": result.confidence,
        "suggestions": result.suggestions,
    })


async def plan_generate(request: web.Request) -> web.Response:
    """Plan generieren. Body: {template, split, day, goal}"""
    try:
        body = await request.json()
    except Exception:
        body = {}

    try:
        result = _modules(request)["planner"].build_plan(
            template=body.get("template"),
            split=body.get("split"),
            day=body.get("day"),
            goal=body.get("goal"),
        )
    except Exception as e:
        return err(str(e))

    return ok({
        "template": result.template_name,
        "slots": result.slots,
        "coverage_summary": result.coverage_summary,
        "notes": result.notes,
    })
