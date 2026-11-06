from __future__ import annotations

import json
from pathlib import Path
from difflib import SequenceMatcher
import yaml
from loguru import logger

from fitness.catalog.core.resolver import build_exercise_index, normalize_text
from fitness.catalog.core.loader import load_catalog_yaml, DATA_DIR

DATASET_PATH = Path("catalog/exercises_dataset.json")
BASE_GIF_URL = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/"

def enrich_with_gifs(dry_run: bool = False):
    if not DATASET_PATH.exists():
        logger.error(f"Dataset not found at {DATASET_PATH}")
        return

    with DATASET_PATH.open("r", encoding="utf-8") as f:
        dataset = json.load(f)

    records = build_exercise_index()
    logger.info(f"Loaded {len(records)} exercise records and {len(dataset)} dataset entries.")

    matches = 0
    for record in records:
        if record.gif_url:
            continue

        best_match = None
        best_score = 0.0

        record_name_norm = normalize_text(record.display_name)
        
        for item in dataset:
            item_name_norm = normalize_text(item.get("name", ""))
            score = SequenceMatcher(None, record_name_norm, item_name_norm).ratio()
            
            if score > best_score:
                best_score = score
                best_match = item

        if best_match and best_score > 0.85:
            gif_rel_path = best_match.get("gif_url")
            if gif_rel_path:
                gif_url = BASE_GIF_URL + gif_rel_path
                logger.info(f"Match: {record.display_name} -> {best_match.get('name')} ({best_score:.2f})")
                
                if not dry_run:
                    update_exercise_gif(record.exercise_id, record.source_file, gif_url)
                matches += 1

    logger.info(f"Enriched {matches} exercises with GIFs.")

def update_exercise_gif(exercise_id: str, source_file: str, gif_url: str):
    file_path = DATA_DIR / "exercises" / source_file
    if not file_path.exists():
        return

    try:
        with file_path.open("r", encoding="utf-8") as f:
            doc = yaml.safe_load(f)
        
        if not doc or "exercises" not in doc:
            return

        updated = False
        for ex in doc["exercises"]:
            ex_id = ex.get("exercise_id") or ex.get("id")
            if ex_id == exercise_id:
                ex["gif_url"] = gif_url
                updated = True
                break
        
        if updated:
            with file_path.open("w", encoding="utf-8") as f:
                yaml.safe_dump(doc, f, allow_unicode=True, sort_keys=False)
    except Exception as e:
        logger.error(f"Failed to update {file_path}: {e}")

if __name__ == "__main__":
    enrich_with_gifs()
