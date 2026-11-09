from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.api.deps import get_registry, get_settings
from backend.api.schemas import SyncPullRequest, SyncPullResult, SyncPullUid
from backend.core.clients import Client
from backend.core.settings import Settings
from backend.sync import logread
from backend.sync.lock import AlreadyRunning
from backend.sync.runner import resolve_targets, run_pull

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/pull", response_model=SyncPullResult)
def pull(req: SyncPullRequest, settings: Settings = Depends(get_settings),
         registry: dict[str, Client] = Depends(get_registry)):
    """Firestore → lokal für die gewählten UIDs (läuft im Threadpool; ein schreibender Lauf zur Zeit)."""
    uids = resolve_targets(req.uids, req.clients, registry)
    if not uids:
        raise HTTPException(422, "keine UIDs: uids angeben oder clients=true setzen")
    try:
        outcome = run_pull(root=settings.data_root, uids=uids, registry=registry,
                           notify_=req.notify, dry_run=req.dry_run)
    except AlreadyRunning:
        raise HTTPException(409, "ein Pull läuft bereits") from None
    return SyncPullResult(
        dry_run=req.dry_run, errors=outcome.errors,
        results=[SyncPullUid(uid=r.uid, **{k: v for k, v in r.counts.items() if k in SyncPullUid.model_fields})
                 for r in outcome.reports])


@router.get("/log")
def log(settings: Settings = Depends(get_settings), limit: int = Query(100, ge=1, le=1000),
        event: str | None = None, uid: str | None = None, action: str | None = None, level: str | None = None):
    """Strukturierte Sync-Events (JSONL), neueste zuletzt."""
    return logread.read_events(settings.log_dir, limit=limit, event=event, uid=uid, action=action, level=level)


@router.get("/status")
def status(settings: Settings = Depends(get_settings)):
    """Läuft der Sync-Daemon? (Status-Datei + PID-Prüfung, Zähler, letzte Aktivität)"""
    return logread.daemon_status(settings.data_root)
