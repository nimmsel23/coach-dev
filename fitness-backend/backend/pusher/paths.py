"""Pfade: Verlauf (Datenwurzel) und Vorlagen (Config)."""
from __future__ import annotations

import os
from pathlib import Path

from backend.notifier.paths import data_root


def pusher_dir(root: Path | None = None) -> Path:
    return (root or data_root()) / "pusher"


def history_path(root: Path | None = None) -> Path:
    return pusher_dir(root) / "history.jsonl"


def log_path(root: Path | None = None) -> Path:
    return pusher_dir(root) / "pusher.log"


def templates_path() -> Path:
    env = os.environ.get("FITNESS_PUSH_TEMPLATES")
    return Path(env) if env else Path.home() / ".config" / "fitness-sync" / "push-templates.yaml"
