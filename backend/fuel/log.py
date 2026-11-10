"""Centralized loguru setup for fuel modules.

Logs to stderr (stdout bleibt clean für JSON-Output von gemini-nutrition).
Level via env: AOS_FUEL_LOG_LEVEL=DEBUG|INFO|WARNING|ERROR  (default WARNING).
"""

from __future__ import annotations

import os
import sys

from loguru import logger

_CONFIGURED = False


def setup(level: str | None = None) -> None:
    """Idempotent: konfiguriert loguru einmalig auf stderr."""
    global _CONFIGURED
    if _CONFIGURED:
        return
    target_level = (level or os.environ.get("AOS_FUEL_LOG_LEVEL", "WARNING")).upper()
    logger.remove()
    logger.add(
        sys.stderr,
        level=target_level,
        format="<level>{level: <7}</level> <cyan>{name}</cyan> | {message}",
        colorize=True,
    )
    _CONFIGURED = True


setup()
