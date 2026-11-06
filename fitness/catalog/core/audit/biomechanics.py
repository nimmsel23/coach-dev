from __future__ import annotations

from pathlib import Path
from typing import Any

from fitness.catalog.core.loader import load_catalog_yaml
from fitness.catalog.core.resolver import build_exercise_index, normalize_text


def load_biomechanical_rules() -> dict[str, Any]:
    try:
        return load_catalog_yaml("rules/biomechanics.yml")
    except FileNotFoundError:
        return {}


def audit_exercise_record(ex: Any, mp_rules: dict[str, Any], iso_rules: dict[str, Any]) -> list[str]:
    warnings = []

    def get_val(obj, key, default=None):
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)

    category = get_val(ex, "category")
    legacy_pattern = get_val(ex, "movement_pattern")
    mp = category if category in mp_rules else legacy_pattern
    if mp in mp_rules:
        rule = mp_rules[mp]
        required = rule.get("required_primary", [])
        primary = [normalize_text(m) for m in (get_val(ex, "primary_muscles") or [])]
        if not any(normalize_text(req) in primary for req in required):
            warnings.append(
                f"Muster '{mp}' passt nicht zu primären Muskeln. Erwartet: {', '.join(required)}."
            )

    ex_type = get_val(ex, "type", "unknown")
    primary_count = len(get_val(ex, "primary_muscles") or [])
    if ex_type == "isolation":
        max_p = iso_rules.get("max_primary_muscles", 2)
        if primary_count > max_p:
            warnings.append(
                f"Als 'Isolation' markiert, hat aber {primary_count} primäre Muskeln (max {max_p})."
            )

    primary_set = set(get_val(ex, "primary_muscles") or [])
    secondary_set = set(get_val(ex, "secondary_muscles") or [])
    overlap = primary_set.intersection(secondary_set)
    if overlap:
        warnings.append(
            f"Muskeln sowohl primär als auch sekundär gelistet: {', '.join(overlap)}."
        )

    return warnings


def run_biomechanical_audit() -> list[str]:
    rules = load_biomechanical_rules()
    if not rules:
        return ["WARN: Biomechanical rules file missing."]

    mp_rules = rules.get("primal_movement_rules") or rules.get("movement_pattern_rules", {})
    iso_rules = rules.get("isolation_rules", {})
    warnings = []

    for ex in build_exercise_index():
        for w in audit_exercise_record(ex, mp_rules, iso_rules):
            warnings.append(f"BIOMECH: {ex.exercise_id} {w}")

    return warnings


def write_biomechanical_report() -> Path:
    warnings = run_biomechanical_audit()
    report_path = Path.home() / ".aos" / "fitness" / "agent-state" / "biomechanical_audit.txt"
    report_path.parent.mkdir(parents=True, exist_ok=True)

    content = "# Biomechanical Audit Report\n\n"
    if not warnings:
        content += "All exercises passed biomechanical consistency checks.\n"
    else:
        content += f"Found {len(warnings)} potential issues:\n\n"
        for w in warnings:
            content += f"- {w}\n"

    report_path.write_text(content, encoding="utf-8")
    return report_path
