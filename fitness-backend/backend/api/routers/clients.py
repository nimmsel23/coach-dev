from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.api.deps import get_registry, get_store
from backend.api.schemas import ClientOut
from backend.core.clients import Client
from backend.core.store import SessionStore

router = APIRouter(tags=["clients"])


@router.get("/clients", response_model=list[ClientOut])
def list_clients(registry: dict[str, Client] = Depends(get_registry), store: SessionStore = Depends(get_store)):
    """Klienten aus ~/Klienten (je UID eine Zeile) mit Kurzstatistik aus den Session-Dateinamen."""
    rows = []
    for uid, c in registry.items():
        ids = store.list_ids(uid)
        rows.append(ClientOut(uid=uid, name=c.name, slug=c.slug, is_coach=c.is_coach, sessions=len(ids),
                              last_session_date=max((i.split("__")[0] for i in ids), default=None)))
    return sorted(rows, key=lambda r: (r.is_coach, r.name.lower()))
