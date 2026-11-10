from __future__ import annotations

from collections import defaultdict
from typing import Any

from fitness.catalog.core.loader import load_catalog_yaml, iter_catalog_yaml_files, catalog_path
from fitness.catalog.core.muscles import iter_muscle_documents
from fitness.catalog.core.resolver import build_exercise_index, resolve_query

ROLE_WEIGHTS = {
    "primary": 1.0,
    "secondary": 0.5,
    "stabilizer": 0.2,
}


def calculate_coverage(
    exercise_query: str,
    sets: int,
    rpe: int,
    records: list | None = None,
    taxonomy: dict | None = None,
    region_index: dict | None = None,
    rules: dict | None = None,
) -> dict[str, Any]:
    if records is None:
        records = build_exercise_index()
    resolution = resolve_query(exercise_query, records=records)
    if not resolution.matched or not resolution.canonical_id:
        raise ValueError(f"Unknown exercise: {exercise_query}")

    exercise = find_exercise(resolution.canonical_id, records=records)
    if exercise is None:
        raise ValueError(f"Exercise not found: {resolution.canonical_id}")

    if taxonomy is None:
        taxonomy = load_muscle_taxonomy()
    if region_index is None:
        region_index = load_muscle_region_index()
    alias_map = build_muscle_alias_map(taxonomy)
    parent_map = build_muscle_parent_map(taxonomy)
    if rules is None:
        rules = load_coverage_rules()
    effort_factor = effort_factor_for_rpe(rpe, rules)

    muscle_scores: dict[str, float] = defaultdict(float)
    detail_muscle_scores: dict[str, float] = defaultdict(float)
    add_role_scores(muscle_scores, detail_muscle_scores, exercise.primary_muscles or [], sets, ROLE_WEIGHTS["primary"], effort_factor, alias_map, region_index, parent_map)
    add_role_scores(muscle_scores, detail_muscle_scores, exercise.secondary_muscles or [], sets, ROLE_WEIGHTS["secondary"], effort_factor, alias_map, region_index, parent_map)
    add_role_scores(muscle_scores, detail_muscle_scores, exercise.stabilizers or [], sets, ROLE_WEIGHTS["stabilizer"], effort_factor, alias_map, region_index, parent_map)

    # body_region_scores bleibt strikt auf den rohen (nicht hochgerechneten)
    # muscle_scores aufgebaut - sonst würde ein Sub-Kopf, dessen Score zum
    # Parent hochgerechnet wird, dieselbe Region zweimal befeuern.
    body_region_scores: dict[str, float] = defaultdict(float)
    unmapped_muscles: list[str] = []

    for muscle_id, score in muscle_scores.items():
        regions = muscle_regions(muscle_id, region_index)
        if regions:
            for region in regions:
                body_region_scores[region] += score
        else:
            unmapped_muscles.append(muscle_id)

    muscle_scores_with_parents = rollup_parent_scores(detail_muscle_scores, parent_map)

    return {
        "exercise_query": exercise_query,
        "exercise_id": exercise.exercise_id,
        "display_name": exercise.display_name,
        "sets": sets,
        "rpe": rpe,
        "effort_factor": effort_factor,
        "muscle_scores": dict(sorted(muscle_scores.items())),
        "detail_muscle_scores": dict(sorted(detail_muscle_scores.items())),
        "muscle_scores_with_parents": dict(sorted(muscle_scores_with_parents.items())),
        "body_region_scores": dict(sorted(body_region_scores.items())),
        "unmapped_muscles": sorted(unmapped_muscles),
    }


def find_exercise(exercise_id: str, records: list | None = None):
    for record in (records if records is not None else build_exercise_index()):
        if record.exercise_id == exercise_id:
            return record
    return None


def add_role_scores(
    muscle_scores: dict[str, float],
    detail_muscle_scores: dict[str, float],
    muscles: list[str],
    sets: int,
    role_weight: float,
    effort_factor: float,
    alias_map: dict[str, str] | None = None,
    region_index: dict[str, str] | None = None,
    parent_map: dict[str, str] | None = None,
) -> None:
    for muscle_id in muscles:
        norm = normalize_muscle_id(muscle_id)
        if region_index and region_index.get(norm) == norm:
            resolved = norm
        else:
            resolved = resolve_muscle_id(norm, alias_map) if alias_map else norm
        score_key = parent_map.get(resolved, resolved) if parent_map else resolved
        score = sets * role_weight * effort_factor
        muscle_scores[score_key] += score
        detail_muscle_scores[resolved] += score


def normalize_muscle_id(name: str) -> str:
    """Konvertiert Muskelnamen in eine kanonische ID (lowercase, snake_case)."""
    import re
    import unicodedata

    if not name:
        return ""

    normalized = unicodedata.normalize("NFKD", name)
    stripped = "".join(char for char in normalized if not unicodedata.combining(char))
    collapsed = re.sub(r"[^a-zA-Z0-9]+", "_", stripped.casefold())
    return collapsed.strip("_")


def build_muscle_alias_map(taxonomy: dict[str, dict[str, Any]]) -> dict[str, str]:
    """Baut eine Map von plain/display Namen auf numbered taxonomy IDs.

    Erlaubt Lookup von z.B. 'gluteus_maximus', 'Glutes', 'glutes' -> '603_gluteus_maximus'.
    """
    import re
    alias_map: dict[str, str] = {}
    for muscle_id, data in taxonomy.items():
        if re.match(r'^\d00_', muscle_id):
            continue
        alias_map[muscle_id] = muscle_id
        suffix = re.sub(r'^\d+[a-z]?_', '', muscle_id)
        if suffix:
            alias_map[suffix] = muscle_id
        # Reine Zahl-Praefix-ID (z.B. "601" oder "601a") -> volle ID. Vollstaendige
        # Legacy-Slugs duerfen NICHT per Praefix auf neue Muskeln fallen, sonst
        # wuerde ein alter Slug stillschweigend auf eine neue falsche ID zeigen.
        prefix_match = re.match(r'^(\d+[a-z]?)_', muscle_id)
        if prefix_match:
            alias_map.setdefault(prefix_match.group(1), muscle_id)
        for field in ("label_en", "label_de", "display_name"):
            val = data.get(field, "")
            if isinstance(val, str) and val:
                norm = normalize_muscle_id(val)
                if norm:
                    alias_map.setdefault(norm, muscle_id)
    return alias_map


def resolve_muscle_id(raw: str, alias_map: dict[str, str]) -> str:
    """Gibt die numbered taxonomy ID zurueck, oder den normalisierten Rohwert wenn nicht gefunden.

    Faellt nur bei reinen Nummern-IDs (z.B. "601" oder "601a") auf die
    vollstaendige aktuelle ID zurueck. Vollstaendige Legacy-Slugs bleiben
    unmapped, damit falsche Altlogs nicht stillschweigend falsch einsortiert
    werden.
    """
    import re
    norm = normalize_muscle_id(raw)
    if norm in alias_map:
        return alias_map[norm]
    if re.match(r'^\d+[a-z]?$', norm) and norm in alias_map:
        return alias_map[norm]
    return norm


def build_muscle_parent_map(taxonomy: dict[str, dict[str, Any]]) -> dict[str, str]:
    """Baut muscle_id → parent_id aus dem `parent:`-Feld der Taxonomie.

    Nur echte anatomische Unterköpfe (z.B. 102_pectoralis_major_clavicular →
    101_pectoralis_major) tragen dieses Feld.
    """
    return {
        muscle_id: data["parent"]
        for muscle_id, data in taxonomy.items()
        if isinstance(data, dict) and data.get("parent")
    }


def rollup_parent_scores(muscle_scores: dict[str, float], parent_map: dict[str, str]) -> dict[str, float]:
    """Rechnet Sub-Kopf-Scores zusätzlich auf ihre Eltern-Muskeln hoch.

    Gibt ein NEUES Dict zurück (mutiert `muscle_scores` nicht) - so bleibt
    body_region_scores unangetastet und es kann keine Doppelzählung auf
    Region-Ebene entstehen.
    """
    rolled: dict[str, float] = defaultdict(float, muscle_scores)
    for muscle_id, score in muscle_scores.items():
        seen = {muscle_id}
        parent = parent_map.get(muscle_id)
        while parent and parent not in seen:
            rolled[parent] += score
            seen.add(parent)
            parent = parent_map.get(parent)
    return dict(rolled)


def load_muscle_taxonomy() -> dict[str, dict[str, Any]]:
    taxonomy = load_catalog_yaml("muscle_index.yml")
    if not isinstance(taxonomy, dict):
        taxonomy = {}
    muscles = taxonomy.get("muscles", {})
    if not isinstance(muscles, dict):
        muscles = {}
    result: dict[str, dict[str, Any]] = {}
    for muscle_id, data in muscles.items():
        if isinstance(muscle_id, str) and isinstance(data, dict):
            result[muscle_id] = data
    for muscle_id, data in iter_muscle_documents(index=result):
        existing = result.get(muscle_id, {})
        result[muscle_id] = {**data, **existing}
    return result


def load_coverage_rules() -> dict[str, Any]:
    rules = load_catalog_yaml("rules/muscle_coverage_rules.yml")
    if isinstance(rules, dict):
        return rules.get("coverage_rules", rules) if isinstance(rules.get("coverage_rules", rules), dict) else {}
    return {}


def load_muscle_region_index() -> dict[str, str]:
    """Baut muscle_id → region_name aus den {region}.yml Index-Dateien.

    chest.yml / arms.yml / back.yml etc. sind der kanonische Index — der
    Dateiname ist die Region, die muscles-Liste der Inhalt.
    """
    region_dir = catalog_path("muscles")
    result: dict[str, str] = {}
    region_docs: list[tuple[str, dict[str, Any]]] = []

    def bucket_rank(item: tuple[str, dict[str, Any]]) -> tuple[int, int]:
        _, doc = item
        catalog_id = str(doc.get("id") or "")
        return (1 if catalog_id.startswith(("100_", "200_", "300_", "400_", "500_", "600_", "700_")) else 0, len(doc.get("muscles", [])))

    for yml_file in sorted(region_dir.glob("*.yml")):
        if yml_file.name.startswith("_") or yml_file.stem in ("muscle_index",):
            continue
        try:
            doc = load_catalog_yaml(f"muscles/{yml_file.name}")
        except Exception:
            continue
        if not isinstance(doc, dict):
            continue
        muscles = doc.get("muscles")
        if isinstance(muscles, list):
            region_docs.append((yml_file.stem, doc))

    # Kleine/spezifische Buckets gewinnen vor Sammel-Buckets. `legs.yml` oder
    # `arms.yml` bleiben dadurch Fallbacks, ohne `quadriceps.yml`/`bizeps.yml`
    # wieder zu überstimmen.
    region_docs.sort(key=bucket_rank)
    for region_name, doc in region_docs:
        result.setdefault(region_name, region_name)
        for muscle_id in doc.get("muscles", []):
            if isinstance(muscle_id, str):
                result.setdefault(muscle_id, region_name)

    for yml_file in sorted(region_dir.rglob("*.yml")):
        if yml_file.parent == region_dir or yml_file.name.startswith("_"):
            continue
        try:
            doc = load_catalog_yaml(f"muscles/{yml_file.parent.name}/{yml_file.name}")
        except Exception:
            continue
        if not isinstance(doc, dict):
            continue
        muscle_id = str(doc.get("id") or yml_file.stem).strip()
        if muscle_id:
            result.setdefault(muscle_id, yml_file.parent.name)

    return result


def effort_factor_for_rpe(rpe: int, rules: dict[str, Any]) -> float:
    factors = rules.get("effort_factors_by_rpe", {})
    if isinstance(factors, dict):
        factor = factors.get(rpe)
        if isinstance(factor, (int, float)):
            return float(factor)
        factor = factors.get(str(rpe))
        if isinstance(factor, (int, float)):
            return float(factor)
    default_factor = rules.get("default_effort_factor", 1.0)
    return float(default_factor) if isinstance(default_factor, (int, float)) else 1.0


def muscle_regions(muscle_id: str, region_index: dict[str, str]) -> list[str]:
    region = region_index.get(muscle_id)
    return [region] if region else []
