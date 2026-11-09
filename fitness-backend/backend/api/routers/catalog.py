from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from backend.services import catalog

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/status")
def status():
    """Zustand der yuhonas-Quelle (Klon vorhanden? Pfad, Anzahl Einträge)."""
    return catalog.status()


@router.get("/exercises")
def search(q: str = Query("", description="Suchbegriff (ID, Name, Alias, Tag)"), limit: int = Query(12, ge=1, le=50)):
    return catalog.search(q, limit)


@router.get("/exercises/{exercise_id}")
def get_exercise(exercise_id: str):
    return catalog.get(exercise_id)


@router.get("/images/{path:path}")
def image(path: str):
    """yuhonas-Bilder direkt aus dem Klon (Pfad-Traversal wird in resolve_image abgewiesen)."""
    file = catalog.resolve_image(path)
    if file is None:
        raise HTTPException(404, "Bild nicht gefunden")
    return FileResponse(file, headers={"Cache-Control": "public, max-age=86400"})
