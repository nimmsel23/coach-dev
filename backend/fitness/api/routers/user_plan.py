from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from fitness.api.deps import get_registry, get_store, valid_uid
from fitness.core.clients import Client
from fitness.core.store import SessionStore
from fitness.services import plan

router = APIRouter(prefix="/users/{uid}/plan", tags=["plan"])


@router.get("/today")
def plan_today(request: Request, uid: str, date: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
               store: SessionStore = Depends(get_store), registry: dict[str, Client] = Depends(get_registry)):
    """Nächste Einheit nach der zuletzt geloggten (Rotation); ohne Plan Wochentags-Fallback."""
    uid = valid_uid(uid, request)
    try:
        return plan.today(store, uid, is_coach=bool(registry.get(uid) and registry[uid].is_coach), day=date)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
