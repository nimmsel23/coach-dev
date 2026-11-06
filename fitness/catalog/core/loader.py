from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from fitness.catalog.core.paths import DATA_DIR, runtime_root
from fitness.catalog.core.yaml_utils import load_yaml


def catalog_path(relative_path: str) -> Path:
    """Pfad zu einer versionierten YAML-Datei in catalog/data/."""
    return DATA_DIR / relative_path


def runtime_path(relative_path: str) -> Path:
    """Pfad zu mutablem Runtime-State in ~/.aos/fitness/."""
    return runtime_root() / relative_path


def load_catalog_yaml(relative_path: str) -> Any:
    return load_yaml(catalog_path(relative_path))


def iter_catalog_yaml_files(relative_dir: str) -> list[Path]:
    directory = catalog_path(relative_dir)
    if not directory.exists():
        return []
    # rglob statt glob: Unterordner (z.B. kb/exercises/6pack/,
    # kb/exercises/calisthenics/) wurden bis 2026-08-21 von jedem Aufrufer
    # (resolver.py, firestore_push.py, ...) stillschweigend übersprungen —
    # kuratierte Dateien dort landeten nie im Exercise-Index. Unterstütze
    # sowohl .yml (Exercises/Coaching) als auch .yaml (Anatomie).
    files = list(directory.rglob("*.yml")) + list(directory.rglob("*.yaml"))
    return sorted(files)


def load_catalog_directory_yaml(relative_dir: str) -> list[tuple[Path, Any]]:
    return [(p, load_yaml(p)) for p in iter_catalog_yaml_files(relative_dir)]


load_runtime_yaml = load_catalog_yaml
load_runtime_directory_yaml = load_catalog_directory_yaml


def backup_existing(target: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S%f")
    backup_root = runtime_root() / "backups" / timestamp
    backup_target = backup_root / target.name
    backup_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(target, backup_target)
    return backup_target
