#!/usr/bin/env python3
"""Coach backend on port 9150: one-process SOT for Coach keepers + SPA.

Runtime ownership: this file under ~/dev/coach-dev (coach-api.service).
fitness.api + fuel.api + Relax are in-process. coach-backends.json is only for
optional upstream fallbacks (not required when local attach succeeds).
"""
from __future__ import annotations

import argparse
import asyncio
import importlib
import importlib.util
import json
import logging
import os
import re
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, StreamingResponse, HTMLResponse
from starlette.background import BackgroundTask

from coach_sixpack import router as sixpack_router

ROOT = Path(__file__).resolve().parent
_log = logging.getLogger("uvicorn.error")


def coach_backend_root() -> Path:
    """Domain packages live under …/backend/{fitness,fuel,…}."""
    return Path(os.environ.get(
        "COACH_BACKEND_ROOT",
        os.environ.get("COACH_FITNESS_BACKEND_ROOT", ROOT / "backend"),
    )).expanduser().resolve()
API_PREFIXES = (
    "api", "fitness", "exercise", "exercises", "coverage", "blocks", "coaching-notes",
    "export", "firestore", "home", "internal", "journal", "plan", "plans", "routines",
    "session", "sessions", "theme", "workouts",
)
METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
HOP_HEADERS = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailer", "transfer-encoding", "upgrade",
}


def catalog_dist() -> Path:
    """Reuse the existing UI build; COACH_CATALOG_DIR selects an explicit build."""
    if os.environ.get("COACH_CATALOG_DIR"):
        return Path(os.environ["COACH_CATALOG_DIR"]).expanduser().resolve()
    candidates = [
        ROOT / "dist-catalog",
        ROOT / "catalog-ui" / "dist",
        ROOT / "vitalos/fitness-app/fitness/catalog/dist",
        ROOT.parent / "fitness-dev/fitness/catalog/dist",
    ]
    return next((p for p in candidates if (p / "index.html").is_file()), candidates[0])


def fitness_frontend_dist() -> Path:
    """Built local-mode Fitness client; COACH_FITNESS_FRONTEND_DIR can override it."""
    configured = os.environ.get("COACH_FITNESS_FRONTEND_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path.home() / "dev" / "fitness-dev" / "frontend" / "dist"


def hub_public_dist() -> Path:
    """Vital Centre HTML (ehem. vital-hub :8788). COACH_HUB_DIR überschreibt."""
    configured = os.environ.get("COACH_HUB_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path.home() / ".local" / "vital-hub" / "vitalctx" / "public"


def load_fitness_app():
    """Sessions/UI FastAPI under /fitness-api — `backend/fitness` package."""
    source_root = coach_backend_root()
    if not (source_root / "fitness" / "api" / "app.py").is_file():
        return None

    source = str(source_root)
    if source not in sys.path:
        sys.path.insert(0, source)
    for name in list(sys.modules):
        if name == "fitness" or name.startswith("fitness."):
            # don't wipe fitness if already loaded from same tree — only force api.app refresh
            pass
    for name in list(sys.modules):
        if name == "fitness.api.app" or name.startswith("fitness.api.app."):
            del sys.modules[name]
    module = importlib.import_module("fitness.api.app")
    module_path = Path(module.__file__).resolve()
    if not module_path.is_relative_to(source_root):
        raise RuntimeError(f"Fitness backend import resolved outside {source_root}: {module_path}")
    return module.create_app()


def _ensure_backend_on_path() -> Path:
    source_root = coach_backend_root()
    root = str(ROOT)
    backend = str(source_root)
    for path in (backend, root):
        if path not in sys.path:
            sys.path.insert(0, path)
    return source_root


def attach_fitness_api(app: FastAPI) -> bool:
    """Inbox/Catalog/Workouts from backend/fitness (same process as coach-api)."""
    _ensure_backend_on_path()
    try:
        from fitness.api.routers.sessions import router as sessions_router
        from fitness.api.routers.journal import router as journal_router
        from fitness.api.routers.exercises import router as exercises_router
        from fitness.api.routers.coaching import router as coaching_router
        from fitness.api.routers.coach_plans import router as coach_plans_router
        from fitness.api.routers.macrocycles import router as macrocycles_router
        from fitness.api.routers.workouts import router as workouts_router
        from fitness.api.routers.system import router as system_router
        from fitness.api.routers.coaching_notes import router as coaching_notes_router
        from fitness.anatomy.router import router as anatomy_router
        from fitness.api.routers.sixpack_photos import router as sixpack_photos_router
    except Exception:
        return False
    for router in (
        sessions_router, journal_router, exercises_router, coaching_router,
        coach_plans_router, macrocycles_router, workouts_router, system_router,
        coaching_notes_router, anatomy_router, sixpack_photos_router,
    ):
        app.include_router(router)
    app.include_router(macrocycles_router, prefix="/api")
    app.include_router(workouts_router, prefix="/api")
    return True


def attach_fuel_api(app: FastAPI) -> bool:
    """Nutrition API from backend/fuel (same process as coach-api)."""
    _ensure_backend_on_path()
    try:
        from fuel.api.integration import initialize_fuel_backend, router as fuel_router
    except Exception as exc:
        _log.warning("fuel.api attach skipped (import): %s", exc)
        return False
    try:
        initialize_fuel_backend()
    except Exception as exc:
        # Router trotzdem mounten — Migration/DB kann später greifen.
        _log.warning("fuel.api init deferred: %s", exc)
    # Gleiche Prefixes wie bisheriger Proxy (coach-backends.json / VitalOS).
    app.include_router(fuel_router, prefix="/api/fuel")
    app.include_router(fuel_router, prefix="/fuel-api")
    return True


def end_to_end_headers(headers) -> list[tuple[str, str]]:
    excluded = HOP_HEADERS | {part.strip().lower() for part in headers.get("connection", "").split(",")}
    return [(key, value) for key, value in (headers.multi_items() if hasattr(headers, "multi_items") else headers.items()) if key.lower() not in excluded]


def frontend(directory: Path, relative: str):
    directory = directory.resolve()
    candidate = (directory / relative).resolve()
    if not candidate.is_relative_to(directory):
        return JSONResponse({"detail": "Forbidden"}, status_code=403)
    if candidate.is_file():
        return FileResponse(candidate, headers={"Cache-Control": "no-cache"})
    # Missing assets must not return an HTML document as JavaScript.
    if not Path(relative).suffix and (directory / "index.html").is_file():
        return FileResponse(directory / "index.html", headers={"Cache-Control": "no-cache"})
    if not (directory / "index.html").is_file():
        return JSONResponse({
            "detail": "Coach UI build missing",
            "directory": str(directory),
            "build": "npm run build:catalog-ui or npm run build:firebase:coach",
        }, status_code=503)
    return JSONResponse({"detail": "Not found"}, status_code=404)


def configured_backends(overrides: dict[str, str] | None = None) -> dict[str, httpx.URL]:
    config = Path(os.environ.get("COACH_BACKENDS_FILE", ROOT / "coach-backends.json"))
    origins = json.loads(config.read_text())
    for name in origins:
        origins[name] = os.environ.get(f"COACH_{name.upper().replace('-', '_')}_API_URL", origins[name])
    # Compatibility with the first catalog-only server; never point this at Coach itself.
    if os.environ.get("COACH_API_URL"):
        origins["fitness"] = os.environ["COACH_API_URL"]
    origins.update(overrides or {})
    urls = {}
    for name, origin in origins.items():
        if not re.fullmatch(r"[a-z][a-z0-9-]*", name):
            raise ValueError(f"Invalid Coach backend name: {name}")
        url = httpx.URL(origin)
        if url.scheme not in ("http", "https") or not url.host or url.query or url.fragment or url.username or url.password:
            raise ValueError(f"Backend {name} must be an HTTP(S) URL without credentials or query")
        coach_ports = {int(os.environ.get("COACH_PORT", "9150"))}
        alias = os.environ.get("COACH_ALIAS_PORT", "").strip()
        if alias.isdigit():
            coach_ports.add(int(alias))
        if url.host in ("localhost", "127.0.0.1", "::1", "0.0.0.0") and url.port in coach_ports:
            raise ValueError(f"Backend {name} points back to Coach; choose a separate domain worker port")
        urls[name] = url
    # Proxied domains only (see coach-backends.README.md). Fitness/Relax are local.
    return urls


def create_app(*, catalog_directory: Path | None = None, coach_directory: Path | None = None,
               fitness_directory: Path | None = None, hub_directory: Path | None = None,
               upstream_url: str | None = None, backend_urls: dict[str, str] | None = None,
               transport=None, include_fitness_api: bool = True,
               include_fuel_api: bool = True) -> FastAPI:
    catalog = (catalog_directory or catalog_dist()).resolve()
    coach = (coach_directory or Path(os.environ.get("COACH_UI_DIR", ROOT / "dist-coach"))).resolve()
    fitness_ui = (fitness_directory or fitness_frontend_dist()).resolve()
    # hub_directory=None → Defaultpfad; explizit fehlender Ordner = Hub aus (Tests).
    hub = (hub_directory if hub_directory is not None else hub_public_dist()).resolve()
    overrides = dict(backend_urls or {})
    if upstream_url:
        overrides["fitness"] = upstream_url
    backends = configured_backends(overrides)

    @asynccontextmanager
    async def lifespan(app):
        async with httpx.AsyncClient(timeout=60, follow_redirects=False, trust_env=False, transport=transport) as client:
            app.state.api_client = client
            stop_scheduler = asyncio.Event()
            scheduler_task = None
            if os.environ.get('COACH_TASKWARRIOR_SCHEDULER', '1').casefold() not in {'0', 'false', 'off'}:
                from coach_taskwarrior_scheduler import run_scheduler
                interval = int(os.environ.get('COACH_TASKWARRIOR_SYNC_INTERVAL_SECONDS', '60'))
                scheduler_task = asyncio.create_task(run_scheduler(stop_scheduler, interval))
            try:
                yield
            finally:
                stop_scheduler.set()
                if scheduler_task:
                    await scheduler_task

    app = FastAPI(title="Coach backend", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

    # Firebase Hosting (fitness-aos / vos-coach) → Funnel `:9150` braucht CORS;
    # attach_fitness_api mountet Router ohne die CORSMiddleware aus fitness.api.main.
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.backends = backends
    app.state.fitness_api_local = False
    app.state.fuel_api_local = False
    fitness_app = load_fitness_app()
    app.state.fitness_frontend_app = fitness_app is not None
    if fitness_app is not None:
        app.mount("/fitness-api", fitness_app, name="fitness-api")

    relax_embedded = "relax" not in backends
    relax_app = None
    if relax_embedded:
        loader_path = ROOT / "src" / "relax_api.py"
        loader_spec = importlib.util.spec_from_file_location("coach_relax_loader", loader_path)
        if loader_spec is None or loader_spec.loader is None:
            raise RuntimeError(f"Cannot load Coach Relax route module: {loader_path}")
        loader_module = importlib.util.module_from_spec(loader_spec)
        loader_spec.loader.exec_module(loader_module)
        relax_app = loader_module.load_relax_app()
        if relax_app is not None:
            app.mount("/api/relax", relax_app, name="relax-api")
            app.mount("/relax-api", relax_app, name="relax-api-compat")

    @app.middleware("http")
    async def local_plan_cache_control(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith(("/api/coach/local/", "/api/client/", "/k/")) or request.url.path == "/api/clients":
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/sw.js")
    async def retire_root_worker():
        return FileResponse(ROOT / "website/coach/retire-root-sw.js", media_type="application/javascript",
                            headers={"Cache-Control": "no-store", "Service-Worker-Allowed": "/"})

    # Coach /health vor fitness.api system_router — sonst überschattet dessen /health die Coach-Identität.
    @app.get("/health")
    @app.get("/_coach/health")
    async def health():
        fitness_api_local = app.state.fitness_api_local
        fuel_api_local = app.state.fuel_api_local
        fitness_mode = (
            "local" if fitness_api_local
            else ("worker" if "fitness" in backends else ("frontend-api" if app.state.fitness_frontend_app else "unavailable"))
        )
        fuel_mode = (
            "local" if fuel_api_local
            else ("worker" if "fuel" in backends else "unavailable")
        )
        return {"ok": True, "service": "coach", "port": int(os.environ.get("COACH_PORT", "9150")),
                "backends": {name: str(url) for name, url in backends.items()},
                "fitness_api": fitness_mode,
                "fuel_api": fuel_mode,
                "fitness_frontend_api": "local" if app.state.fitness_frontend_app else "unavailable",
                "relax_api": "local" if relax_app is not None else ("worker" if "relax" in backends else "unavailable"),
                "fitness_frontend_ready": ((fitness_ui if os.environ.get("COACH_FITNESS_FRONTEND_DIR") else catalog) / "index.html").is_file(),
                "catalog_ready": (catalog / "index.html").is_file(),
                "coach_ready": (coach / "index.html").is_file()}

    @app.get("/_coach/backends")
    async def backend_health(request: Request):
        async def check(name, origin):
            try:
                health_path = f"{origin.path.rstrip('/')}/health"
                response = await request.app.state.api_client.get(origin.copy_with(path=health_path), timeout=3)
                ready = response.is_success
                return name, {"ready": ready, "status": response.status_code}
            except httpx.RequestError:
                return name, {"ready": False, "status": None}
        statuses = dict(await asyncio.gather(*(check(name, origin) for name, origin in backends.items())))
        if app.state.fitness_api_local:
            statuses["fitness"] = {"ready": True, "status": 200, "mode": "local"}
        if app.state.fitness_frontend_app:
            statuses["fitness_frontend_api"] = {"ready": True, "status": 200, "mode": "local"}
        if app.state.fuel_api_local:
            statuses["fuel"] = {"ready": True, "status": 200, "mode": "local"}
        if relax_app is not None:
            statuses["relax"] = {"ready": True, "status": 200, "mode": "local"}
        return {"ok": all(value["ready"] for value in statuses.values()), "backends": statuses}

    # Domain APIs in-process — nach /health, vor UI-Catch-alls.
    app.state.fitness_api_local = attach_fitness_api(app) if include_fitness_api else False
    app.state.fuel_api_local = attach_fuel_api(app) if include_fuel_api else False
    fitness_api_local = app.state.fitness_api_local
    fuel_api_local = app.state.fuel_api_local

    async def proxy(request: Request, backend: str, strip_segments: int = 0):
        upstream = backends[backend]
        raw_path = request.scope["raw_path"]
        if strip_segments:
            parts = raw_path.split(b"/", strip_segments + 1)
            raw_path = b"/" + (parts[-1] if len(parts) > strip_segments + 1 else b"")
        # Keep a configured API base path plus the encoded suffix, query, body and method.
        base_path = upstream.path.rstrip("/").encode("ascii")
        url = upstream.copy_with(raw_path=base_path + raw_path + (b"?" + request.scope["query_string"] if request.scope["query_string"] else b""))
        headers = [(k, v) for k, v in end_to_end_headers(request.headers) if k.lower() != "host"]
        outgoing = request.app.state.api_client.build_request(request.method, url, headers=headers, content=await request.body())
        try:
            response = await request.app.state.api_client.send(outgoing, stream=True)
        except httpx.RequestError:
            return JSONResponse({"detail": "Coach domain API unavailable", "backend": backend, "upstream": str(upstream)}, status_code=502)
        result = StreamingResponse(response.aiter_raw(), status_code=response.status_code,
                                   background=BackgroundTask(response.aclose))
        result.raw_headers = [(k.encode("latin-1"), v.encode("latin-1")) for k, v in end_to_end_headers(response.headers)]
        return result

    def domain_proxy(name, strip_segments=0):
        async def endpoint(request: Request):
            return await proxy(request, name, strip_segments)
        return endpoint

    @app.api_route("/fitness/{path:path}", methods=["GET", "HEAD"])
    async def fitness_ui_route(path: str, request: Request):
        head = path.partition("/")[0]
        if head in {*API_PREFIXES, "health", "notify", "inbox"}:
            # Lokale fitness.api-Routen greifen zuerst. Nur noch optionaler
            # Upstream (nicht :9150 selbst) — der alte :8100-Preview-Weg ist tot.
            if "fitness" in backends and not fitness_api_local:
                return await proxy(request, "fitness", strip_segments=1)
            return JSONResponse({"detail": "Not found"}, status_code=404)
        # Default: Katalog-UI (Coach-Dist) unter /fitness/. Legacy Fitness-SPA
        # nur noch mit explizitem COACH_FITNESS_FRONTEND_DIR.
        legacy_spa = bool(os.environ.get("COACH_FITNESS_FRONTEND_DIR"))
        ui = fitness_ui if legacy_spa else catalog
        if not (ui / "index.html").is_file():
            return JSONResponse({
                "detail": "Fitness frontend build missing" if legacy_spa else "Catalog UI build missing",
                "directory": str(ui),
                "build": (
                    "cd ~/dev/fitness-dev/frontend && VITE_API_BASE=/fitness-api pnpm exec vite build"
                    if legacy_spa else "npm run build:catalog-ui"
                ),
            }, status_code=503)
        if path == "sw.js":
            return frontend(ui, path)
        response = frontend(ui, path)
        if not path or not Path(path).suffix:
            html = (ui / "index.html").read_text(encoding="utf-8")
            html = html.replace("navigator.serviceWorker.register('/sw.js')", "navigator.serviceWorker.register('/fitness/sw.js')")
            return HTMLResponse(html, headers={"Cache-Control": "no-cache"})
        return response

    # Coach-eigene Routen (kein Proxy) stehen vor den Domain- und /api-Catch-alls.
    app.include_router(sixpack_router)
    from coach_local_plans import create_router
    app.include_router(create_router())
    from coach_local_traction import router as local_traction_router
    app.include_router(local_traction_router)

    from coach_legacy_clients import (
        include_legacy_clients, legacy_ui, schmiede_dir, konsole_dir, spa_document,
    )
    include_legacy_clients(app)
    from coach_yuhonas import create_router as create_yuhonas_router
    app.include_router(create_yuhonas_router())

    @app.api_route("/schmiede", methods=["GET", "HEAD"])
    @app.api_route("/schmiede/", methods=["GET", "HEAD"])
    async def schmiede_index(request: Request):
        from coach_local_plans import local_only
        local_only(request)
        return spa_document(schmiede_dir(), "klienten.html", "/_klienten/")

    @app.api_route("/schmiede/{path:path}", methods=["GET", "HEAD"])
    async def schmiede_assets(path: str, request: Request):
        from coach_local_plans import local_only
        local_only(request)
        if not path or not Path(path).suffix:
            return spa_document(schmiede_dir(), "klienten.html", "/_klienten/")
        return frontend(schmiede_dir(), path)

    @app.api_route("/konsole", methods=["GET", "HEAD"])
    @app.api_route("/konsole/", methods=["GET", "HEAD"])
    async def konsole_index(request: Request):
        from coach_local_plans import local_only
        local_only(request)
        return spa_document(konsole_dir(), "konsole.html", "/konsole/")

    @app.api_route("/konsole/{path:path}", methods=["GET", "HEAD"])
    async def konsole_assets(path: str, request: Request):
        from coach_local_plans import local_only
        local_only(request)
        if not path or not Path(path).suffix:
            return spa_document(konsole_dir(), "konsole.html", "/konsole/")
        return frontend(konsole_dir(), path)

    @app.api_route("/_klienten/{path:path}", methods=["GET", "HEAD"])
    async def legacy_client_assets(path: str, request: Request):
        from coach_local_plans import local_only
        local_only(request)
        return frontend(legacy_ui(), path)

    # Explicit domains precede the compatibility /api catch-all.
    for name in backends:
        for prefix in (f"/api/{name}", f"/{name}-api"):
            if name == "fitness" and (prefix == "/fitness-api" and fitness_app is not None or fitness_api_local):
                continue
            if name == "fuel" and fuel_api_local:
                continue
            endpoint = domain_proxy(name, prefix.count("/"))
            app.add_api_route(prefix, endpoint, methods=METHODS)
            app.add_api_route(f"{prefix}/{{path:path}}", endpoint, methods=METHODS)

    # Legacy Fitness-Pfad-Proxies nur wenn kein lokales fitness.api und ein Upstream gesetzt ist.
    if "fitness" in backends and not fitness_api_local:
        for prefix in API_PREFIXES:
            endpoint = domain_proxy("fitness")
            app.add_api_route(f"/{prefix}", endpoint, methods=METHODS)
            app.add_api_route(f"/{prefix}/{{path:path}}", endpoint, methods=METHODS)

    @app.api_route("/clientforge", methods=["GET", "HEAD"])
    @app.api_route("/clientforge/", methods=["GET", "HEAD"])
    async def clientforge_redirect(request: Request):
        # Alter Klienten-Pfad-Alias → Schmiede. Coach-Firebase-App (/coach/*) bleibt unangetastet.
        client = (request.query_params.get("client") or "").strip()
        if client and all(c.isalnum() or c in "-_" for c in client):
            return RedirectResponse(f"/schmiede/{client}/", status_code=302)
        return RedirectResponse("/schmiede/", status_code=302)

    @app.api_route("/coach", methods=["GET", "HEAD"])
    async def coach_redirect():
        return RedirectResponse("/coach/")

    @app.api_route("/coach/{path:path}", methods=["GET", "HEAD"])
    async def coach_ui(path: str):
        return frontend(coach, path)

    @app.api_route("/catalog-ui", methods=["GET", "HEAD"])
    async def catalog_redirect():
        return RedirectResponse("/catalog-ui/")

    @app.api_route("/catalog-ui/{path:path}", methods=["GET", "HEAD"])
    async def catalog_ui(path: str):
        return frontend(catalog, path)

    # Statische Coach-Dateien unter :9150 — früher lag Website-Kram in public-coach/,
    # damit man ihn lokal ohne Firebase erreicht. Seit dem Submodul gilt:
    # public-coach = APKs/Entwürfe; website/coach = Portal/Icons; website/src =
    # Vitaltrainer-Seiten (index/vitalos/6pack/…); optional gebautes Dashboard.
    # Root = Vital Centre (ehem. vital-hub :8788 public/); Catalog bleibt /catalog-ui/.
    # Root-Dateien (/vitalos.html) UND Prefix /website/… zeigen auf denselben Stand.
    public_dirs = [
        ROOT / "public-coach",
        ROOT / "website" / "coach",
        ROOT / "website" / "src",
        ROOT / "website" / "vitalos-dashboard" / "dist",
        ROOT / "website" / "vitalos-dashboard",
    ]
    if hub.is_dir():
        public_dirs.insert(0, hub)
    website_dirs = [
        ROOT / "website" / "src",
        ROOT / "website" / "coach",
        ROOT / "website" / "vitalos-dashboard" / "dist",
        ROOT / "website" / "vitalos-dashboard",
        ROOT / "website",
    ]

    def file_from_dirs(relative: str, directories: list[Path]):
        # Kein resolve()-Containment: Hub-Ordner wie fuel/ sind Symlinks nach außerhalb.
        rel = Path(relative)
        if rel.is_absolute() or ".." in rel.parts:
            return None
        for directory in directories:
            if not directory.is_dir():
                continue
            candidate = directory.joinpath(*rel.parts)
            if candidate.is_file():
                return FileResponse(candidate, headers={"Cache-Control": "no-cache"})
        return None

    def public_or_catalog(relative: str):
        relative = (relative or "").strip("/")
        # Nur Vital Centre (Hub) darf Catalog auf / verdrängen — nicht website/src.
        if not relative or relative == "index.html":
            if hub.is_dir():
                found = file_from_dirs("index.html", [hub])
                if found is not None:
                    return found
            return frontend(catalog, "" if not relative else relative)
        found = file_from_dirs(relative, public_dirs)
        if found is not None:
            return found
        if "." not in Path(relative).name:
            found = file_from_dirs(f"{relative}/index.html", public_dirs)
            if found is not None:
                return found
        return frontend(catalog, relative)

    def website_static(relative: str = ""):
        relative = relative.strip("/")
        if not relative or relative.endswith("/"):
            relative = (relative + "index.html").lstrip("/")
        found = file_from_dirs(relative, website_dirs)
        if found is not None:
            return found
        # SPA/dir fallback: bare path without suffix → index.html in that folder
        if relative and "." not in Path(relative).name:
            found = file_from_dirs(f"{relative}/index.html", website_dirs)
            if found is not None:
                return found
        return JSONResponse({
            "detail": "Website asset missing",
            "path": relative or "/",
            "hint": "Submodul website/ (daniel-vitaltrainer-firebase) auschecken; Homepage unter /website/",
        }, status_code=404)

    @app.api_route("/website", methods=["GET", "HEAD"])
    @app.api_route("/website/", methods=["GET", "HEAD"])
    async def website_root():
        return website_static("index.html")

    @app.api_route("/website/{path:path}", methods=["GET", "HEAD"])
    async def website_path(path: str):
        # Vitaltrainer-Landing ist eine eigene Site im website/-Baum (neben vitalos/…).
        # Kein Redirect auf /website/ — Hash bleibt unter /website/vitaltrainer#…
        if path.strip("/") in {"vitaltrainer", "vitaltrainer/index.html"}:
            return website_static("index.html")
        return website_static(path)

    # Klienten-UI nur unter /k/<slug>/ — nie als Root-Slug (sonst /fuel/ → „Klient nicht gefunden").
    @app.api_route("/k/{client_id}", methods=["GET", "HEAD"])
    @app.api_route("/k/{client_id}/", methods=["GET", "HEAD"])
    async def client_entry(client_id: str, request: Request):
        if "." in client_id:
            return JSONResponse({"detail": "Not found"}, status_code=404)
        from coach_local_plans import local_only, clients_root, plans_module
        local_only(request)
        try:
            plans_module.LocalPlans(clients_root()).client(client_id)
        except plans_module.PlanError as error:
            return JSONResponse({"detail": str(error)}, status_code=error.status)
        return spa_document(legacy_ui(), "klienten.html", "/_klienten/")

    @app.api_route("/{segment}", methods=["GET", "HEAD"])
    @app.api_route("/{segment}/", methods=["GET", "HEAD"])
    async def hub_or_public_segment(segment: str):
        # Asset-Dateien und Hub-Zentren (fuel/, jobs/, …) — kein Klienten-Lookup.
        if "." in segment:
            return public_or_catalog(segment)
        if segment == "portal":
            return public_or_catalog("portal.html")
        if segment in {"website", "vitaltrainer"}:
            return website_static("index.html")
        found = file_from_dirs(segment, public_dirs) or file_from_dirs(f"{segment}/index.html", public_dirs)
        if found is not None:
            return found
        return JSONResponse({"detail": "Not found"}, status_code=404)

    @app.api_route("/{path:path}", methods=["GET", "HEAD"])
    async def index(path: str):
        return public_or_catalog(path)

    return app


if __name__ != "__main__":
    app = create_app()

if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=os.environ.get("COACH_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("COACH_PORT", "9150")))
    # Alias default 8788 (ehem. vital-hub); COACH_ALIAS_PORT=0 schaltet ab.
    parser.add_argument("--alias-port", type=int, default=int(os.environ.get("COACH_ALIAS_PORT", "8788")))
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()
    os.environ["COACH_PORT"] = str(args.port)
    alias = args.alias_port if args.alias_port and args.alias_port != args.port else 0
    if alias:
        os.environ["COACH_ALIAS_PORT"] = str(alias)
    else:
        os.environ.pop("COACH_ALIAS_PORT", None)

    if args.reload or not alias:
        uvicorn.run("server:app", host=args.host, port=args.port, reload=args.reload, app_dir=str(ROOT))
    else:
        # Gleiche App auf :9150 und ehem. Hub-Port :8788 (vital-hub.service aus).
        async def _serve_both() -> None:
            app_obj = create_app()
            servers = [
                uvicorn.Server(uvicorn.Config(app_obj, host=args.host, port=args.port, log_level="info")),
                uvicorn.Server(uvicorn.Config(app_obj, host=args.host, port=alias, log_level="info")),
            ]
            await asyncio.gather(*(server.serve() for server in servers))

        asyncio.run(_serve_both())
