from __future__ import annotations

import json
import os
from dataclasses import asdict
from pathlib import Path
from typing import Any

from aiohttp import web

from .resolver import build_exercise_index, resolve_query, find_by_id
from .loader import load_catalog_yaml, load_runtime_yaml
from loguru import logger
from .paths import DATA_DIR, REPO_ROOT, runtime_root
from .teaching import load_all_lessons, find_lesson
from .planner import build_plan
from .weekly import build_weekly_coverage, resolve_week_selector
from .history import read_history_range
from .obsidian import export_coach_sheet_note, export_teach_note, export_plan_note, export_weekly_report_note
from .yaml_utils import load_yaml


async def handle_index(request: web.Request) -> web.Response:
    return web.json_response({
        "name": "Fitness Agent Exercise KB Server",
        "version": "0.1.0",
        "endpoints": [
            "/exercises",
            "/exercise/{id}",
            "/resolve?q=...",
            "/muscles",
            "/taxonomy",
            "/snapshot",
            "/plan",
            "/weekly?week=...",
            "/export/{kind}",
            "/inbox",
            "/inbox/{id}/approve",
            "/inbox/{id}/delete"
        ]
    })


async def handle_exercises(request: web.Request) -> web.Response:
    records = build_exercise_index()
    return web.json_response([asdict(r) for r in records])


async def handle_exercise_detail(request: web.Request) -> web.Response:
    exercise_id = request.match_info.get("id")
    if not exercise_id:
        return web.json_response({"error": "Missing exercise ID"}, status=400)
    
    records = build_exercise_index()
    record = find_by_id(exercise_id, records)
    
    if not record:
        return web.json_response({"error": f"Exercise {exercise_id} not found"}, status=404)
    
    lesson = find_lesson(exercise_id)
    result = asdict(record)
    result["lesson"] = lesson
    
    return web.json_response(result)


async def handle_search(request: web.Request) -> web.Response:
    query = request.query.get("q", "").strip()
    limit = int(request.query.get("limit", 15))
    sources_param = request.query.get("sources", "wger,yuhonas")
    active_sources = {s.strip() for s in sources_param.split(",")}
    if not query:
        return web.json_response({"ok": True, "results": [], "query": query})

    def source_allowed(rec) -> bool:
        tags = set(rec.tags or [])
        if "wger" in tags or "unreviewed" in tags:
            return "wger" in active_sources
        if "yuhonas" in tags:
            return "yuhonas" in active_sources
        return "coach" in active_sources

    records = [r for r in build_exercise_index() if source_allowed(r)]
    qn = query.lower()
    q_tokens = qn.split()

    def score(rec) -> int:
        fields = [
            rec.exercise_id or "",
            rec.display_name or "",
            rec.german or "",
            *(rec.aliases or []),
            *(rec.tags or []),
        ]
        hay = [f.lower() for f in fields if f]
        if any(h == qn for h in hay):               return 100
        if any(h.startswith(qn) for h in hay):      return 80
        if any(qn in h for h in hay):               return 60
        if len(q_tokens) > 1 and all(any(t in h for h in hay) for t in q_tokens): return 50
        if any(any(t in h for h in hay) for t in q_tokens): return 20
        return 0

    scored = sorted(
        ((s, r) for r in records if (s := score(r)) > 0),
        key=lambda x: (-x[0], x[1].exercise_id),
    )[:limit]

    results = []
    for _, rec in scored:
        d = asdict(rec)
        d["lesson"] = find_lesson(rec.exercise_id)
        results.append(d)

    return web.json_response({"ok": True, "query": query, "results": results})


async def handle_resolve(request: web.Request) -> web.Response:
    query = request.query.get("q", "")
    if not query:
        return web.json_response({"error": "Missing query parameter 'q'"}, status=400)
    
    result = resolve_query(query)
    data = asdict(result)
    
    if result.matched and result.canonical_id:
        record = find_by_id(result.canonical_id, build_exercise_index())
        if record:
            data["exercise"] = asdict(record)
            data["lesson"] = find_lesson(result.canonical_id)
            
    return web.json_response(data)


async def handle_muscles(request: web.Request) -> web.Response:
    try:
        muscles = load_catalog_yaml("muscles/muscle_index.yml")
        return web.json_response(muscles)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_muscles_viz(request: web.Request) -> web.Response:
    try:
        rbh: dict = {}
        body_muscles: dict = {}

        muscles_dir = DATA_DIR / "muscles"

        # Individual muscle YAMLs in region subfolders
        for yml in sorted(muscles_dir.glob("*/*.yml")):
            data = load_yaml(yml)
            if not data:
                continue
            muscle_id = data.get("id")
            viz = data.get("viz")
            if not viz or not muscle_id:
                continue
            rbh_slug = viz.get("rbh")
            bm = viz.get("body_muscles")
            keys = [muscle_id] + [a.lower() for a in (data.get("aliases") or [])]
            for k in keys:
                if rbh_slug:
                    rbh[k] = rbh_slug
                if bm and bm.get("ids"):
                    body_muscles[k] = {"view": bm["view"], "ids": bm["ids"]}

        # Multi-muscle group aliases from _groups.yml
        groups_file = muscles_dir / "_groups.yml"
        if groups_file.exists():
            groups_data = load_yaml(groups_file)
            for _name, g in (groups_data.get("groups") or {}).items():
                viz = g.get("viz") or {}
                rbh_slug = viz.get("rbh")
                bm = viz.get("body_muscles")
                keys = [a.lower() for a in (g.get("aliases") or [])]
                for k in keys:
                    if rbh_slug:
                        rbh[k] = rbh_slug
                    if bm and bm.get("ids"):
                        body_muscles[k] = {"view": bm["view"], "ids": bm["ids"]}

        body_muscles_slugs = {k: v["ids"][0] for k, v in body_muscles.items() if v.get("ids")}

        return web.json_response({
            "rbh": rbh,
            "body_muscles": body_muscles,
            "body_muscles_slugs": body_muscles_slugs,
        })
    except Exception as e:
        logger.error(f"handle_muscles_viz: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def handle_taxonomy(request: web.Request) -> web.Response:
    try:
        taxonomy = load_catalog_yaml("muscles/muscle_index.yml")
        rules = load_catalog_yaml("rules/muscle_coverage_rules.yml")
        return web.json_response({
            "muscles": taxonomy,
            "rules": rules,
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


def unwrap(section: Any) -> Any:
    if isinstance(section, dict) and len(section) == 1:
        only = next(iter(section.values()))
        if isinstance(only, dict):
            return only
    return section


async def handle_snapshot(request: web.Request) -> web.Response:
    try:
        snapshot = {
            "config": load_runtime_yaml("config.yml"),
            "aliases": load_runtime_yaml("maps/aliases.yml"),
            "program_rules": unwrap(load_runtime_yaml("rules/program_rules.yml")),
            "progression_rules": unwrap(load_runtime_yaml("rules/progression_rules.yml")),
            "safety_rules": unwrap(load_runtime_yaml("rules/safety_rules.yml")),
            "muscles": unwrap(load_runtime_yaml("muscles/muscle_index.yml")),
            "muscle_coverage_rules": unwrap(load_runtime_yaml("rules/muscle_coverage_rules.yml")),
            "wger_catalog_index": unwrap(load_runtime_yaml("registry/wger_catalog_index.yml")),
            "wger_mapping": unwrap(load_runtime_yaml("maps/wger_mapping.yml")),
            "external_db_mapping": unwrap(load_runtime_yaml("maps/external_db_mapping.yml")),
            "exercises": [asdict(r) for r in build_exercise_index()],
            "lessons": load_all_lessons(),
        }
        return web.json_response(snapshot)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_plan(request: web.Request) -> web.Response:
    try:
        if request.method == "POST":
            data = await request.json()
        else:
            data = request.query
            
        plan = build_plan(
            template=data.get("template"),
            split=data.get("split"),
            day=data.get("day"),
            goal=data.get("goal")
        )
        return web.json_response(asdict(plan))
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_coverage_detailed(request: web.Request) -> web.Response:
    """Detaillierte Coverage-Berechnung: sets × role_weight × effort_factor pro Muskelgruppe.

    Im Gegensatz zum JS-Layer: nutzt KB für granulare Muskeln + Stabilizers,
    wertet sets und session-RPE aus statt nur Hit-Count.
    """
    from .coverage import (
        ROLE_WEIGHTS, load_coverage_rules, load_muscle_taxonomy,
        load_muscle_region_index, add_role_scores, build_muscle_alias_map,
        muscle_regions, effort_factor_for_rpe,
    )
    from collections import defaultdict
    from datetime import date, timedelta

    days = max(1, min(365, int(request.query.get("days", 7))))
    rules = load_coverage_rules()
    taxonomy = load_muscle_taxonomy()
    region_index = load_muscle_region_index()
    alias_map = build_muscle_alias_map(taxonomy)

    # KB-Index für exercise_id → (primary, secondary, stabilizers)
    kb_index: dict[str, dict] = {}
    for ex in build_exercise_index():
        kb_index[ex.exercise_id] = {
            "primary":    ex.primary_muscles or [],
            "secondary":  ex.secondary_muscles or [],
            "stabilizer": ex.stabilizers or [],
        }

    sessions_dir = runtime_root() / "sessions"
    today = date.today()
    cutoff = today - timedelta(days=days - 1)

    region_scores: dict[str, float] = defaultdict(float)
    muscle_scores: dict[str, float] = defaultdict(float)
    per_day: list[dict] = []
    sessions_found = 0

    for i in range(days):
        d = cutoff + timedelta(days=i)
        f = sessions_dir / f"{d}.json"
        if not f.exists():
            continue
        try:
            session = json.loads(f.read_text())
        except Exception:
            continue

        sessions_found += 1
        rpe = session.get("effort") or 7
        try:
            rpe = int(rpe)
        except (TypeError, ValueError):
            rpe = 7
        ef = effort_factor_for_rpe(rpe, rules)

        day_scores: dict[str, float] = defaultdict(float)

        for ex in session.get("exercises") or []:
            if not ex.get("done", True):
                continue

            raw_sets = ex.get("sets", "")
            try:
                n_sets = max(1, int(str(raw_sets).strip()))
            except (ValueError, TypeError):
                n_sets = 1  # HIT oder leer → 1 Set

            ex_id = ex.get("exercise_id") or ""
            kb = kb_index.get(ex_id)

            if kb:
                primary    = kb["primary"]
                secondary  = kb["secondary"]
                stabilizer = kb["stabilizer"]
            else:
                # Fallback: Session-Daten (bereits normalisiert auf Gruppen-Ebene)
                primary    = ex.get("primaryMuscles") or []
                secondary  = ex.get("secondaryMuscles") or []
                stabilizer = []

            add_role_scores(muscle_scores, primary,    n_sets, ROLE_WEIGHTS["primary"],    ef, alias_map)
            add_role_scores(muscle_scores, secondary,  n_sets, ROLE_WEIGHTS["secondary"],  ef, alias_map)
            add_role_scores(muscle_scores, stabilizer, n_sets, ROLE_WEIGHTS["stabilizer"], ef, alias_map)
            add_role_scores(day_scores,    primary,    n_sets, ROLE_WEIGHTS["primary"],    ef, alias_map)
            add_role_scores(day_scores,    secondary,  n_sets, ROLE_WEIGHTS["secondary"],  ef, alias_map)
            add_role_scores(day_scores,    stabilizer, n_sets, ROLE_WEIGHTS["stabilizer"], ef, alias_map)

        # Muskel-IDs → Körperregionen
        day_regions: dict[str, float] = defaultdict(float)
        for m, score in day_scores.items():
            for region in (muscle_regions(m, region_index) or [m]):
                region_scores[region] += score
                day_regions[region]   += score

        per_day.append({
            "date":           str(d),
            "rpe":            rpe,
            "effort_factor":  ef,
            "region_scores":  dict(sorted(day_regions.items())),
        })

    GROUP_ORDER = ["chest", "back", "shoulders", "arms", "core", "glutes", "quads", "hamstrings", "calves"]
    groups = [
        {"id": g, "score": round(region_scores.get(g, 0.0), 2)}
        for g in GROUP_ORDER
    ]

    return web.json_response({
        "ok":             True,
        "days":           days,
        "sessions_found": sessions_found,
        "groups":         groups,
        "muscle_scores":  {k: round(v, 3) for k, v in sorted(muscle_scores.items())},
        "per_day":        per_day,
    })


async def handle_weekly(request: web.Request) -> web.Response:
    try:
        week_selector = request.query.get("week", "current")
        week = build_weekly_coverage(week_selector)
        bounds = resolve_week_selector(week_selector)
        entries = read_history_range(bounds["date_from"], bounds["date_to"])
        
        return web.json_response({
            **week,
            "week_selector": week_selector,
            "bounds": bounds,
            "entries": entries
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_export(request: web.Request) -> web.Response:
    try:
        kind = request.match_info.get("kind")
        data = await request.json()
        force = bool(data.get("force"))
        
        result = None
        if kind == 'exercise_sheet':
            query = data.get('query')
            if not query: return web.json_response({"error": "Missing 'query'"}, status=400)
            result = export_coach_sheet_note(query, force=force)
        elif kind == 'exercise_lesson':
            ex_id = data.get('exercise_id')
            if not ex_id: return web.json_response({"error": "Missing 'exercise_id'"}, status=400)
            result = export_teach_note(ex_id, mode=data.get('mode', 'trainer'), force=force)
        elif kind == 'plan':
            plan = data.get('plan')
            if not plan: return web.json_response({"error": "Missing 'plan'"}, status=400)
            result = export_plan_note(plan, force=force)
        elif kind == 'weekly':
            _, result = export_weekly_report_note(data.get('week_selector', 'current'), force=force)
        else:
            return web.json_response({"error": f"Unknown export kind: {kind}"}, status=400)
            
        return web.json_response({
            'path': str(result.path),
            'used_fallback_name': bool(getattr(result, 'used_fallback_name', False)),
            'overwritten': bool(getattr(result, 'overwritten', False)),
            'warning': getattr(result, 'warning', None),
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_inbox_queue(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "invalid_json"}, status=400)

    name = body.get("name", "").strip()
    if not name:
        return web.json_response({"ok": False, "error": "missing_name"}, status=400)

    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in name.lower())
    inbox_dir = runtime_root() / "users" / "default" / "inbox"
    inbox_dir.mkdir(parents=True, exist_ok=True)
    dest = inbox_dir / f"{safe_name}.json"
    dest.write_text(json.dumps({"name": name, "source": "new"}, ensure_ascii=False))
    logger.info(f"Queued for enrichment: {name} → {dest}")
    return web.json_response({"ok": True})


async def handle_inbox_list(request: web.Request) -> web.Response:
    exercises_dir = DATA_DIR / "exercises"
    if not exercises_dir.exists():
        return web.json_response({"ok": True, "exercises": []})
    
    files = [f for f in exercises_dir.glob("inbox_*.yml")]
    exercises = []
    for f in files:
        try:
            doc = load_yaml(f)
            exercises.append({
                "file_id": f.stem,
                **doc
            })
        except Exception:
            continue
            
    return web.json_response({"ok": True, "exercises": exercises})


async def handle_inbox_approve(request: web.Request) -> web.Response:
    file_id = request.match_info.get("id")
    exercises_dir = DATA_DIR / "exercises"
    old_path = exercises_dir / f"{file_id}.yml"
    
    if not old_path.exists():
        return web.json_response({"ok": False, "error": "not_found"}, status=404)
        
    try:
        # 1. Load Inbox Data
        doc = load_yaml(old_path)
        if not isinstance(doc, dict) or "exercises" not in doc:
            return web.json_response({"ok": False, "error": "invalid_inbox_format"}, status=400)
            
        exercises = doc["exercises"]
        if not exercises:
            return web.json_response({"ok": False, "error": "no_exercises_in_inbox"}, status=400)
            
        # We process the first exercise for now
        ex = exercises[0]
        ex_id = ex.get("exercise_id") or ex.get("id")
        if not ex_id:
            return web.json_response({"ok": False, "error": "missing_exercise_id"}, status=400)
            
        # Remove inbox_ prefix from ID if present in the data
        if ex_id.startswith("inbox_"):
            ex_id = ex_id.replace("inbox_", "")
            ex["exercise_id"] = ex_id
            ex["id"] = ex_id

        category = ex.get("category", "unassigned")
        category_path = exercises_dir / f"{category}.yml"
        
        # 2. Resolve Muscle IDs for Index
        from .coverage import load_muscle_taxonomy, normalize_muscle_id
        taxonomy = load_muscle_taxonomy()
        
        def get_wger_ids(muscles_list: Any) -> list[int]:
            if not isinstance(muscles_list, list): return []
            res = []
            for m in muscles_list:
                norm = normalize_muscle_id(str(m))
                m_data = taxonomy.get(norm)
                if m_data and "wger_id" in m_data:
                    res.append(int(m_data["wger_id"]))
            return sorted(list(set(res)))

        wger_primary = get_wger_ids(ex.get("primary_muscles"))
        wger_secondary = get_wger_ids(ex.get("secondary_muscles"))
        
        # 3. Update Category Index
        index_entry = {
            "exercise_id": ex_id,
            "display_name": ex.get("display_name") or ex.get("name"),
            "region": ex.get("region") or (taxonomy.get(normalize_muscle_id(str(ex.get("primary_muscles", [""])[0]))) or {}).get("body_region"),
            "wger_muscle_ids": {
                "primary": wger_primary,
                "secondary": wger_secondary
            },
            "aliases": ex.get("aliases", [])
        }
        
        # Append to category file if it exists, otherwise create
        cat_doc = {"exercises": []}
        if category_path.exists():
            cat_doc = load_yaml(category_path) or {"exercises": []}
        
        # Avoid duplicates in index
        cat_doc["exercises"] = [e for e in cat_doc.get("exercises", []) if (e.get("exercise_id") or e.get("id")) != ex_id]
        cat_doc["exercises"].append(index_entry)
        
        with category_path.open("w", encoding="utf-8") as f:
            yaml.safe_dump(cat_doc, f, sort_keys=False, allow_unicode=True)
            
        # 4. Save Detail File
        detail_path = exercises_dir / f"{ex_id}.yml"
        ex["source"] = "expert"
        detail_doc = {
            "exercise_id": ex_id,
            "description": f"Expert details for {ex_id}",
            "exercises": [ex]
        }
        with detail_path.open("w", encoding="utf-8") as f:
            yaml.safe_dump(detail_doc, f, sort_keys=False, allow_unicode=True)
            
        old_path.unlink()
        
        # 5. Trigger Sync
        from .firestore_push import run_kb_sync
        try:
            run_kb_sync()
        except Exception as e:
            logger.error(f"Post-approval sync failed: {e}")

        return web.json_response({"ok": True, "id": ex_id, "category": category})
        
    except Exception as e:
        logger.exception("Approval failed")
        return web.json_response({"ok": False, "error": str(e)}, status=500)


async def handle_inbox_delete(request: web.Request) -> web.Response:
    file_id = request.match_info.get("id")
    exercises_dir = DATA_DIR / "exercises"
    file_path = exercises_dir / f"{file_id}.yml"
    
    if file_path.exists():
        file_path.unlink()
        return web.json_response({"ok": True})
    
    return web.json_response({"ok": False, "error": "not_found"}, status=404)


@web.middleware
async def cors_middleware(request: web.Request, handler: Any) -> web.StreamResponse:
    if request.method == "OPTIONS":
        response = web.Response(status=204)
    else:
        response = await handler(request)
    
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


def create_app() -> web.Application:
    app = web.Application(middlewares=[cors_middleware])
    
    app.add_routes([
        web.get("/", handle_index),
        web.get("/exercises", handle_exercises),
        web.get("/exercise/{id}", handle_exercise_detail),
        web.get("/search", handle_search),
        web.get("/resolve", handle_resolve),
        web.get("/muscles", handle_muscles),
        web.get("/muscles/viz", handle_muscles_viz),
        web.get("/taxonomy", handle_taxonomy),
        web.get("/snapshot", handle_snapshot),
        web.get("/plan", handle_plan),
        web.post("/plan", handle_plan),
        web.get("/coverage/detailed", handle_coverage_detailed),
        web.get("/weekly", handle_weekly),
        web.post("/export/{kind}", handle_export),
        web.post("/inbox/queue", handle_inbox_queue),
        web.get("/inbox", handle_inbox_list),
        web.post("/inbox/{id}/approve", handle_inbox_approve),
        web.delete("/inbox/{id}", handle_inbox_delete),
    ])
    
    return app


def main():
    app = create_app()
    web.run_app(app, host="0.0.0.0", port=9130)


if __name__ == "__main__":
    main()
