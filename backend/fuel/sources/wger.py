"""wger ingredient lookup (lokale Docker-Instanz auf :8000)."""

from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request

from loguru import logger

from .. import log as _log

_log.setup()

WGER_API_URL = os.environ.get("WGER_API_URL", "http://127.0.0.1:8000/api/v2")
WGER_API_TOKEN = os.environ.get(
    "WGER_API_TOKEN",
    "92d9ea44fc0ac065e336e9ec443a196c40c68afe",
)


def search_ingredient(name: str, limit: int = 1, timeout: int = 3) -> dict | None:
    """Sucht Zutat in lokaler wger-DB. Liefert Top-Match mit Makros pro 100g + Sodium (mg)."""
    try:
        url = f"{WGER_API_URL}/ingredient/?format=json&limit={limit}&name__search={urllib.parse.quote(name)}"
        req = urllib.request.Request(
            url,
            headers={"Authorization": f"Token {WGER_API_TOKEN}"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            result = json.loads(resp.read())
    except Exception as e:
        logger.warning(f"wger lookup failed for {name!r}: {e}")
        return None

    results = result.get("results") or []
    if not results:
        logger.debug(f"wger: no result for {name!r}")
        return None

    ing = results[0]
    sodium_g = float(ing.get("sodium") or 0)
    return {
        "wger_id": ing.get("id"),
        "name": (ing.get("name") or "").strip(),
        "brand": ing.get("brand", ""),
        "energy_kcal": round((ing.get("energy") or 0) * 10) / 10,
        "protein": round(float(ing.get("protein") or 0) * 10) / 10,
        "carbs": round(float(ing.get("carbohydrates") or 0) * 10) / 10,
        "fat": round(float(ing.get("fat") or 0) * 10) / 10,
        "sodium_mg": round(sodium_g * 1000 * 10) / 10,
    }
