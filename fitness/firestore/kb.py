"""
firestore.kb — Firestore utilities for Knowledge Base (KB) / Catalog Sync.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Iterator
from loguru import logger

from ._db import get_db

BATCH_SIZE = 400

def flatten(doc: dict[str, Any]) -> dict[str, Any]:
    """Recursively convert all values in document to Firestore-compatible types."""
    def _convert(v: Any) -> Any:
        if isinstance(v, dict):
            return {str(k): _convert(vv) for k, vv in v.items()}
        if isinstance(v, list):
            return [_convert(i) for i in v]
        if isinstance(v, (str, int, float, bool)) or v is None:
            return v
        return str(v)
    return {k: _convert(v) for k, v in doc.items()}


def compute_hash(data: dict[str, Any]) -> str:
    """Compute stable MD5 hash for change detection."""
    encoded = json.dumps(data, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.md5(encoded).hexdigest()


def fetch_hashes(col: Any) -> dict[str, str]:
    """Retrieve all _hash fields from a Firestore collection."""
    return {
        doc.id: h
        for doc in col.select(["_hash"]).stream()
        if (h := doc.to_dict().get("_hash"))
    }


def batch_write(
    db: Any,
    col: Any,
    records: Iterator[tuple[str, dict[str, Any]]],
    *,
    dry_run: bool = False,
    use_hash: bool = True,
    remote_hashes: dict[str, str] | None = None,
) -> dict[str, int]:
    """
    Write records to Firestore via WriteBatch.
    """
    counts = {"ok": 0, "unchanged": 0, "error": 0}

    if use_hash and remote_hashes is None:
        logger.info("Fetching remote hashes...")
        remote_hashes = fetch_hashes(col)

    batch = db.batch()
    batch_count = 0

    for doc_id, payload in records:
        payload = flatten(payload)

        if use_hash:
            new_hash = compute_hash({k: v for k, v in payload.items() if k != "_hash"})
            if remote_hashes and remote_hashes.get(doc_id) == new_hash:
                counts["unchanged"] += 1
                continue
            payload["_hash"] = new_hash

        if dry_run:
            logger.debug(f"[dry] {col.id}/{doc_id}")
            counts["ok"] += 1
            continue

        try:
            batch.set(col.document(doc_id), payload)
            batch_count += 1
            counts["ok"] += 1
            if batch_count >= BATCH_SIZE:
                batch.commit()
                batch = db.batch()
                batch_count = 0
        except Exception as exc:
            logger.error(f"Error writing {col.id}/{doc_id}: {exc}")
            counts["error"] += 1

    if batch_count > 0 and not dry_run:
        batch.commit()

    return counts
