from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Query, Request
from fastapi.responses import JSONResponse

from backend.api.deps import get_store, valid_uid
from backend.api.schemas import SessionSummary
from backend.core.store import SessionStore
from backend.services import sessions as svc

router = APIRouter(prefix="/users/{uid}/sessions", tags=["sessions"])


def _uid(uid: str, request: Request) -> str:
    return valid_uid(uid, request)


@router.get("", response_model=list[SessionSummary],
            responses={200: {"description": "Mit `full=true`: komplette Sessions (inkl. `doc_id`) statt Zusammenfassungen."}})
def list_sessions(request: Request, uid: str, limit: int = Query(50, ge=1, le=500),
                  since: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
                  full: bool = Query(False, description="komplette Sessions statt Zusammenfassungen (vermeidet N+1)"),
                  store: SessionStore = Depends(get_store)):
    items = svc.list_sessions(store, _uid(uid, request), limit=limit, since=since, full=full)
    return JSONResponse(items) if full else items       # full umgeht response_model (freie Session-Felder)


@router.get("/{doc_id}")
def get_session(request: Request, uid: str, doc_id: str, store: SessionStore = Depends(get_store)):
    return svc.get_session(store, _uid(uid, request), doc_id)


@router.put("/{doc_id}")
def put_session(request: Request, uid: str, doc_id: str, body: dict[str, Any] = Body(...),
                store: SessionStore = Depends(get_store)):
    """Speichert die Session. `rev` im Body = Basis-Revision; Abweichung → 409."""
    return svc.save_session(store, _uid(uid, request), doc_id, body)


@router.delete("/{doc_id}")
def delete_session(request: Request, uid: str, doc_id: str, rev: int | None = Query(None, description="erwartete Basis-Revision (409 bei Abweichung)"),
                   store: SessionStore = Depends(get_store)):
    """Löscht lokal (Papierkorb + Tombstone, damit der Pull sie nicht wiederherstellt). Firestore bleibt unberührt."""
    return svc.delete_session(store, _uid(uid, request), doc_id, expected_rev=rev)
