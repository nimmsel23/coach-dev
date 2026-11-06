from __future__ import annotations

import os
from pathlib import Path


PACKAGE_ROOT = Path(__file__).resolve().parent
REPO_ROOT    = PACKAGE_ROOT.parent  # ~/dev/fitness-dev


def _load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = val.strip()


_load_env(Path.home() / "fitness" / ".env")
_load_env(Path.home() / ".env" / "fitness.env")

def _resolve_data_dir() -> Path:
    override = os.environ.get("FITNESS_AGENT_KB", "").strip()
    if override:
        return Path(override).expanduser()
    # Source-Install: catalog/ ist Geschwister von catalog/ → catalog/kb/
    candidate = PACKAGE_ROOT.parent / "catalog" / "kb"
    if candidate.exists():
        return candidate
    # Legacy: catalog/ liegt innerhalb catalog/ → catalog/kb/
    legacy = PACKAGE_ROOT.parent / "kb"
    if legacy.exists():
        return legacy
    # uv tool install: kb liegt in ~/dev/fitness-dev/catalog/kb/
    fallback = Path.home() / "dev" / "fitness-dev" / "catalog" / "kb"
    return fallback

DATA_DIR = _resolve_data_dir()


def runtime_root() -> Path:
    override = os.environ.get("FITNESS_AGENT_HOME", "").strip()
    if override:
        return Path(override).expanduser()
    return Path.home() / ".aos" / "fitness"


RUNTIME_SUBDIRS = [
    "agent-state",
    "cache",
    "backups",
    "exports",
    "exports/obsidian",
    "exports/wger",
    "exports/json",
    "exports/client_notes",
]

REQUIRED_RUNTIME_FILES = [
    "agent-state/training_history.sqlite",
]
