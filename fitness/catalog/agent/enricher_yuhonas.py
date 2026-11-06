from __future__ import annotations

import yaml
from loguru import logger
from pathlib import Path

from fitness.catalog.core.resolver import build_exercise_index
from fitness.catalog.core.loader import DATA_DIR

BASE_IMAGE_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/"

def enrich_yuhonas_images(dry_run: bool = False):
    records = build_exercise_index()
    logger.info(f"Loaded {len(records)} exercise records.")

    matches = 0
    for record in records:
        if record.tags and "yuhonas" in record.tags and not record.image_url:
            pass

    # Better approach: parse the yuhonas file directly
    yuhonas_file = DATA_DIR / "exercises" / "unreviewed_yuhonas.yml"
    if not yuhonas_file.exists():
        logger.error(f"yuhonas file not found at {yuhonas_file}")
        return

    with yuhonas_file.open("r", encoding="utf-8") as f:
        doc = yaml.safe_load(f)

    if not doc or "exercises" not in doc:
        return

    updated = False
    for ex in doc["exercises"]:
        y_id = ex.get("yuhonas_id")
        if y_id and not ex.get("image_url"):
            # Construct URL. Note: yuhonas uses spaces in folder names sometimes? 
            # My earlier test showed Air_Bike worked. 
            # Let's use the ID directly, it seems to be the folder name.
            image_url = f"{BASE_IMAGE_URL}{y_id}/0.jpg"
            ex["image_url"] = image_url
            matches += 1
            updated = True

    if updated and not dry_run:
        with yuhonas_file.open("w", encoding="utf-8") as f:
            yaml.safe_dump(doc, f, allow_unicode=True, sort_keys=False)
        logger.info(f"Updated {matches} yuhonas exercises with images.")
    else:
        logger.info(f"Dry run or no updates. Matches found: {matches}")

if __name__ == "__main__":
    enrich_yuhonas_images()
