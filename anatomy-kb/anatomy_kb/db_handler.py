"""
DB Handler — /api/db/* Endpoints

POST /api/db/sync              alles synchen
GET  /api/db/status            Tabellen-Zählstände
GET  /api/db/query?sql=...     Raw SQL (read-only)
"""
from __future__ import annotations

import asyncio
import json

from aiohttp import web
from loguru import logger

from anatomy_kb import db as _db


def _ok(data) -> web.Response:
    return web.Response(text=json.dumps(data, ensure_ascii=False), content_type="application/json")

def _err(msg: str, status: int = 500) -> web.Response:
    return web.Response(text=json.dumps({"error": msg}), content_type="application/json", status=status)


async def sync(request: web.Request) -> web.Response:
    try:
        counts = await asyncio.get_event_loop().run_in_executor(None, _db.sync_all)
        logger.info(f"db sync: {counts}")
        return _ok({"ok": True, "counts": counts, "db": str(_db.DB_PATH)})
    except Exception as exc:
        logger.error(exc)
        return _err(str(exc))


async def status(request: web.Request) -> web.Response:
    try:
        conn = _db.connect()
        tables = ["muscles", "exercises", "exercise_muscles", "anatomy_teaching", "flashcard_scores", "training_sessions"]
        counts = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in tables}
        return _ok({"ok": True, "db": str(_db.DB_PATH), "tables": counts})
    except Exception as exc:
        return _err(str(exc))


async def query(request: web.Request) -> web.Response:
    sql = request.rel_url.query.get("sql", "").strip()
    if not sql:
        return _err("sql Parameter fehlt", 400)
    # Nur SELECT erlaubt
    if not sql.upper().lstrip().startswith("SELECT"):
        return _err("Nur SELECT-Queries erlaubt", 403)
    try:
        rows = await asyncio.get_event_loop().run_in_executor(None, lambda: _db.query(sql))
        return _ok({"ok": True, "rows": rows, "count": len(rows)})
    except Exception as exc:
        return _err(str(exc))
