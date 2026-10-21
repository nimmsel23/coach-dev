#!/usr/bin/env python3
"""Coach backend on port 9150: domain APIs, Catalog UI and Coach SPA."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, StreamingResponse
from starlette.background import BackgroundTask

ROOT = Path(__file__).resolve().parent
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
        if url.scheme not in ("http", "https") or not url.host or url.path != "/" or url.query or url.fragment or url.username or url.password:
            raise ValueError(f"Backend {name} must be an HTTP(S) origin without credentials")
        if url.host in ("localhost", "127.0.0.1", "::1", "0.0.0.0") and url.port == int(os.environ.get("COACH_PORT", "9150")):
            raise ValueError(f"Backend {name} points back to Coach; choose a separate domain worker port")
        urls[name] = url
    if "fitness" not in urls:
        raise ValueError("The fitness backend is required for legacy Catalog UI routes")
    return urls


def create_app(*, catalog_directory: Path | None = None, coach_directory: Path | None = None,
               upstream_url: str | None = None, backend_urls: dict[str, str] | None = None,
               transport=None) -> FastAPI:
    catalog = (catalog_directory or catalog_dist()).resolve()
    coach = (coach_directory or ROOT / "dist-coach").resolve()
    overrides = dict(backend_urls or {})
    if upstream_url:
        overrides["fitness"] = upstream_url
    backends = configured_backends(overrides)

    @asynccontextmanager
    async def lifespan(app):
        async with httpx.AsyncClient(timeout=60, follow_redirects=False, trust_env=False, transport=transport) as client:
            app.state.api_client = client
            yield

    app = FastAPI(title="Coach backend", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

    app.state.backends = backends

    @app.get("/health")
    @app.get("/_coach/health")
    async def health():
        return {"ok": True, "service": "coach", "port": int(os.environ.get("COACH_PORT", "9150")),
                "backends": {name: str(url) for name, url in backends.items()},
                "catalog_ready": (catalog / "index.html").is_file(),
                "coach_ready": (coach / "index.html").is_file()}

    @app.get("/_coach/backends")
    async def backend_health(request: Request):
        async def check(name, origin):
            try:
                response = await request.app.state.api_client.get(origin.copy_with(path="/health"), timeout=3)
                ready = response.is_success
                return name, {"ready": ready, "status": response.status_code}
            except httpx.RequestError:
                return name, {"ready": False, "status": None}
        statuses = dict(await asyncio.gather(*(check(name, origin) for name, origin in backends.items())))
        return {"ok": all(value["ready"] for value in statuses.values()), "backends": statuses}

    async def proxy(request: Request, backend: str, strip_segments: int = 0):
        upstream = backends[backend]
        raw_path = request.scope["raw_path"]
        if strip_segments:
            parts = raw_path.split(b"/", strip_segments + 1)
            raw_path = b"/" + (parts[-1] if len(parts) > strip_segments + 1 else b"")
        # Keep the fixed domain origin, encoded suffix, query, body and method.
        url = upstream.copy_with(raw_path=raw_path + (b"?" + request.scope["query_string"] if request.scope["query_string"] else b""))
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

    # Explicit domains precede the compatibility /api catch-all.
    for name in backends:
        for prefix in (f"/api/{name}", f"/{name}-api"):
            endpoint = domain_proxy(name, prefix.count("/"))
            app.add_api_route(prefix, endpoint, methods=METHODS)
            app.add_api_route(f"{prefix}/{{path:path}}", endpoint, methods=METHODS)

    for prefix in API_PREFIXES:
        endpoint = domain_proxy("fitness")
        app.add_api_route(f"/{prefix}", endpoint, methods=METHODS)
        app.add_api_route(f"/{prefix}/{{path:path}}", endpoint, methods=METHODS)

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

    @app.api_route("/{path:path}", methods=["GET", "HEAD"])
    async def index(path: str):
        return frontend(catalog, path)

    return app


if __name__ != "__main__":
    app = create_app()

if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=os.environ.get("COACH_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("COACH_PORT", "9150")))
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()
    os.environ["COACH_PORT"] = str(args.port)
    uvicorn.run("server:app", host=args.host, port=args.port, reload=args.reload, app_dir=str(ROOT))
