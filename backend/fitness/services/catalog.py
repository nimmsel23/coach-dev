"""Übungskatalog-Service (Fassade): lokale Experten-KB + yuhonas direkt, siehe fitness.catalog_runtime."""
from __future__ import annotations

from fitness.catalog_runtime import yuhonas
from fitness.catalog_runtime.view import ExerciseNotFound, get, search
from fitness.catalog_runtime.yuhonas import YuhonasUnavailable, resolve_image

__all__ = ["ExerciseNotFound", "YuhonasUnavailable", "get", "search", "resolve_image", "status"]


def status() -> dict:
    """Zustand der yuhonas-Quelle (verfügbar, Pfad, Anzahl) — für Health/Diagnose."""
    return yuhonas.status()
