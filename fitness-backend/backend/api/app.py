"""FastAPI-App-Fabrik."""
from __future__ import annotations

import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger

from backend.api.routers import analytics, catalog, clients, health, plan, sessions, sync, user_plan
from backend.core.settings import Settings, load_settings
from backend.core.store import SessionStore
from backend.services import analytics as analytics_svc
from backend.services import catalog as catalog_svc
from backend.services import plan as plan_svc
from backend.services import sessions as sessions_svc


def _err(status: int, detail: str, **extra) -> JSONResponse:
    return JSONResponse({"detail": detail, **extra}, status_code=status)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(title="Fitness Backend", version="0.1.0")
    app.state.settings = settings
    app.state.store = SessionStore(settings.data_root)

    @app.exception_handler(sessions_svc.SessionNotFound)
    async def _nf(_: Request, exc):
        return _err(404, f"Session nicht gefunden: {exc}")

    @app.exception_handler(sessions_svc.InvalidSession)
    async def _inv(_: Request, exc):
        return _err(422, str(exc))

    @app.exception_handler(sessions_svc.RevConflict)
    async def _rev(_: Request, exc):
        return _err(409, str(exc), current_rev=exc.current_rev)

    @app.exception_handler(sessions_svc.StoredSessionCorrupt)
    async def _corrupt(_: Request, exc):
        return _err(409, f"gespeicherte Session ist defekt: {exc}")

    @app.exception_handler(analytics_svc.InvalidRange)
    async def _range(_: Request, exc):
        return _err(422, str(exc))

    @app.exception_handler(plan_svc.UnknownTemplate)
    async def _tpl(_: Request, exc):
        return _err(404, str(exc))

    @app.exception_handler(catalog_svc.ExerciseNotFound)
    async def _ex(_: Request, exc):
        return _err(404, f"Übung nicht gefunden: {exc}")

    @app.exception_handler(catalog_svc.YuhonasUnavailable)
    async def _yuh(_: Request, exc):
        return _err(503, f"yuhonas-Quelle nicht verfügbar: {exc}")

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception):
        # Details nur ins Log, nach außen nur eine Fehler-ID
        error_id = uuid.uuid4().hex[:8]
        logger.bind(event="error", error_id=error_id, path=request.url.path).exception(f"unerwarteter Fehler {error_id}")
        return _err(500, "interner Fehler", error_id=error_id)

    for r in (health, clients, sessions, analytics, plan, user_plan, catalog, sync):
        app.include_router(r.router, prefix="/api")
    _mount_frontend(app, settings)
    return app


def _mount_frontend(app: FastAPI, settings: Settings) -> None:
    """Gebautes Frontend ausliefern (falls vorhanden) — nach den /api-Routen, mit SPA-Fallback."""
    dist = settings.frontend_dist
    if not dist or not (dist / "index.html").is_file():
        return
    dist = dist.resolve()
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(404, "Route nicht gefunden")      # unbekannte API-Routen nie als HTML beantworten
        candidate = (dist / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(dist):
            return FileResponse(candidate)
        return FileResponse(dist / "index.html")
