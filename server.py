#!/usr/bin/env python3
"""Local Coach HTTP server: Catalog UI, Coach SPA and the existing catalog API."""
from __future__ import annotations

import argparse
import os
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, StreamingResponse
from starlette.background import BackgroundTask

ROOT = Path(__file__).resolve().parent
API_PREFIXES = ("api", "fitness", "exercise", "exercises", "coverage", "health")
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


def create_app(*, catalog_directory: Path | None = None, coach_directory: Path | None = None,
               upstream_url: str | None = None, transport=None) -> FastAPI:
    catalog = (catalog_directory or catalog_dist()).resolve()
    coach = (coach_directory or ROOT / "dist-coach").resolve()
    upstream = httpx.URL(upstream_url or os.environ.get("COACH_API_URL", "http://127.0.0.1:9150"))
    if upstream.scheme not in ("http", "https") or not upstream.host or upstream.path != "/" or upstream.query or upstream.fragment:
        raise ValueError("COACH_API_URL must be an HTTP(S) origin, e.g. http://127.0.0.1:9150")

    @asynccontextmanager
    async def lifespan(app):
        async with httpx.AsyncClient(timeout=60, follow_redirects=False, trust_env=False, transport=transport) as client:
            app.state.api_client = client
            yield

    app = FastAPI(title="Coach local server", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

    @app.get("/_coach/health")
    async def health():
        return {"ok": True, "service": "coach", "api": str(upstream),
                "catalog_ready": (catalog / "index.html").is_file(),
                "coach_ready": (coach / "index.html").is_file()}

    async def proxy(request: Request):
        # Preserve path/query and the fixed upstream host; never redirect to a supplied URL.
        url = upstream.copy_with(raw_path=request.scope["raw_path"] + (b"?" + request.scope["query_string"] if request.scope["query_string"] else b""))
        headers = [(k, v) for k, v in end_to_end_headers(request.headers) if k.lower() != "host"]
        outgoing = request.app.state.api_client.build_request(request.method, url, headers=headers, content=await request.body())
        try:
            response = await request.app.state.api_client.send(outgoing, stream=True)
        except httpx.RequestError:
            return JSONResponse({"detail": "Catalog API unavailable", "upstream": str(upstream)}, status_code=502)
        result = StreamingResponse(response.aiter_raw(), status_code=response.status_code,
                                   background=BackgroundTask(response.aclose))
        result.raw_headers = [(k.encode("latin-1"), v.encode("latin-1")) for k, v in end_to_end_headers(response.headers)]
        return result

    for prefix in API_PREFIXES:
        app.add_api_route(f"/{prefix}", proxy, methods=METHODS)
        app.add_api_route(f"/{prefix}/{{path:path}}", proxy, methods=METHODS)

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


app = create_app()

if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=os.environ.get("COACH_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("COACH_PORT", "5903")))
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()
    uvicorn.run("server:app", host=args.host, port=args.port, reload=args.reload, app_dir=str(ROOT))
