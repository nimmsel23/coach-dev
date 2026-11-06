from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from fitness.catalog.core.loader import catalog_path, load_catalog_yaml, load_catalog_directory_yaml


def build_wger_catalog_index() -> dict[int, dict[str, str]]:
    """Scannt alle Exercise-YAMLs nach wger_id Feldern.

    Returns: {wger_id: {"catalog_id": "020", "display_name": "Klimmzug (Obergriff)"}}
    """
    index: dict[int, dict[str, str]] = {}

    for path, doc in load_catalog_directory_yaml("exercises"):
        # Nur kuratierte Einträge — unreviewed_* sind Bulk-Imports ohne echte Anreicherung
        if path.name.startswith("unreviewed_"):
            continue
        if not isinstance(doc, dict):
            continue
        exercises = doc.get("exercises", [])
        if not isinstance(exercises, list):
            continue
        for entry in exercises:
            if not isinstance(entry, dict):
                continue
            wger_id = entry.get("wger_id")
            if not wger_id:
                continue
            try:
                wger_id = int(wger_id)
            except (TypeError, ValueError):
                continue
            catalog_id = entry.get("exercise_id") or entry.get("id")
            if not catalog_id:
                continue
            display_name = (
                entry.get("german")
                or entry.get("display_name")
                or entry.get("name")
                or str(catalog_id)
            )
            if wger_id not in index:
                index[wger_id] = {"catalog_id": str(catalog_id), "display_name": display_name}

    return index


def load_wger_name_registry() -> dict[int, str]:
    """Lädt wger_exercises_id.yml → {wger_id: wger_name}."""
    try:
        raw = load_catalog_yaml("registry/wger_exercises_id.yml")
    except FileNotFoundError:
        return {}
    if not isinstance(raw, dict):
        return {}
    exercises = raw.get("exercises", {})
    if not isinstance(exercises, dict):
        return {}
    result: dict[int, str] = {}
    for k, v in exercises.items():
        try:
            result[int(k)] = str(v)
        except (TypeError, ValueError):
            continue
    return result


def export_wger_index(output_path: Path | None = None) -> tuple[dict, list[dict]]:
    """Schreibt kb/registry/wger_catalog_index.yml.

    Returns: (index_dict, unmapped_list)
    - index_dict: wger_id → catalog mapping (was geschrieben wird)
    - unmapped_list: wger IDs die in der Registry sind aber keinen Catalog-Eintrag haben
    """
    catalog_index = build_wger_catalog_index()
    wger_registry = load_wger_name_registry()

    # Unmapped: im wger Registry aber nicht im Katalog
    unmapped = [
        {"wger_id": wid, "wger_name": wger_registry[wid]}
        for wid in sorted(wger_registry)
        if wid not in catalog_index
    ]

    # Output aufbauen
    serializable = {
        str(wid): {
            "catalog_id": entry["catalog_id"],
            "display_name": entry["display_name"],
            "wger_name": wger_registry.get(wid, ""),
        }
        for wid, entry in sorted(catalog_index.items())
    }

    if output_path is None:
        output_path = catalog_path("registry/wger_catalog_index.yml")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        f.write("# Auto-generated: wger exercise_id → local catalog_id\n")
        f.write("# Source: kb/exercises/**/*.yml  (wger_id fields)\n")
        f.write("# Regenerate: fitness-agent export-wger-index\n\n")
        yaml.dump(serializable, f, allow_unicode=True, sort_keys=False, default_flow_style=False)

    return serializable, unmapped
