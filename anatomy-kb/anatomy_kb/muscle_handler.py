"""
Muscle Handler — /api/muscles/* Endpoints

GET  /api/muscles                         alle Muskeln (Index)
GET  /api/muscles/{muscle_id}             ein Muskel
POST /api/muscles/enrich                  leere Muskeln via Gemini befüllen
POST /api/muscles/push                    muscles/*.yml → anatomy_teaching/ pushen

?muscle_id=latissimus_dorsi              einzelner Muskel
?force=1                                 auch befüllte überschreiben
"""
from __future__ import annotations

import asyncio
import json

import yaml
from aiohttp import web
from loguru import logger

from anatomy_kb import gemini as _gemini, muscle_store as _store
from anatomy_kb.commands._helpers import ANATOMY_TEACHING_DIR

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


def _ok(data) -> web.Response:
    return web.Response(text=json.dumps(data, ensure_ascii=False), content_type="application/json")

def _err(msg: str, status: int = 500) -> web.Response:
    return web.Response(text=json.dumps({"error": msg}), content_type="application/json", status=status)


async def list_muscles(request: web.Request) -> web.Response:
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
    return _ok({"count": len(muscles), "muscles": muscles})


async def get_muscle(request: web.Request) -> web.Response:
    muscle_id = request.match_info["muscle_id"]
    doc = _store.load_muscle(muscle_id)
    if doc is None:
        return _err(f"Muskel nicht gefunden: {muscle_id}", 404)
    return _ok(doc)


async def enrich_muscles(request: web.Request) -> web.Response:
    muscle_id = request.rel_url.query.get("muscle_id")
    force = request.rel_url.query.get("force") == "1"

    api_key, model = _gemini.load_env()
    if not api_key:
        return _err("GEMINI_API_KEY fehlt in ~/.env/gemini.env")

    targets = ([muscle_id] if muscle_id else [
        mid for mid in _store.list_muscles()
        if force or not (_store.load_muscle(mid) or {}).get("origin")
    ])

    if not targets:
        return _ok({"ok": True, "message": "Alle Muskeln bereits befüllt", "enriched": []})

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
        ok, fail = await asyncio.get_event_loop().run_in_executor(None, _run)
        return _ok({"ok": True, "enriched": ok, "failed": fail})
    except Exception as exc:
        logger.error(exc)
        return _err(str(exc))


async def push_to_teaching(request: web.Request) -> web.Response:
    """Bettet muscles/*.yml in anatomy_teaching/{exercise_id}.yml ein."""
    muscle_id = request.rel_url.query.get("muscle_id")

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
                f = _store.push_to_teaching(ex_id, ANATOMY_TEACHING_DIR)
                if f:
                    pushed.append(str(f.name))
                    logger.info(f"anatomy_teaching/{f.name} aktualisiert")
        return pushed

    try:
        pushed = await asyncio.get_event_loop().run_in_executor(None, _run)
        return _ok({"ok": True, "updated": pushed})
    except Exception as exc:
        logger.error(exc)
        return _err(str(exc))
