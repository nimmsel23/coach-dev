"""fitness.muscles — Muskel-Normalisierung, geteilt über mehrere CLI-Subpackages
(log, activity, tui). Vorher fälschlich in fitness/commands/__init__.py, das
per Konvention nur Sammel-Ordner für lose CLI-Skripte war (aufgelöst, siehe
fitness/CLAUDE.md: jedes CLI-Skript hat jetzt sein eigenes Subpackage)."""
from functools import lru_cache

from fitness.catalog.coverage import (
    build_muscle_alias_map,
    load_muscle_region_index,
    load_muscle_taxonomy,
    normalize_muscle_id,
    resolve_muscle_id,
)
from fitness.catalog.core.muscles import iter_muscle_documents


@lru_cache(maxsize=1)
def _muscle_group_context() -> tuple[set[str], dict[str, str], dict[str, str], dict[str, str]]:
    region_index = load_muscle_region_index()
    taxonomy = load_muscle_taxonomy()
    alias_map = build_muscle_alias_map(taxonomy)
    labels_de: dict[str, str] = {}
    try:
        for doc_id, doc in iter_muscle_documents():
            if doc.get("kb_level") != "region":
                continue
            label = doc.get("label_de") or doc.get("display_name") or doc.get("label_en")
            if isinstance(label, str) and label:
                labels_de[doc_id] = label
    except Exception:
        labels_de = {}
    return set(region_index.values()), region_index, alias_map, labels_de


def muscle_to_group(name: str) -> str | None:
    """Muskel-ID, Alias oder Gruppenname -> kanonische KB-Region."""
    if not name:
        return None
    groups, region_index, alias_map, _ = _muscle_group_context()
    key = normalize_muscle_id(name)
    if key in groups:
        return key
    resolved = resolve_muscle_id(key, alias_map)
    if resolved in groups:
        return resolved
    if resolved in region_index:
        return region_index[resolved]
    return None


def muscle_group_label(group: str, lang: str = "de") -> str:
    group_key = normalize_muscle_id(group)
    if lang == "de":
        _, _, _, labels_de = _muscle_group_context()
        return labels_de.get(group_key, group_key.capitalize())
    return group_key.capitalize()


@lru_cache(maxsize=1)
def _muscle_doc_labels() -> dict[str, str]:
    """Label_de je einzelnem Muskel-KB-Dokument (nicht auf Region/Bucket
    zusammengefasst) — z.B. '201_latissimus_dorsi' -> 'Breiter Rückenmuskel
    Latissimus Dorsi', unabhängig vom kb_level (muscle ODER region)."""
    labels: dict[str, str] = {}
    try:
        for doc_id, doc in iter_muscle_documents():
            label = doc.get("label_de") or doc.get("display_name") or doc.get("label_en")
            if isinstance(label, str) and label:
                labels[doc_id] = label
    except Exception:
        labels = {}
    return labels


def muscle_label(name: str) -> str:
    """Die tatsächliche, korrekte Muskelbezeichnung für eine rohe Session-
    Muskel-ID (`'201_latissimus_dorsi'` -> `'Breiter Rückenmuskel Latissimus
    Dorsi'`) — im Unterschied zu `muscle_group_label(muscle_to_group(...))`,
    das auf die grobe KB-Region (Bucket, z.B. 'Mittlerer Rücken') zusammenfasst
    und dabei einzelne Muskel-Identität + Duplikate verliert."""
    if not name:
        return name
    key = normalize_muscle_id(name)
    labels = _muscle_doc_labels()
    if key in labels:
        return labels[key]
    resolved = resolve_muscle_id(key, build_muscle_alias_map(load_muscle_taxonomy()))
    if resolved in labels:
        return labels[resolved]
    # Kein KB-Dokument gefunden — Fallback auf Gruppen-Label statt Roh-ID.
    group = muscle_to_group(name)
    if group:
        return muscle_group_label(group)
    return name
