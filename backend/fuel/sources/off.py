"""Open Food Facts ingredient lookup with fallback."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request

from loguru import logger

from .. import log as _log

_log.setup()

OFF_API_URL = "https://world.openfoodfacts.org/cgi/search.pl"


def search_ingredient(name: str, limit: int = 1, timeout: int = 5) -> dict | None:
    """Sucht Zutat in Open Food Facts. Liefert Top-Match mit Makros pro 100g."""
    try:
        url = f"{OFF_API_URL}?search_terms={urllib.parse.quote(name)}&search_simple=1&action=process&json=1&page_size={limit}&fields=product_name,brands,nutriments"  # fields: ohne den Parameter antwortet OFF oft 503
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "fuel-cli/1.0 (nutrition logging)"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            result = json.loads(resp.read())
    except Exception as e:
        logger.warning(f"OFF lookup failed for {name!r}: {e}")
        return None

    products = result.get("products") or []
    if not products:
        logger.debug(f"OFF: no result for {name!r}")
        return None

    # Finde erstes Produkt mit vollständigen Nährwertdaten
    for prod in products:
        if not prod.get("product_name"):
            continue

        nutrients = prod.get("nutriments") or {}
        kcal = nutrients.get("energy-kcal_100g") or nutrients.get("energy_100g")
        if not kcal:
            continue

        # OFF kann energy in kJ liefern (/ 4.184 = kcal)
        if "energy_100g" in nutrients and "energy-kcal_100g" not in nutrients:
            kcal = kcal / 4.184

        return {
            "name": prod.get("product_name", "").strip(),
            "brand": prod.get("brands", ""),
            "energy_kcal": round(float(kcal) * 10) / 10,
            "protein": round(float(nutrients.get("proteins_100g") or 0) * 10) / 10,
            "carbs": round(float(nutrients.get("carbohydrates_100g") or 0) * 10) / 10,
            "fat": round(float(nutrients.get("fat_100g") or 0) * 10) / 10,
            "sodium_mg": round(float(nutrients.get("sodium_100g") or 0) * 10000) / 10,
        }

    logger.debug(f"OFF: no complete data for {name!r}")
    return None
