"""Pfade: Datenwurzel, Inbox-Verzeichnis, Config-Datei."""
from __future__ import annotations

import os
from pathlib import Path


def data_root() -> Path:
    return Path(os.environ.get("FITNESS_DATA_ROOT", Path.home() / ".aos" / "fitness"))


def notifier_dir(root: Path | None = None) -> Path:
    return (root or data_root()) / "notifier"


def config_path() -> Path:
    env = os.environ.get("FITNESS_NOTIFY_CONFIG")
    return Path(env) if env else Path.home() / ".config" / "fitness-sync" / "notify.yaml"
