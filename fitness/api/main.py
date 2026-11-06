import os
import uvicorn
import typer
from typing_extensions import Annotated
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from loguru import logger

from fitness.api.config import (
    PORT, HOST, RUNTIME, _DIST_DIR, _CATALOG_DIST_DIR, _CATALOG_INDEX_HTML,
    close_httpx_client, Base, engine
)
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"fitness-dev Modular FastAPI Server :{PORT}")
    logger.info(f"runtime  {RUNTIME}")
    logger.info(f"db       {engine.url}")

    # Firestore on_snapshot-Watchers: Katalog-Belange (Inbox-Drafts + approved
    # kb/exercises) UND User-Data-Sync (Sessions/Journal/Habits/Nutrition/
    # Supplements) laufen beide eingebettet im API-Prozess. Bis 2026-08-06 lief
    # User-Data separat im fitness-firestore-daemon.service — die Trennung war
    # unbegründet (fitness-api ist "das" Python-Backend, nicht nur Catalog-UI)
    # und kostete einen zweiten Dauerprozess. Firebase-Creds fehlen im
    # Dev-Alltag oft (kein .env/firebase-fitness.json) — dann bewusst
    # überspringen statt den ganzen API-Server crashen zu lassen.
    #
    # FITNESS_SKIP_WATCHERS=1 (gesetzt von den Staging-/Prod-Units, :8100 und
    # :6100) startet bewusst KEINE Watcher: dieselbe fitness.api.main-App
    # laeuft dort ebenfalls, mit demselben live aus Dev verlinkten kb/ (siehe
    # deploy.sh). Ohne dieses Gate wuerden mehrere unabhaengige
    # Watcher-Instanzen (Dev :9150 + Staging :8100 + Prod :6100) auf dieselben
    # Firestore-Collections hoeren und in dieselben lokalen Dateien schreiben -
    # genau das Multi-Writer-Problem, das diese Session an anderer Stelle schon
    # beheben musste. Nur eine Instanz soll Nutzerdaten (Sessions/Journal/Habits)
    # spiegeln: seit 2026-10-29 ausschließlich Staging (:8100) per
    # FITNESS_SYNC_OWNER=1 — Dev (:9150/:9100) und Prod synchronisieren nie.
    # Hintergrund: Dev ist seit dem Umbau auf coach-api/coach-sync (2026-10-21)
    # kein Sync-Prozess mehr; dadurch landeten keine Sessions mehr lokal und
    # Core4 (sync/workouts.py) sah keine Workouts. Katalog/Inbox/Enrichment
    # gehören weiter coach-sync (external_worker_active()).
    # Bewusst ein eigenes Flag statt FITNESS_ENV=prod zu ueberladen — Watcher-
    # Besitz (hier) und Prod-Kontext (run_kb_sync()-Guard) sind zwei getrennte
    # Fragen, auch wenn beide aktuell nur auf der Prod-Unit zusammenfallen.
    watchers = []
    fs_observers = []
    enrichment_observer = enrichment_loop_thread = enrichment_stop_event = None
    coach_bridge_thread = coach_bridge_stop = None
    from fitness.coach.sync import external_worker_active

    sync_owner = os.environ.get("FITNESS_SYNC_OWNER") == "1"

    if os.environ.get("FITNESS_SKIP_WATCHERS") == "1":
        logger.info("FITNESS_SKIP_WATCHERS=1 — Firestore-/Enrichment-Watcher übersprungen (laufen nur in Dev, :9150).")
    elif external_worker_active():
        logger.info("coach-sync.service läuft — Katalog-Listener, Coach-Bridge und Enrichment-Watcher übersprungen (nur ein Worker).")
    else:
        try:
            from fitness.firestore.mirror import start_catalog_watchers
            watchers = start_catalog_watchers()
        except Exception as e:
            logger.warning(f"Firestore-Watchers nicht gestartet: {e}")
        try:
            from fitness.firestore.coach_bridge import start_coach_bridge
            coach_bridge_thread, coach_bridge_stop = start_coach_bridge()
        except Exception as e:
            logger.warning(f"Coach Firebase bridge nicht gestartet: {e}")

        # Gemini-Enrichment-Watcher (vormals eigener fitness-enricher.service):
        # embedded statt eigenständiger systemd-Unit, analog zu den Firestore-
        # Watchern oben — ein Prozess weniger, kein zusätzlicher Lifecycle zu
        # pflegen. Inbox-Observer + Analytics-Loop laufen in eigenen Threads,
        # blockieren den FastAPI-Event-Loop nicht (siehe start_enrichment_watcher()).
        try:
            from fitness.catalog.api.watcher import start_enrichment_watcher
            enrichment_observer, enrichment_loop_thread, enrichment_stop_event = start_enrichment_watcher()
        except Exception as e:
            logger.warning(f"Enrichment-Watcher nicht gestartet: {e}")

        # Lokaler Filesystem-Watcher für kb/muscles/-YAMLs (Katalog, kein Nutzerdaten-Sync),
        # siehe fitness/catalog/api/muscle_watcher.py. Der Session-JSON-Watcher
        # (local_watch.py) gehört zum Sync-Besitzer, siehe unten.
        try:
            from fitness.catalog.api.muscle_watcher import start_muscle_kb_watcher
            fs_observers.append(start_muscle_kb_watcher())
        except Exception as e:
            logger.warning(f"Muscle-KB-Filesystem-Watcher nicht gestartet: {e}")

    if sync_owner:
        # Einziger Nutzerdaten-Sync (Staging): Firestore → lokal (Sessions/Journal/Habits,
        # Ziel ~/.aos/users/<uid>/fitness/ — von dort loggt Core4 Fitness automatisch)
        # und lokale Session-JSONs → Firestore (watchdog, siehe local_watch.py).
        try:
            from fitness.firestore.mirror import start_userdata_watchers
            watchers += start_userdata_watchers()
        except Exception as e:
            logger.warning(f"Nutzerdaten-Watcher nicht gestartet: {e}")
        try:
            from fitness.firestore.local_watch import start_session_file_watcher
            fs_observers.append(start_session_file_watcher())
        except Exception as e:
            logger.warning(f"Session-Filesystem-Watcher nicht gestartet: {e}")
        logger.info("FITNESS_SYNC_OWNER=1 — dieser Prozess ist der einzige Nutzerdaten-Sync.")

    yield

    if coach_bridge_stop is not None:
        coach_bridge_stop.set()
        coach_bridge_thread.join(timeout=10)

    for w in watchers:
        try:
            w.unsubscribe()
        except Exception:
            pass
    for obs in fs_observers:
        try:
            obs.stop()
            obs.join()
        except Exception:
            pass
    if enrichment_stop_event is not None:
        enrichment_stop_event.set()
        enrichment_observer.stop()
        enrichment_observer.join()
    await close_httpx_client()

app = FastAPI(
    title="fitness-dev Modular Backend API",
    version="3.0.0",
    description="Refactored modular FastAPI backend for AlphaOS Fitness Ecosystem.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(sessions_router)
app.include_router(journal_router)
app.include_router(exercises_router)
app.include_router(coaching_router)
app.include_router(coach_plans_router)
app.include_router(macrocycles_router)
app.include_router(workouts_router)
# Relative /api clients; legacy direct paths remain available to existing consumers.
app.include_router(macrocycles_router, prefix="/api")
app.include_router(workouts_router, prefix="/api")
app.include_router(system_router)
app.include_router(coaching_notes_router)
app.include_router(anatomy_router)
app.include_router(sixpack_photos_router)

# ═══════════════════════════════════════════════════════════════════════════════
# DUAL FRONTEND ROUTING SYSTEM (Multi-SPA Architecture)
# ═══════════════════════════════════════════════════════════════════════════════
# In FastAPI werden HTTP-Routen strikt in der Reihenfolge ausgewertet, in der
# sie registriert werden.
#
# Hier servieren wir 2 verschiedene Frontends über denselben Port (9150):
# 1. Standalone Catalog-UI (/catalog-ui) -> Serviert aus fitness/catalog/dist
# 2. Main Fitness SPA (/, /#coach, etc.) -> Catch-all Fallback aus dist/
# ═══════════════════════════════════════════════════════════════════════════════

# ── 1. Standalone Catalog UI Handler (/catalog-ui) ────────────────────────────
if _CATALOG_DIST_DIR.exists():
    logger.info(f"catalog-ui available at /catalog-ui -> {_CATALOG_DIST_DIR}")
    
    # Mount für Assets der Catalog-UI (z.B. JS/CSS Bündel in /catalog-ui/assets/...)
    if (_CATALOG_DIST_DIR / "assets").exists():
        app.mount("/catalog-ui/assets", StaticFiles(directory=str(_CATALOG_DIST_DIR / "assets")), name="catalog-ui-assets")

    from fastapi.responses import FileResponse

    @app.get("/catalog-ui")
    @app.get("/catalog-ui/{subpath:path}")
    async def serve_catalog_ui(subpath: str = ""):
        """
        Liefert direkt die isolierte Catalog-UI zurück.
        Statische Dateien (z.B. favicon, icons) innerhalb von catalog/dist/ werden direkt geliefert,
        ansonsten schlägt das Fallback auf catalog/dist/index.html an.
        """
        if not _CATALOG_INDEX_HTML.exists():
            return JSONResponse({"error": "Catalog UI index.html not found"}, status_code=404)
        
        if subpath:
            candidate = _CATALOG_DIST_DIR / subpath
            if candidate.exists() and candidate.is_file():
                return FileResponse(str(candidate))
                
        return FileResponse(str(_CATALOG_INDEX_HTML))

# ── 2. Main Fitness SPA Setup (Vite /dist or fallback to /public) ─────────────
_PUBLIC_DIR = _DIST_DIR.parent / "public"
_STATIC_DIR = _DIST_DIR if (_DIST_DIR / "index.html").exists() else _PUBLIC_DIR
_INDEX_HTML = _STATIC_DIR / "index.html"

logger.info(f"serving main SPA static files from: {_STATIC_DIR}")

if (_STATIC_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(_STATIC_DIR / "assets")), name="assets")
if (_STATIC_DIR / "lib").exists():
    app.mount("/lib", StaticFiles(directory=str(_STATIC_DIR / "lib")), name="lib")

@app.get("/v1")
def serve_v1():
    v1_file = _STATIC_DIR / "v1.html"
    if v1_file.exists():
        from fastapi.responses import FileResponse
        return FileResponse(str(v1_file))
    raise HTTPException(status_code=404, detail="Not Found")

# ── 3. Main SPA Catch-All Fallback ───────────────────────────────────────────
# Dieser Handler muss ganz am Ende stehen! Er fängt alle Pfade ab, die nicht von
# den API-Routern oder /catalog-ui bedient wurden, und gibt index.html der Haupt-App
# für clientseitiges (Hash-)Routing zurück.
@app.get("/{path:path}")
async def spa_fallback(path: str):
    if not _INDEX_HTML.exists():
        return JSONResponse({"error": "No index.html found. Please check dist/ or public/"}, status_code=503)
    from fastapi.responses import FileResponse
    candidate = _STATIC_DIR / path
    if candidate.exists() and candidate.is_file():
        return FileResponse(str(candidate))
    return FileResponse(str(_INDEX_HTML))


# ── CLI Runner ────────────────────────────────────────────────────────────────
cli = typer.Typer(add_completion=False)

@cli.command()
def serve(
    port: Annotated[int, typer.Option("--port", "-p", help="Port to bind")] = PORT,
    host: Annotated[str, typer.Option("--host", help="Host address to bind")] = HOST,
    reload: Annotated[bool, typer.Option("--reload", help="Enable uvicorn auto-reload")] = False,
):
    logger.info(f"fitness-dev FastAPI :{port}")
    uvicorn.run(
        "fitness.api.main:app",
        host=host,
        port=port,
        reload=reload,
        app_dir=str(_DIST_DIR.parent),
    )

@cli.command()
def status(
    port: Annotated[int, typer.Option("--port", "-p", help="Port des laufenden Servers")] = PORT,
):
    """Health-Check gegen den laufenden fitness-api-Prozess + Firestore-Verbindung."""
    import httpx
    from rich.console import Console
    from rich.table import Table

    console = Console()
    table = Table(title=f"fitness-api :{port}")
    table.add_column("Check")
    table.add_column("Status")

    try:
        r = httpx.get(f"http://127.0.0.1:{port}/health", timeout=2.0)
        r.raise_for_status()
        data = r.json()
        table.add_row("API /health", f"[green]ok[/green] (runtime={data.get('runtime')})")
    except Exception as e:
        table.add_row("API /health", f"[red]nicht erreichbar[/red] ({e})")

    try:
        from fitness.firestore.mirror import get_status as firestore_status
        fs = firestore_status()
        if fs.get("ok"):
            table.add_row("Firestore-Watcher", f"[green]ok[/green] (project={fs.get('project')})")
        else:
            table.add_row("Firestore-Watcher", "[yellow]keine Verbindung (Creds fehlen?)[/yellow]")
    except Exception as e:
        table.add_row("Firestore-Watcher", f"[red]Fehler[/red] ({e})")

    console.print(table)


def main():
    Base.metadata.create_all(engine)
    cli()

if __name__ == "__main__":
    main()
