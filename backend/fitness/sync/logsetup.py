"""Logging: lesbare Konsole + strukturiertes JSONL (rotierend).

Jede Entscheidung pro Dokument ist ein Event mit festen Feldern
(event, uid, doc_id, action, reason, ...) — `fitsync logs` und jq können
darauf filtern.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from loguru import logger

_HUMAN = "<green>{time:HH:mm:ss}</green> <level>{level:<7}</level> {message}"


def _jsonl(record) -> str:
    payload = {
        "ts": record["time"].isoformat(),
        "level": record["level"].name,
        "msg": record["message"],
        **{k: v for k, v in record["extra"].items() if not k.startswith("_")},
    }
    record["extra"]["_json"] = json.dumps(payload, ensure_ascii=False, default=str)
    return "{extra[_json]}\n"


def setup(log_dir: Path | None, verbose: bool = False) -> Path | None:
    logger.remove()
    logger.add(sys.stderr, level="DEBUG" if verbose else "INFO", format=_HUMAN, colorize=None)
    if log_dir is None:
        return None
    log_dir.mkdir(parents=True, exist_ok=True)
    path = log_dir / "fitsync.jsonl"
    logger.add(path, level="DEBUG", format=_jsonl, rotation="5 MB", retention=5, encoding="utf-8")
    return path
