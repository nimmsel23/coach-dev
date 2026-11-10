"""FastAPI router for anatomy-specific enrichment actions.

This keeps the HTTP namespace `/fitness/anatomy/*`, but writes through the
catalog SSOT (`fitness.catalog.muscles_store`). It replaces the old
`anatomy-kb` muscle-enrichment endpoint without reintroducing a second data
home beside `fitness/catalog/kb`.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from loguru import logger

from fitness.anatomy import gemini as anatomy_gemini
from fitness.anatomy import resolve as anatomy_resolve
from fitness.catalog import muscles_store

router = APIRouter(prefix="/fitness/anatomy")


@router.post("/muscles/enrich")
async def enrich_muscle(muscle_id: str, force: bool = False):
    """Füllt origin/insertion/innervation/function via Gemini, wenn leer (oder force=True)."""
    canonical_id = muscle_id if muscles_store.load_muscle(muscle_id) else anatomy_resolve.canonical_id(muscle_id)
    doc = muscles_store.load_muscle(canonical_id) if canonical_id else None
    if doc is None:
        logger.warning(f"enrich_muscle: Muskel nicht gefunden: {muscle_id}")
        raise HTTPException(404, detail=f"Muskel nicht gefunden: {muscle_id}")

    if doc.get("origin") and not force:
        logger.debug(f"enrich_muscle: {canonical_id} schon angereichert, übersprungen")
        return {"ok": True, "skipped": True, "reason": "already_enriched", "muscle_id": doc.get("id") or canonical_id}

    api_key, model = anatomy_gemini.load_env()
    if not api_key:
        logger.error("enrich_muscle: GEMINI_API_KEY fehlt in ~/.env/fitness.env")
        raise HTTPException(500, detail="GEMINI_API_KEY fehlt in ~/.env/fitness.env")

    target_id = doc.get("id") or canonical_id or muscle_id
    latin = doc.get("label_lat") or doc.get("display_name") or target_id
    prompt = anatomy_gemini.MUSCLE_PROMPT.format(latin=latin, muscle_id=target_id)

    response = anatomy_gemini.call_with_fallback(
        prompt, api_key, model,
        on_fallback=lambda m: logger.warning(f"enrich_muscle {target_id}: Fallback auf {m}"),
    )
    if not response:
        logger.error(f"enrich_muscle {target_id}: Gemini-Aufruf fehlgeschlagen (alle Fallback-Modelle)")
        raise HTTPException(502, detail="Gemini-Aufruf fehlgeschlagen (alle Fallback-Modelle)")

    parsed = anatomy_gemini.parse_response(response)
    if not parsed.get("origin"):
        logger.error(f"enrich_muscle {target_id}: Gemini-Antwort ohne 'origin' — YAML-Parse vermutlich fehlgeschlagen")
        raise HTTPException(502, detail="Gemini-Antwort ohne 'origin' — YAML-Parse vermutlich fehlgeschlagen")

    path, _ = muscles_store.update_muscle(target_id, parsed, force=force)
    logger.success(f"enrich_muscle {target_id} → {path}")
    return {"ok": True, "muscle_id": target_id, "path": str(path), "data": parsed}
