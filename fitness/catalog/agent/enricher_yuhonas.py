from __future__ import annotations

from loguru import logger

from fitness.catalog.core.resolver import build_exercise_index
from fitness.catalog.core.source_merge import load_yuhonas_bulk_entries, yuhonas_vendor_json_path

BASE_IMAGE_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/"


def enrich_yuhonas_images(dry_run: bool = False):
    """Image-URLs kommen aus dem Vendor-Pin (CDN); kein Schreiben mehr nach
    unreviewed_yuhonas.yml. Zeigt nur, wie viele Bulk-Eintraege Bilder haben."""
    records = build_exercise_index()
    logger.info(f"Loaded {len(records)} exercise records.")

    path = yuhonas_vendor_json_path()
    if path is None:
        logger.error("yuhonas vendor JSON not found (vendor/free-exercise-db)")
        return

    entries = load_yuhonas_bulk_entries()
    with_images = 0
    for ex in entries:
        y_id = ex.get("yuhonas_id")
        images = ex.get("images") or []
        if y_id and images:
            with_images += 1
        elif y_id:
            # Upstream folders use the id as directory name
            _ = f"{BASE_IMAGE_URL}{y_id}/0.jpg"
            with_images += 1

    logger.info(
        f"yuhonas vendor {path}: {len(entries)} entries, "
        f"~{with_images} with image paths (dry_run={dry_run}; no YAML write)."
    )
