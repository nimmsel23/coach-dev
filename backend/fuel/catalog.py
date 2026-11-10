"""Catalog loaders for fuel-dev.

Liest Supplements aus YAML (mit JSON-Fallback), Meals aus Repo-Verzeichnis.
"""

from __future__ import annotations

import json
from pathlib import Path

from loguru import logger

from . import log as _log  # configures loguru
from .paths import REPO_DIR

_log.setup()

CATALOGS_DIR = REPO_DIR / "catalogs"


def load_supplement_ids() -> set[str]:
    yaml_path = CATALOGS_DIR / "supplements" / "catalog.yaml"
    json_path = CATALOGS_DIR / "supplements" / "catalog.json"

    if yaml_path.exists():
        try:
            import yaml
            data = yaml.safe_load(yaml_path.read_text()) or {}
            return {item["id"] for item in data.get("items", []) if "id" in item}
        except Exception as e:
            logger.warning(f"Supplement YAML parse failed ({yaml_path}): {e}")

    if json_path.exists():
        try:
            data = json.loads(json_path.read_text())
            return {item["id"] for item in data.get("items", []) if "id" in item}
        except Exception as e:
            logger.warning(f"Supplement JSON parse failed ({json_path}): {e}")

    logger.debug("No supplement catalog found in repo")
    return set()


def load_meal_ids() -> set[str]:
    meals_dir = CATALOGS_DIR / "nutrition" / "meals"
    if not meals_dir.exists():
        return set()
    return {p.stem for p in meals_dir.glob("*.json")}
