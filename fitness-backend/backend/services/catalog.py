"""Übungskatalog-Service (Fassade): lokale Experten-KB + yuhonas direkt, siehe backend.catalog."""
from __future__ import annotations

from backend.catalog import yuhonas
from backend.catalog.view import ExerciseNotFound, get, search
from backend.catalog.yuhonas import YuhonasUnavailable, resolve_image

__all__ = ["ExerciseNotFound", "YuhonasUnavailable", "get", "search", "resolve_image", "status"]


def status() -> dict:
    """Zustand der yuhonas-Quelle (verfügbar, Pfad, Anzahl) — für Health/Diagnose."""
    return yuhonas.status()
