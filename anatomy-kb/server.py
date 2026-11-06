"""
anatomy-kb — Knowledge API Server  :9200 (FastAPI Version)
"""

import sys
import os
import asyncio
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Query, Body, Response
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
import yaml

# Central Path Resolver
from anatomy_kb.config import CATALOG_DIR, FITNESS_DEV, ANATOMY_KB_ROOT, CATALOG_EXERCISES, ANATOMY_TEACHING

_agent_available = False
cov_module = plan_module = res_module = teach_module = runtime_root = None

if CATALOG_DIR and CATALOG_DIR.exists():
    if FITNESS_DEV:
        sys.path.insert(0, str(FITNESS_DEV))
    sys.path.insert(0, str(CATALOG_DIR.parent))  # fitness-dev/ (für firestore/)
    sys.path.insert(0, str(CATALOG_DIR))          # catalog/ (für catalog)
    try:
        from catalog import coverage as cov_module
        from catalog import planner as plan_module
        try:
            from catalog import resolver as res_module
        except ImportError:
            from catalog.core import resolver as res_module
        try:
            from catalog import teaching as teach_module
        except ImportError:
            from catalog.agent import teaching as teach_module
        from catalog.core.paths import runtime_root
        _agent_available = True
    except ImportError as e:
        logger.warning(f"catalog nicht verfügbar — Agent-Features deaktiviert ({e})")
else:
    logger.warning("fitness-dev/catalog nicht gefunden — anatomy-kb läuft ohne Agent-Features")

app = FastAPI(title="anatomy-kb API Server (FastAPI)")

# CORS Middleware for local integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PORT = 9200
PUBLIC = Path(__file__).resolve().parent / "public"

from anatomy_kb import db as _db, muscle_store as _store, gemini as _gemini
from anatomy_kb import firestore_handler as fs

def require_agent():
    if not _agent_available:
        raise HTTPException(status_code=503, detail="Agent features not available (catalog missing)")

@app.get("/health")
async def health():
    if _agent_available:
        exercises = res_module.build_exercise_index()
        lessons = teach_module.load_all_lessons()
        exercises_len = len(exercises)
        lessons_len = len(lessons)
        root_path = str(runtime_root())
    else:
        exercises_len = 0
        lessons_len = 0
        root_path = None
    return {
        "status": "ok",
        "runtime_root": root_path,
        "exercises": exercises_len,
        "anatomy_lessons": lessons_len,
    }

@app.get("/api/exercises")
async def get_exercises():
    require_agent()
    records = res_module.build_exercise_index()
    return [
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
    ]

@app.get("/api/exercise/{exercise_id}")
async def get_exercise(exercise_id: str):
    require_agent()
    result = res_module.resolve_query(exercise_id)
    if not result.matched:
        raise HTTPException(status_code=404, detail=f"Übung nicht gefunden: {exercise_id}")
    records = res_module.build_exercise_index()
    record = res_module.find_by_id(result.canonical_id, records)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Übung nicht gefunden: {exercise_id}")
    return {
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
    }

@app.get("/api/exercise/{exercise_id}/teaching")
async def get_teaching(exercise_id: str, mode: str = "trainer"):
    require_agent()
    if mode not in ("trainer", "client"):
        raise HTTPException(status_code=400, detail="mode muss trainer oder client sein")
    lesson = teach_module.find_lesson(exercise_id)
    if lesson is None:
        raise HTTPException(status_code=404, detail=f"Keine Anatomy-Lesson für: {exercise_id}")
    return {
        "exercise_id": exercise_id,
        "mode": mode,
        "lesson": lesson,
        "markdown": teach_module.teach_exercise(exercise_id, mode=mode),
    }

@app.get("/api/exercise/{exercise_id}/coverage")
async def get_coverage(exercise_id: str, sets: int = 3, rpe: int = 7):
    require_agent()
    try:
        return cov_module.calculate_coverage(exercise_id, sets=sets, rpe=rpe)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/api/exercise/{exercise_id}/bodymap")
async def get_bodymap(exercise_id: str):
    require_agent()
    try:
        result = cov_module.calculate_coverage(exercise_id, sets=3, rpe=7)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    regions = result.get("body_region_scores", {})
    primary, secondary, light = [], [], []
    for region, score in regions.items():
        if score >= 0.7:
            primary.append(region)
        elif score >= 0.3:
            secondary.append(region)
        else:
            light.append(region)
    return {"exercise_id": exercise_id, "primary": primary, "secondary": secondary, "light": light}

@app.get("/api/resolve")
async def resolve(q: str = ""):
    require_agent()
    q = q.strip()
    if not q:
        raise HTTPException(status_code=400, detail="Parameter q fehlt")
    result = res_module.resolve_query(q)
    return {
        "query": result.query,
        "matched": result.matched,
        "canonical_id": result.canonical_id,
        "display_name": result.display_name,
        "source": result.source,
        "confidence": result.confidence,
        "suggestions": result.suggestions,
    }

@app.post("/api/plan/generate")
async def plan_generate(body: dict = Body(...)):
    require_agent()
    try:
        result = plan_module.build_plan(
            template=body.get("template"),
            split=body.get("split"),
            day=body.get("day"),
            goal=body.get("goal"),
        )
        return {
            "template": result.template_name,
            "slots": result.slots,
            "coverage_summary": result.coverage_summary,
            "notes": result.notes,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/firestore/sync")
async def sync_all(dry: bool = False):
    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, lambda: fs._run_sync(dry))
        from datetime import datetime
        fs._last.update({"at": datetime.now().isoformat(), "status": "ok", "dry": dry, **result})
        return {"ok": True, "dry": dry, "at": fs._last["at"], **result}
    except Exception as e:
        logger.error(e)
        from datetime import datetime
        fs._last.update({"at": datetime.now().isoformat(), "status": "error", "error": str(e)})
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/firestore/sync/exercises")
async def sync_exercises_handler(dry: bool = False):
    from fitness.catalog.api.firestore_push import sync_exercises
    try:
        loop = asyncio.get_running_loop()
        db = await loop.run_in_executor(None, fs._get_db)
        result = await loop.run_in_executor(None, lambda: sync_exercises(db, dry_run=dry))
        return {"ok": True, "dry": dry, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/firestore/sync/muscles")
async def sync_muscles_handler(dry: bool = False):
    try:
        loop = asyncio.get_running_loop()
        db = await loop.run_in_executor(None, fs._get_db)
        result = await loop.run_in_executor(None, lambda: fs._sync_muscles(db, dry))
        return {"ok": True, "dry": dry, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/firestore/sync/anatomy")
async def sync_anatomy_handler(dry: bool = False):
    try:
        loop = asyncio.get_running_loop()
        db = await loop.run_in_executor(None, fs._get_db)
        result = await loop.run_in_executor(None, lambda: fs._sync_anatomy(db, dry))
        return {"ok": True, "dry": dry, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/firestore/sync/index")
async def sync_index_handler(dry: bool = False):
    try:
        loop = asyncio.get_running_loop()
        db = await loop.run_in_executor(None, fs._get_db)
        result = await loop.run_in_executor(None, lambda: fs._sync_index(db, dry))
        return {"ok": True, "dry": dry, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/firestore/status")
async def firestore_status():
    return fs._last

@app.get("/api/muscles")
async def get_muscles():
    index = _store.load_index()
    muscles = []
    for mid in _store.list_muscles():
        doc = _store.load_muscle(mid) or {}
        meta = index.get(mid, {})
        muscles.append({
            "muscle_id": mid,
            "wger_id": meta.get("wger_id"),
            "latin": doc.get("latin", meta.get("latin", "")),
            "name_en": meta.get("name_en", ""),
            "has_anatomy": bool(doc.get("origin")),
            "exercises": list(doc.get("exercises", {}).keys()),
        })
    return {"count": len(muscles), "muscles": muscles}

@app.get("/api/muscles/{muscle_id}")
async def get_muscle(muscle_id: str):
    doc = _store.load_muscle(muscle_id)
    if doc is None:
        raise HTTPException(status_code=404, detail=f"Muskel nicht gefunden: {muscle_id}")
    return doc

MUSCLE_PROMPT = """\
Du bist Anatomie-Experte (Diplom Präventiver Vitaltrainer, FlexyFit Wien).
Muskel: {latin} (muscle_id: {muscle_id})
Antworte NUR mit diesem YAML-Block:
```yaml
origin: "Ursprung (Origo) — präzise Knochenstruktur und Knochenmarken"
insertion: "Ansatz (Insertio) — präzise Knochenstruktur und Knochenmarken"
innervation: "Nerv (Segmente)"
function: "Allgemeine Funktion des Muskels (1-2 Sätze Deutsch)"
```
"""

@app.post("/api/muscles/enrich")
async def enrich_muscles(muscle_id: Optional[str] = None, force: bool = False):
    api_key, model = _gemini.load_env()
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY fehlt in ~/.env/gemini.env")

    targets = ([muscle_id] if muscle_id else [
        mid for mid in _store.list_muscles()
        if force or not (_store.load_muscle(mid) or {}).get("origin")
    ])

    if not targets:
        return {"ok": True, "message": "Alle Muskeln bereits befüllt", "enriched": []}

    def _run():
        ok, fail = [], []
        for mid in targets:
            doc = _store.load_muscle(mid)
            if not doc:
                fail.append(mid)
                continue
            prompt = MUSCLE_PROMPT.format(latin=doc.get("latin", mid), muscle_id=mid)
            try:
                response = _gemini.call_with_fallback(
                    prompt, api_key, model,
                    on_fallback=lambda m: logger.warning(f"Fallback auf {m}"),
                )
                if not response:
                    fail.append(mid)
                    continue
                parsed = yaml.safe_load(_gemini.extract_yaml_block(response))
                if not isinstance(parsed, dict) or not parsed.get("origin"):
                    fail.append(mid)
                    continue
                for k in ("origin", "insertion", "innervation", "function"):
                    if parsed.get(k):
                        doc[k] = parsed[k]
                _store.save_muscle(mid, doc)
                logger.info(f"muscles/{mid} enriched")
                ok.append(mid)
            except Exception as exc:
                logger.error(f"muscles/{mid}: {exc}")
                fail.append(mid)
        return ok, fail

    try:
        loop = asyncio.get_running_loop()
        ok, fail = await loop.run_in_executor(None, _run)
        return {"ok": True, "enriched": ok, "failed": fail}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/muscles/push")
async def push_to_teaching_handler(muscle_id: Optional[str] = None):
    def _run():
        pushed = []
        targets = [muscle_id] if muscle_id else _store.list_muscles()
        seen_exercises: set[str] = set()
        for mid in targets:
            doc = _store.load_muscle(mid) or {}
            for ex_id in doc.get("exercises", {}):
                if ex_id in seen_exercises:
                    continue
                seen_exercises.add(ex_id)
                f = _store.push_to_teaching(ex_id, ANATOMY_TEACHING)
                if f:
                    pushed.append(str(f.name))
                    logger.info(f"anatomy_teaching/{f.name} aktualisiert")
        return pushed

    try:
        loop = asyncio.get_running_loop()
        pushed = await loop.run_in_executor(None, _run)
        return {"ok": True, "updated": pushed}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/db/sync")
async def db_sync():
    try:
        loop = asyncio.get_running_loop()
        counts = await loop.run_in_executor(None, _db.sync_all)
        return {"ok": True, "counts": counts, "db": str(_db.DB_PATH)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@app.get("/api/db/status")
async def db_status():
    try:
        conn = _db.connect()
        tables = ["muscles", "exercises", "exercise_muscles", "anatomy_teaching", "flashcard_scores", "training_sessions"]
        counts = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in tables}
        return {"ok": True, "db": str(_db.DB_PATH), "tables": counts}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@app.get("/api/db/query")
async def db_query(sql: str = ""):
    sql = sql.strip()
    if not sql:
        raise HTTPException(status_code=400, detail="sql Parameter fehlt")
    if not sql.upper().lstrip().startswith("SELECT"):
        raise HTTPException(status_code=403, detail="Nur SELECT-Queries erlaubt")
    try:
        loop = asyncio.get_running_loop()
        rows = await loop.run_in_executor(None, lambda: _db.query(sql))
        return {"ok": True, "rows": rows, "count": len(rows)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/reload")
async def reload_cache():
    from anatomy_kb import loader
    try:
        loader.reload()
        return {"ok": True, "message": "YAML cache cleared"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

if PUBLIC.exists():
    @app.get("/", response_class=HTMLResponse)
    async def get_index():
        index_file = PUBLIC / "index.html"
        if index_file.exists():
            return HTMLResponse(content=index_file.read_text(encoding="utf-8"))
        return "No index.html found"
    
    app.mount("/", StaticFiles(directory=str(PUBLIC)), name="public")

if __name__ == "__main__":
    import uvicorn
    port = PORT
    if "--port" in sys.argv:
        port = int(sys.argv[sys.argv.index("--port") + 1])
    
    logger.info(f"anatomy-kb server :{port}")
    if _agent_available:
        logger.info(f"runtime_root: {runtime_root()}")
    logger.info(f"fitness-agent: {FITNESS_DEV}")
    
    uvicorn.run(app, host="0.0.0.0", port=port)
