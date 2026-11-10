from __future__ import annotations

from pathlib import Path
from typing import Any, Iterator

from fitness.catalog.core.loader import catalog_path, load_catalog_yaml
from fitness.catalog.core.yaml_utils import load_yaml


def iter_muscle_files() -> list[Path]:
    """Return every muscle KB YAML, including top-level regions and details."""
    root = catalog_path("muscles")
    if not root.exists():
        return []
    return sorted(p for p in root.rglob("*.yml") if not p.name.startswith("_") and p.suffix == ".yml")


def load_muscle_index() -> dict[str, dict[str, Any]]:
    try:
        taxonomy = load_catalog_yaml("muscle_index.yml")
    except Exception:
        return {}
    muscles = taxonomy.get("muscles", {}) if isinstance(taxonomy, dict) else {}
    return muscles if isinstance(muscles, dict) else {}


def build_muscle_document(path: Path, index: dict[str, dict[str, Any]] | None = None) -> tuple[str, dict[str, Any]] | None:
    """Build a Firestore/API muscle document without collapsing KB granularity.

    Top-level files such as `muscles/chest.yml` are region/bucket documents and
    use the filename (`chest`) as public ID. Nested files such as
    `muscles/chest/101_pectoralis_major.yml` are detail-muscle documents and use
    their canonical muscle ID.
    """
    root = catalog_path("muscles")
    doc = load_yaml(path)
    if not isinstance(doc, dict):
        return None

    is_region = path.parent == root
    raw_id = str(doc.get("id") or path.stem).strip()
    if not raw_id:
        return None

    if is_region:
        doc_id = path.stem
        merged = {
            **doc,
            "id": doc_id,
            "doc_id": doc_id,
            "catalog_id": raw_id,
            "kb_level": "region",
            "region": doc_id,
        }
        return doc_id, merged

    doc_id = raw_id
    merged = {
        **doc,
        "id": doc_id,
        "doc_id": doc_id,
        "kb_level": "muscle",
        "region": path.parent.name,
    }
    fallback = (index or {}).get(doc_id, {})
    if isinstance(fallback, dict):
        if "wger_id" not in merged and "wger_id" in fallback:
            merged["wger_id"] = fallback["wger_id"]
        if "parent" not in merged and "parent" in fallback:
            merged["parent"] = fallback["parent"]
        if "legacy_ids" not in merged and "legacy_ids" in fallback:
            merged["legacy_ids"] = fallback["legacy_ids"]
    return doc_id, merged


def iter_muscle_documents(
    only_relative_paths: set[str] | None = None,
    index: dict[str, dict[str, Any]] | None = None,
) -> Iterator[tuple[str, dict[str, Any]]]:
    root = catalog_path("muscles")
    muscle_index = index if index is not None else load_muscle_index()
    for path in iter_muscle_files():
        rel = path.relative_to(root).as_posix()
        if only_relative_paths is not None and rel not in only_relative_paths:
            continue
        built = build_muscle_document(path, muscle_index)
        if built:
            yield built
