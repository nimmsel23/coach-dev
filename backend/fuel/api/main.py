import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fuel.api.integration import initialize_fuel_backend, router as fuel_router

@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_fuel_backend()
    yield


app = FastAPI(
    title="Fuel Tracker API",
    description="NLP-powered macro and supplement tracker",
    lifespan=lifespan,
)

app.include_router(fuel_router)

# Serve Frontend built assets
# frontend/ ist ins Nachbar-Repo ~/dev/fuel-frontend gewandert (FUEL_FRONTEND_DIR überschreibt).
FRONTEND_DIR = os.environ.get("FUEL_FRONTEND_DIR") or os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "fuel-frontend", "dist"
)

# Serve assets/ directly
@app.get("/assets/{file_path:path}")
def serve_assets(file_path: str):
    asset_file = os.path.join(FRONTEND_DIR, "assets", file_path)
    if os.path.exists(asset_file):
        return FileResponse(asset_file)
    raise HTTPException(status_code=404, detail="Asset not found")

# SPA catch-all route
@app.get("/{catchall:path}")
def serve_spa(catchall: str):
    # Check if the file exists in FRONTEND_DIR (e.g. favicon.ico, manifest.json)
    file_path = os.path.join(FRONTEND_DIR, catchall)
    if catchall and os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)
    
    # Fallback to index.html for SPA routing
    index_file = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"error": "Frontend build not found"}
