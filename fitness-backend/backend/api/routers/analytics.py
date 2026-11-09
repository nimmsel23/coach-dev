from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from backend.api.deps import get_store, valid_uid
from backend.core.store import SessionStore
from backend.services import analytics

router = APIRouter(prefix="/users/{uid}/analytics", tags=["analytics"])


@router.get("/weekly")
def weekly(request: Request, uid: str, week: str = Query("current", description="current oder YYYY-Www"),
           store: SessionStore = Depends(get_store)):
    return analytics.weekly(store, valid_uid(uid, request), week)


@router.get("/coverage")
def coverage(request: Request, uid: str, date_from: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
             date_to: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"), store: SessionStore = Depends(get_store)):
    return analytics.coverage_for_range(store, valid_uid(uid, request), date_from, date_to)
