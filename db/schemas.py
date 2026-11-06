"""
Pydantic Response-Schemas für den FastAPI server.py.

Verwendet als response_model= in den Endpoints — FastAPI validiert und
serialisiert automatisch, OpenAPI-Docs werden daraus generiert (/docs).
"""
from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


# ── Primitives ────────────────────────────────────────────────────────────────

class OkResponse(BaseModel):
    ok: bool


class HealthResponse(BaseModel):
    ok: bool
    port: int
    runtime: str
    env: str


# ── Session ───────────────────────────────────────────────────────────────────

class ExerciseItem(BaseModel):
    exercise_id: str = ""
    id: str = ""
    name: str = ""
    # DEPRECATED — nur Backward-Compat-Lesen alter Sessions, die diese Felder
    # noch befüllt hatten. setsArray ist die alleinige Quelle der Wahrheit für
    # neue Writes; server.mjs/sync_gateway.py schreiben sets/reps/weight NICHT
    # mehr direkt (das führte zu 57/116 Zero-Value-Zeilen in training_history,
    # weil diese Felder in echten Sessions leer blieben).
    sets: str | int = ""
    reps: str | int = ""
    weight: str | float = ""
    rpe: int = 0
    note: str = ""
    done: bool = False
    isHIT: bool = False
    primaryMuscles: list[str] = Field(default_factory=list)
    secondaryMuscles: list[str] = Field(default_factory=list)
    stabilizers: list[str] = Field(default_factory=list)
    setsArray: list[dict[str, Any]] = Field(default_factory=list)

    model_config = {"extra": "allow"}  # Session-JSONs haben variable Felder


class SessionData(BaseModel):
    date: str = ""
    block: str = ""
    exercises: list[ExerciseItem] = Field(default_factory=list)
    effort: int | str = ""
    mood: str = ""
    notes: str = ""
    location: str = ""
    duration: str | int = ""
    saved_at: str = ""
    snapshot_version: int = 0
    # Monoton hochzählende Revision, serverseitig verwaltet (server.mjs::
    # freezeSnapshot, fitness/api/config.py::_freeze_snapshot). Ersetzt den
    # saved_at-String-Vergleich als Basis für Firestore-Konfliktauflösung
    # (siehe firestore/mirror.py::on_session) — robust gegen Client-Uhr-Drift.
    # Fehlt das Feld (alte Sessions), gilt rev=0 (Pydantic-Default deckt das ab).
    rev: int = 0

    model_config = {"extra": "allow"}


class SessionResponse(BaseModel):
    ok: bool
    session: dict[str, Any] | None = None
    date: str = ""


class SessionListItem(BaseModel):
    id: str | None = None
    date: str
    block: str | None = None
    saved_at: str | None = None


class SessionHistoryResponse(BaseModel):
    ok: bool
    sessions: list[dict[str, Any]]


# ── Journal ───────────────────────────────────────────────────────────────────

class JournalResponse(BaseModel):
    ok: bool
    content: str
    mtime: float


# ── Body ──────────────────────────────────────────────────────────────────────

class BodyEntry(BaseModel):
    date: str
    weight_kg: float | None = None
    bmi: float | None = None
    steps: int | None = None
    sleep_h: float | None = None
    hr_resting: int | None = None

    model_config = {"extra": "allow"}


class BodyResponse(BaseModel):
    ok: bool
    entries: list[BodyEntry]


# ── Exercises ─────────────────────────────────────────────────────────────────

class ExerciseSearchResult(BaseModel):
    exercise_id: str
    display_name: str
    source: str = ""
    score: float = 0.0
    primary_muscles: list[str] = Field(default_factory=list)
    secondary_muscles: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)

    model_config = {"extra": "allow"}


class ExerciseSearchResponse(BaseModel):
    ok: bool
    results: list[ExerciseSearchResult]
    total: int = 0


# ── Coverage ──────────────────────────────────────────────────────────────────

class CoverageMuscle(BaseModel):
    id: str
    name_en: str
    name_de: str = ""
    totalScore: float


class CoverageDetailedResponse(BaseModel):
    ok: bool
    days: int
    muscles: list[CoverageMuscle]


class AnatomyMuscle(BaseModel):
    id: str = ""
    name_en: str = ""
    primaryHits: float = 0.0
    secondaryHits: float = 0.0
    totalScore: float = 0.0


class CoverageAnatomyResponse(BaseModel):
    ok: bool
    days: int
    muscles: list[AnatomyMuscle]


class CoverageGapsResponse(BaseModel):
    ok: bool
    days: int
    gaps: list[CoverageMuscle]


# ── Muscles ───────────────────────────────────────────────────────────────────

class MuscleInfo(BaseModel):
    muscle_id: str = ""
    name_de: str = ""
    name_en: str = ""
    latin: str = ""
    group: str = ""
    rbh_slugs: list[str] = Field(default_factory=list)
    is_front: bool | None = None

    model_config = {"extra": "allow"}


class MusclesResponse(BaseModel):
    ok: bool
    muscles: list[MuscleInfo]


# ── Sync Gateway ──────────────────────────────────────────────────────────────

class SyncRequest(BaseModel):
    date: str
    session: dict[str, Any]
    session_id: str | None = None
    uid: str = "default"


class SyncResponse(BaseModel):
    ok: bool
    synced: int = 0
    date: str = ""


# ── Coach ─────────────────────────────────────────────────────────────────────

class CoachFeedItem(BaseModel):
    id: str
    userId: str
    date: str
    exercises: list[dict[str, Any]] = Field(default_factory=list)
    effort: Any = None
    mood: str = ""
    notes: str = ""
    coachFeedback: str = ""
    type: str = "workout"

    model_config = {"extra": "allow"}


class CoachFeedResponse(BaseModel):
    ok: bool
    feed: list[CoachFeedItem]


class CoachProfile(BaseModel):
    displayName: str
    uid: str


class CoachProfilesResponse(BaseModel):
    ok: bool
    profiles: dict[str, CoachProfile]


class CoachFeedbackRequest(BaseModel):
    userId: str
    sessionId: str
    text: str

