"""Facade barrel for the exercise-related HTTP surface.

This module stays as the single import target for `fitness.api.main`, while the
actual route implementations are split by responsibility into catalog,
teaching, muscles, and inbox modules.

Important architecture note:
- `/fitness/anatomy/*` may exist as an HTTP namespace for anatomy-specific
  actions.
- The underlying SSOT for muscles and anatomy teaching still lives in the
  catalog KB (`fitness/catalog/kb/...`).
- Write-capable muscle KB logic therefore belongs to `fitness.catalog.*`, not
  to a separate long-lived `fitness.anatomy` data layer.
"""

from fastapi import APIRouter

from fitness.api.routers.exercises_catalog import router as catalog_router
from fitness.api.routers.exercises_inbox import router as inbox_router
from fitness.api.routers.exercises_muscles import router as muscles_router
from fitness.api.routers.exercises_teaching import router as teaching_router

router = APIRouter()
router.include_router(catalog_router)
router.include_router(teaching_router)
router.include_router(muscles_router)
router.include_router(inbox_router)
