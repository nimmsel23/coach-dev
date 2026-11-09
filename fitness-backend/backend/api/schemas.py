"""Pydantic-Modelle für Ein-/Ausgaben, die eine feste Form brauchen."""
from __future__ import annotations

from pydantic import BaseModel, Field


class ClientOut(BaseModel):
    uid: str
    name: str
    slug: str
    is_coach: bool
    sessions: int
    last_session_date: str | None = None


class SessionSummary(BaseModel):
    doc_id: str
    date: str
    session_id: str | None = None
    session_mode: str | None = None
    block: str | None = None
    trainingsart: str | None = None
    exercises: int
    effort: int | float | str | None = None
    duration: str | None = None
    activity: dict | None = None
    rev: int
    saved_at: str | None = None


class SyncPullRequest(BaseModel):
    uids: list[str] = Field(default_factory=list, description="explizite Firebase-UIDs")
    clients: bool = Field(False, description="zusätzlich alle Klienten aus ~/Klienten (ohne Coach)")
    notify: bool = Field(False, description="Desktop-Meldung für eingehende Klienten-Workouts")
    dry_run: bool = Field(False, description="nur entscheiden und loggen, nichts schreiben/melden")


class SyncPullUid(BaseModel):
    uid: str
    angelegt: int = 0
    aktualisiert: int = 0
    übersprungen: int = 0
    nur_lokal: int = 0
    fehler: int = 0


class SyncPullResult(BaseModel):
    dry_run: bool
    errors: int
    results: list[SyncPullUid]
