"""Lightweight YAML persistence helpers for the supplement catalog."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from .paths import REPO_DIR

CATALOG_PATH = REPO_DIR / "catalogs" / "supplements" / "catalog.yaml"


def load_catalog_file(path: Path = CATALOG_PATH) -> dict[str, Any]:
    if not path.exists():
        return {"version": 1, "updated_at": "", "items": []}
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise ValueError(f"Ungültiges Supplement-Katalogformat: {path}")
    items = data.setdefault("items", [])
    if not isinstance(items, list):
        raise ValueError(f"Supplement-Katalog items ist keine Liste: {path}")
    return data


def save_catalog_file(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")


def make_catalog_id(name: str) -> str:
    base = "".join(c.lower() if c.isalnum() else "_" for c in name).strip("_")
    return base or "supplement"
