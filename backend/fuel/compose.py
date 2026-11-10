"""Compose a meal: Gemini decompose → wger ingredient lookup → scaled macros."""

from __future__ import annotations

from loguru import logger

from . import log as _log
from .gemini import decompose_components
from .sources.wger import search_ingredient

_log.setup()


def compose_meal(description: str) -> dict:
    """Returns {kcal, protein, carbs, fat, sodium_mg, components: [...], _error?}."""
    parts = decompose_components(description)
    if not parts:
        return {
            "kcal": 0, "protein": 0, "carbs": 0, "fat": 0, "sodium_mg": 0,
            "components": [],
            "_error": "could not decompose meal",
        }

    total = {"kcal": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "sodium_mg": 0.0}
    components: list[dict] = []
    unmatched: list[str] = []

    for part in parts:
        name = (part.get("name") or "").strip()
        try:
            qty_g = float(part.get("quantity_g") or 0)
        except (TypeError, ValueError):
            qty_g = 0.0
        if not name or qty_g <= 0:
            continue

        ing = search_ingredient(name, limit=1)
        if not ing:
            unmatched.append(name)
            components.append({"name": name, "quantity_g": qty_g, "_unmatched": True})
            continue

        mult = qty_g / 100.0
        kcal = round(ing["energy_kcal"] * mult * 10) / 10
        protein = round(ing["protein"] * mult * 10) / 10
        carbs = round(ing["carbs"] * mult * 10) / 10
        fat = round(ing["fat"] * mult * 10) / 10
        sodium = round(ing["sodium_mg"] * mult * 10) / 10

        total["kcal"] += kcal
        total["protein"] += protein
        total["carbs"] += carbs
        total["fat"] += fat
        total["sodium_mg"] += sodium

        components.append({
            "wger_id": ing["wger_id"],
            "name": ing["name"],
            "brand": ing["brand"],
            "quantity_g": qty_g,
            "kcal": kcal,
            "protein": protein,
            "carbs": carbs,
            "fat": fat,
            "sodium_mg": sodium,
        })

    out = {
        "kcal": round(total["kcal"] * 10) / 10,
        "protein": round(total["protein"] * 10) / 10,
        "carbs": round(total["carbs"] * 10) / 10,
        "fat": round(total["fat"] * 10) / 10,
        "sodium_mg": round(total["sodium_mg"] * 10) / 10,
        "components": components,
    }
    if unmatched:
        logger.warning(f"wger: {len(unmatched)} unmatched: {unmatched}")
        out["_unmatched"] = unmatched
    return out
