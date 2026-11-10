from __future__ import annotations

import re
from functools import lru_cache
from typing import Iterable

from fitness.catalog.coverage import normalize_muscle_id, load_muscle_taxonomy
from fitness.catalog.core.loader import load_catalog_yaml


GENERIC_REGION_REASSIGNMENT = [
    (re.compile(r"external rotation|internal rotation|au(ss|ß)enrotation|innenrotation|rotator ?cuff", re.I), "304_rotator_cuff"),
    (re.compile(r"rear|reverse|posterior|face.?pull|hintere schulter|vorgebeugt|rückwärt", re.I), "303_posterior_deltoid"),
    (re.compile(r"lateral raise|side raise|seitheben|upright row", re.I), "302_lateral_deltoid"),
    (re.compile(r"front raise|frontheben|shoulder press|overhead press|arnold press|schulterdr(ü|ue)cken", re.I), "301_anterior_deltoid"),
]


def split_muscle_entries(values: Iterable[object] | object | None) -> list[str]:
    raw_values = values if isinstance(values, list) else ([] if values in (None, "") else [values])
    out: list[str] = []
    for value in raw_values:
        for part in str(value).replace("/", ",").replace(";", ",").split(","):
            cleaned = part.strip()
            if cleaned:
                out.append(cleaned)
    return out


@lru_cache(maxsize=1)
def _string_aliases() -> dict[str, str]:
    alias_doc = load_catalog_yaml("muscle_index.yml") or {}
    raw_aliases = alias_doc.get("string_aliases", {}) if isinstance(alias_doc, dict) else {}
    aliases: dict[str, str] = {}
    if isinstance(raw_aliases, dict):
        for raw_key, raw_value in raw_aliases.items():
            key = normalize_muscle_id(str(raw_key))
            value = str(raw_value).strip()
            if key and value:
                aliases[key] = value

    taxonomy = load_muscle_taxonomy()
    for muscle_id in taxonomy:
        norm = normalize_muscle_id(muscle_id)
        if norm:
            aliases.setdefault(norm, muscle_id)
            suffix = re.sub(r"^\d+[a-z]?_", "", muscle_id)
            if suffix:
                aliases.setdefault(normalize_muscle_id(suffix), muscle_id)
    return aliases


def canonicalize_muscle_id(raw: object) -> str:
    norm = normalize_muscle_id(str(raw or ""))
    if not norm:
        return ""
    return _string_aliases().get(norm, norm)


def refine_generic_region_labels(muscle_ids: list[str], *name_variants: str) -> list[str]:
    names = " ".join(name for name in name_variants if name)
    generic_shoulders = {"shoulders", "300_shoulders"}
    if generic_shoulders.intersection(muscle_ids):
        for pattern, replacement in GENERIC_REGION_REASSIGNMENT:
            if pattern.search(names):
                return [replacement if muscle in generic_shoulders else muscle for muscle in muscle_ids]
        # Kein Uebungsnamen-Keyword matcht -> welcher Deltoid-Kopf gemeint ist,
        # bleibt unklar. Grobe Regionen duerfen aber NIEMALS als Muskel-Eintrag
        # stehen bleiben (User-Vorgabe) — lieber verwerfen als raten oder eine
        # nicht-anatomische Region durchreichen.
        return [muscle for muscle in muscle_ids if muscle not in generic_shoulders]
    return muscle_ids


def normalize_exercise_muscle_list(values: Iterable[object] | object | None, *name_variants: str) -> list[str]:
    out: list[str] = []
    for raw in split_muscle_entries(values):
        muscle_id = canonicalize_muscle_id(raw)
        if muscle_id and muscle_id not in out:
            out.append(muscle_id)
    return refine_generic_region_labels(out, *name_variants)


def normalize_exercise_muscles(exercise: dict | None, *name_variants: str) -> dict:
    data = dict(exercise or {})
    fallback_names = [
        *name_variants,
        str(data.get("display_name") or ""),
        str(data.get("german") or ""),
        str(data.get("english") or ""),
        str(data.get("name") or ""),
        str(data.get("exercise_id") or data.get("id") or ""),
    ]
    data["primary_muscles"] = normalize_exercise_muscle_list(data.get("primary_muscles"), *fallback_names)
    data["secondary_muscles"] = normalize_exercise_muscle_list(data.get("secondary_muscles"), *fallback_names)
    data["stabilizers"] = normalize_exercise_muscle_list(data.get("stabilizers"), *fallback_names)
    return data
