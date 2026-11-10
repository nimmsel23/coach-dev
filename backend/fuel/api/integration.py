"""Fuel-owned API router and initialization hook for composed FastAPI servers."""

import logging

from fastapi import APIRouter

from fuel.api.endpoints import fasting, food, frames, journal, nutrition_query, supplements, v3_proxy
from fuel.core.v3_backfill import backfill_from_v3_if_needed
from fuel.db.database import SessionLocal
from fuel.migrate import migrate

logger = logging.getLogger("uvicorn.error")

router = APIRouter()
router.include_router(food.router, prefix="/nutrition", tags=["Food"])
router.include_router(supplements.router, prefix="/supplements", tags=["Supplements"])
router.include_router(journal.router, prefix="/journal", tags=["Journal"])
router.include_router(nutrition_query.router, prefix="/nutrition", tags=["Nutrition Query"])
router.include_router(frames.router, prefix="/nutrition", tags=["Frames"])
router.include_router(fasting.router, prefix="/nutrition", tags=["Fasting"])
router.include_router(v3_proxy.router, prefix="/v3", tags=["v3 Proxy"])


@router.get("/health")
def health_check():
    return {"status": "ok"}


def initialize_fuel_backend() -> None:
    """Apply Fuel schema migrations and the existing safe v3 backfill."""
    migrate()
    with SessionLocal() as db:
        result = backfill_from_v3_if_needed(db)
    if any(result.values()):
        logger.info(
            "Fuel v4 backfill dates=%s created=%s updated=%s",
            result["dates_seen"], result["rows_created"], result["rows_updated"],
        )
