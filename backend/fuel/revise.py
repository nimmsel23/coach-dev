#!/usr/bin/env python3
"""Gemini-powered catalog entry revision."""

from __future__ import annotations

import json
from loguru import logger

from . import log as _log

_log.setup()


def revise_catalog_entry(meal_data: dict) -> dict | None:
    """Use Gemini to review and suggest revisions for a catalog entry.

    Returns: {suggested_kcal, suggested_protein, suggested_carbs, suggested_fat, reason}
    or None if no revision needed.
    """
    from .gemini import estimate_macros_only

    description = meal_data.get("description", meal_data.get("name", ""))
    current_kcal = meal_data.get("kcal", 0)
    current_protein = meal_data.get("protein", 0)
    current_carbs = meal_data.get("carbs", 0)
    current_fat = meal_data.get("fat", 0)

    # Use Gemini to estimate
    try:
        result = estimate_macros_only(description)
        if not result:
            return None

        suggested_kcal = result.get("kcal", 0)
        suggested_protein = result.get("protein", 0)
        suggested_carbs = result.get("carbs", 0)
        suggested_fat = result.get("fat", 0)

        # Check if significant differences
        kcal_diff = abs(suggested_kcal - current_kcal) / max(current_kcal, 1)
        protein_diff = abs(suggested_protein - current_protein) / max(current_protein, 1)
        carbs_diff = abs(suggested_carbs - current_carbs) / max(current_carbs, 1)
        fat_diff = abs(suggested_fat - current_fat) / max(current_fat, 1)

        # If any difference > 20%, flag for review
        if any(d > 0.2 for d in [kcal_diff, protein_diff, carbs_diff, fat_diff]):
            reasons = []
            if kcal_diff > 0.2:
                reasons.append(f"kcal: {current_kcal} → {suggested_kcal} ({kcal_diff*100:.0f}% diff)")
            if protein_diff > 0.2:
                reasons.append(f"protein: {current_protein} → {suggested_protein} ({protein_diff*100:.0f}% diff)")
            if carbs_diff > 0.2:
                reasons.append(f"carbs: {current_carbs} → {suggested_carbs} ({carbs_diff*100:.0f}% diff)")
            if fat_diff > 0.2:
                reasons.append(f"fat: {current_fat} → {suggested_fat} ({fat_diff*100:.0f}% diff)")

            return {
                "suggested_kcal": suggested_kcal,
                "suggested_protein": suggested_protein,
                "suggested_carbs": suggested_carbs,
                "suggested_fat": suggested_fat,
                "reason": " | ".join(reasons),
            }

    except Exception as e:
        logger.warning(f"Gemini revision failed: {e}")

    return None


def apply_revision(meal_data: dict, revision: dict) -> dict:
    """Apply suggested revisions to meal data."""
    if revision:
        meal_data["kcal"] = revision.get("suggested_kcal", meal_data.get("kcal"))
        meal_data["protein"] = revision.get("suggested_protein", meal_data.get("protein"))
        meal_data["carbs"] = revision.get("suggested_carbs", meal_data.get("carbs"))
        meal_data["fat"] = revision.get("suggested_fat", meal_data.get("fat"))
    return meal_data
