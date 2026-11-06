"""
Lädt Exercise-Daten aus zwei Quellen und merged sie:

  1. fitness-dev/catalog/kb/exercises/*.yml       — Base-Layer (coaching, category, muscle_roles)
  2. anatomy-kb/exercises/ → anatomy_teaching/*.yaml — Anatomy-Layer (Symlink, numerische IDs)

Der Anatomy-Layer überschreibt/ergänzt den Base-Layer per exercise_id (Dateiname-Stem).
"""

from pathlib import Path
from typing import Optional

import yaml
from loguru import logger

_cache: dict[str, dict] = {}
_exercises_dir: Optional[Path] = None
_catalog_dir: Optional[Path] = None


def init(exercises_dir: Path, catalog_dir: Optional[Path] = None) -> None:
    global _exercises_dir, _catalog_dir
    _exercises_dir = exercises_dir
    _catalog_dir = catalog_dir
    _cache.clear()
    logger.info(f"loader: exercises_dir={exercises_dir}, catalog_dir={catalog_dir}")


def _dir() -> Path:
    if _exercises_dir is None:
        raise RuntimeError("loader.init() wurde noch nicht aufgerufen")
    return _exercises_dir


def _load_catalog_base() -> dict[str, dict]:
    """Liest fitness-dev/catalog/kb/exercises/*.yml → {exercise_id: base_data}."""
    if _catalog_dir is None or not _catalog_dir.exists():
        return {}
    base: dict[str, dict] = {}
    for yml_file in sorted(_catalog_dir.glob("*.yml")):
        try:
            doc = yaml.safe_load(yml_file.read_text(encoding="utf-8"))
            if not isinstance(doc, dict):
                continue
            for ex in doc.get("exercises", []):
                if not isinstance(ex, dict):
                    continue
                ex_id = ex.get("exercise_id") or ex.get("id")
                if ex_id:
                    base[ex_id] = ex
        except Exception as e:
            logger.warning(f"catalog: Fehler in {yml_file.name}: {e}")
    logger.info(f"loader: {len(base)} Übungen aus fitness-dev Katalog")
    return base


def load_all() -> dict[str, dict]:
    """Merged catalog base + anatomy enrichment → {exercise_id: merged_data}."""
    if _cache:
        return _cache

    base = _load_catalog_base()

    anatomy_files = sorted(_dir().glob("*.yml")) + sorted(_dir().glob("*.yaml"))
    for yml_file in anatomy_files:
        exercise_id = str(yml_file.stem)
        try:
            anatomy = yaml.safe_load(yml_file.read_text(encoding="utf-8"))
            if not anatomy or not isinstance(anatomy, dict):
                continue
            if "lessons" in anatomy and isinstance(anatomy["lessons"], list):
                matching_lesson = next((l for l in anatomy["lessons"] if l.get("exercise_id") == exercise_id), {})
                anatomy = {**anatomy, **matching_lesson}
            merged = {**base.get(exercise_id, {}), **anatomy}
            _cache[exercise_id] = merged
        except yaml.YAMLError as e:
            logger.error(f"YAML-Fehler in {yml_file.name}: {e}")

    # Catalog-Übungen ohne anatomy-kb Datei trotzdem einschließen
    for ex_id, ex_data in base.items():
        ex_id = str(ex_id)
        if ex_id not in _cache:
            _cache[ex_id] = ex_data

    logger.info(f"loader: {len(_cache)} Übungen geladen (merged)")
    return _cache


def load_one(exercise_id: str) -> Optional[dict]:
    return load_all().get(exercise_id)


def reload() -> None:
    _cache.clear()
    logger.info("loader: cache geleert")


def list_ids() -> list[str]:
    return sorted(load_all().keys())
