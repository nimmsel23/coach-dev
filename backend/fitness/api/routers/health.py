from __future__ import annotations

from fastapi import APIRouter, Depends

from fitness.api.deps import get_settings
from fitness.core.settings import Settings

router = APIRouter(tags=["system"])


@router.get("/health")
def health(settings: Settings = Depends(get_settings)):
    return {"ok": True, "service": "fitness-backend", "data_root": str(settings.data_root),
            "loopback_only": settings.is_loopback}
