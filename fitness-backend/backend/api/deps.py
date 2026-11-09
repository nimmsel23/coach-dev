"""Abhängigkeiten der Router."""
from __future__ import annotations

from fastapi import HTTPException, Request

from backend.core.clients import Client, load_clients
from backend.core.settings import Settings
from backend.core.store import InvalidDocId, SessionStore, check_doc_id


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_store(request: Request) -> SessionStore:
    return request.app.state.store


def get_registry(request: Request) -> dict[str, Client]:
    return load_clients(request.app.state.settings.klienten_dir)


def valid_uid(uid: str, request: Request) -> str:
    """UID als Pfadsegment validieren und prüfen, dass der Nutzer bekannt ist."""
    try:
        check_doc_id(uid)
    except InvalidDocId:
        raise HTTPException(422, f"ungültige UID: {uid!r}") from None
    store: SessionStore = request.app.state.store
    if uid not in get_registry(request) and not store.sessions_dir(uid).is_dir():
        raise HTTPException(404, f"unbekannte UID: {uid}")
    return uid
