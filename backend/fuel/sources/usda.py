"""USDA FoodData Central lookup — Makros + volles Mikronährstoffprofil.

Warum USDA statt ernaehrung.de/naehrwertrechner.de (die BLS-Quellen aus dem
Chat): beide deutschen Seiten sind session-/cookie-gated (PHPSESSID, 301 ohne
Location bei direktem Query-Request) — keine stabile URL-API, ungeeignet für
ein CLI-Tool. USDA FDC ist eine offene JSON-API ohne Session-Handling, deckt
Mikronährstoffe deutlich vollständiger ab als wger/OFF (die primär Makros
führen), und liegt für generische Lebensmittel (Eier, Fleisch, Gemüse) nahe
an den BLS-Werten — beide Datenbanken messen dieselbe Lebensmittelchemie,
keine systematische EU/US-Divergenz bei Rohware ohne Fertigprodukt-Rezeptur.
"""

from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from difflib import SequenceMatcher

from loguru import logger
from ..omega3 import normalize_omega3

from .. import log as _log

_log.setup()

USDA_API_URL = "https://api.nal.usda.gov/fdc/v1"
# DEMO_KEY reicht für gelegentliche CLI-Lookups (Rate-Limit 30/h, 50/Tag).
# Eigener Key (kostenlos, https://fdc.nal.usda.gov/api-key-signup.html) via
# USDA_API_KEY in ~/.env/fuel.env für höheres Limit.
USDA_API_KEY = os.environ.get("USDA_API_KEY", "DEMO_KEY")

# USDA-Nutrient-Namen → unsere MICRO_KEYS (siehe shared/config/dach.mjs).
# Nur Nährstoffe, die wir tracken — Aminosäuren/Fettsäure-Einzelwerte (außer
# Omega-3-Summe) bleiben unübersetzt.
_NUTRIENT_MAP = {
    "Vitamin A, RAE": "vitamin_a_ug",
    "Vitamin D (D2 + D3)": "vitamin_d_ug",
    "Vitamin E (alpha-tocopherol)": "vitamin_e_mg",
    "Vitamin K (phylloquinone)": "vitamin_k_ug",
    "Vitamin C, total ascorbic acid": "vitamin_c_mg",
    "Thiamin": "vitamin_b1_mg",
    "Riboflavin": "vitamin_b2_mg",
    "Niacin": "vitamin_b3_mg",
    "Pantothenic acid": "vitamin_b5_mg",
    "Vitamin B-6": "vitamin_b6_mg",
    "Biotin": "vitamin_b7_ug",
    "Folate, total": "folate_ug",
    "Vitamin B-12": "vitamin_b12_ug",
    "Calcium, Ca": "calcium_mg",
    "Phosphorus, P": "phosphorus_mg",
    "Magnesium, Mg": "magnesium_mg",
    "Iron, Fe": "iron_mg",
    "Zinc, Zn": "zinc_mg",
    "Selenium, Se": "selenium_ug",
    "Iodine, I": "iodine_ug",
    "Potassium, K": "potassium_mg",
    "Sodium, Na": "sodium_mg",
}
# Explicit n-3 species only. FDC amounts may use g or mg.
_OMEGA3_FIELDS = {
    "PUFA 18:3 n-3 c,c,c (ALA)": "omega3_ala_mg",
    "PUFA 20:5 n-3 (EPA)": "omega3_epa_mg",
    "PUFA 22:5 n-3 (DPA)": "omega3_dpa_mg",
    "PUFA 22:6 n-3 (DHA)": "omega3_dha_mg",
}
_MACRO_MAP = {
    "Energy": "kcal",  # kcal-Eintrag, nicht kJ — beim Parsen per unitName gefiltert
    "Protein": "protein",
    "Carbohydrate, by difference": "carbs",
    "Total lipid (fat)": "fat",
    "Fiber, total dietary": "fiber",
}


def _fuzzy_score(query: str, candidate: str) -> float:
    return SequenceMatcher(None, query.lower(), candidate.lower()).ratio()


def search_food(query: str, limit: int = 5, timeout: int = 6) -> list[dict]:
    """Sucht in USDA FDC (Foundation + SR Legacy = unverarbeitete Lebensmittel
    bevorzugt vor Markenprodukten), re-rankt lokal per Fuzzy-Match gegen die
    Beschreibung, weil USDAs eigenes Relevanz-Ranking Markenprodukte oft vor
    generischen Einträgen listet."""
    try:
        url = (
            f"{USDA_API_URL}/foods/search?api_key={USDA_API_KEY}"
            f"&query={urllib.parse.quote(query)}"
            f"&dataType=Foundation,SR%20Legacy&pageSize={max(limit, 10)}"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "fuel-cli/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        logger.warning(f"USDA search failed for {query!r}: {e}")
        return []

    foods = data.get("foods") or []
    if not foods:
        logger.debug(f"USDA: no result for {query!r}")
        return []

    ranked = sorted(
        foods,
        key=lambda f: _fuzzy_score(query, f.get("description", "")),
        reverse=True,
    )
    return [
        {"fdc_id": f["fdcId"], "description": f["description"], "data_type": f.get("dataType")}
        for f in ranked[:limit]
    ]


def get_nutrients(fdc_id: int, timeout: int = 6) -> dict | None:
    """Volles Makro+Mikro-Profil pro 100g für eine USDA fdcId."""
    try:
        url = f"{USDA_API_URL}/food/{fdc_id}?api_key={USDA_API_KEY}"
        req = urllib.request.Request(url, headers={"User-Agent": "fuel-cli/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        logger.warning(f"USDA nutrient fetch failed for fdcId={fdc_id}: {e}")
        return None

    macros = {"kcal": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "fiber": 0.0}
    micros: dict[str, float] = {}  # nur tatsächlich von FDC gemeldete Nährstoffe

    for n in data.get("foodNutrients", []):
        name = n.get("nutrient", {}).get("name")
        unit = n.get("nutrient", {}).get("unitName")
        amount = n.get("amount")
        if amount is None:
            continue
        if name == "Energy" and unit == "kcal":
            macros["kcal"] = amount
        elif name in _MACRO_MAP and name != "Energy":
            macros[_MACRO_MAP[name]] = amount
        elif name in _NUTRIENT_MAP:
            micros[_NUTRIENT_MAP[name]] = amount
        elif name in _OMEGA3_FIELDS:
            factor = {"g": 1000, "mg": 1}.get(str(unit).lower())
            if factor is not None and isinstance(amount, (int, float)) and amount >= 0:
                micros[_OMEGA3_FIELDS[name]] = round(amount * factor, 3)

    # Known sum is a lower bound when species are missing, not a full profile.
    known = [micros[k] for k in _OMEGA3_FIELDS.values() if k in micros]
    if known:
        micros["omega3_mg"] = round(sum(known), 3)
    micros = normalize_omega3(micros)
    # micros, die FDC für dieses Lebensmittel nicht führt (z.B. Biotin, Jod
    # bei vielen Foundation-Foods), bleiben bewusst ausgelassen statt mit
    # 0.0 vorzutäuschen, es sei gemessen worden — Consumer (ingredient_add.py
    # etc.) müssen "fehlt" von "ist 0" unterscheiden können.
    return {
        "fdc_id": fdc_id,
        "description": data.get("description", ""),
        "per_100g": {**macros, **micros},
    }


def lookup(query: str, timeout: int = 6) -> dict | None:
    """Fuzzy-Suche + Top-Treffer-Nährstoffprofil in einem Call."""
    hits = search_food(query, limit=1, timeout=timeout)
    if not hits:
        return None
    result = get_nutrients(hits[0]["fdc_id"], timeout=timeout)
    if result:
        result["match_score"] = round(_fuzzy_score(query, hits[0]["description"]) * 100, 1)
    return result
