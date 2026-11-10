"""DACH Reference Values for adults.

Source: DGE (Deutsche Gesellschaft für Ernährung), ÖGE (Österreichische
Gesellschaft für Ernährung). Standard für Deutschland, Österreich, Schweiz.

1:1 Port von ~/dev/fuel-dev/src/shared/config/dach.mjs — Werte müssen mit dem
Node-Original übereinstimmen (Single Source of Truth bleibt vorerst das
Node-Repo, dieser Port ist der aktuelle Snapshot).
"""

DACH = {
    # Fettlösliche Vitamine
    "vitamin_a_ug":   {"value": 900,  "unit": "µg", "label": "Vit. A"},
    "vitamin_d_ug":   {"value": 20,   "unit": "µg", "label": "Vit. D"},
    "vitamin_e_mg":   {"value": 14,   "unit": "mg", "label": "Vit. E"},
    "vitamin_k_ug":   {"value": 70,   "unit": "µg", "label": "Vit. K"},
    # Wasserlösliche Vitamine
    "vitamin_c_mg":   {"value": 155,  "unit": "mg", "label": "Vit. C"},
    "vitamin_b1_mg":  {"value": 1.2,  "unit": "mg", "label": "B1"},
    "vitamin_b2_mg":  {"value": 1.4,  "unit": "mg", "label": "B2"},
    "vitamin_b3_mg":  {"value": 16,   "unit": "mg", "label": "B3"},
    "vitamin_b5_mg":  {"value": 6,    "unit": "mg", "label": "B5"},
    "vitamin_b6_mg":  {"value": 2.0,  "unit": "mg", "label": "B6"},
    "vitamin_b7_ug":  {"value": 40,   "unit": "µg", "label": "B7"},
    "folate_ug":      {"value": 400,  "unit": "µg", "label": "Folat"},
    "vitamin_b12_ug": {"value": 4,    "unit": "µg", "label": "B12"},
    # Mineralstoffe
    "calcium_mg":     {"value": 1000, "unit": "mg", "label": "Calcium"},
    "phosphorus_mg":  {"value": 700,  "unit": "mg", "label": "Phosphor"},
    "magnesium_mg":   {"value": 375,  "unit": "mg", "label": "Magnesium"},
    "iron_mg":        {"value": 10,   "unit": "mg", "label": "Eisen"},
    "zinc_mg":        {"value": 10,   "unit": "mg", "label": "Zink"},
    "selenium_ug":    {"value": 70,   "unit": "µg", "label": "Selen"},
    "iodine_ug":      {"value": 200,  "unit": "µg", "label": "Jod"},
    "potassium_mg":   {"value": 4000, "unit": "mg", "label": "Kalium"},
    "sodium_mg":      {"value": 550,  "unit": "mg", "label": "Natrium"},
    # Bor hat keinen offiziellen DACH-Referenzwert — EFSA Adequate-Intake (~1mg/Tag).
    "boron_mg":       {"value": 1,    "unit": "mg", "label": "Bor"},
    # Fettsäuren
    "omega3_mg":      {"value": None, "unit": "mg", "label": "Omega-3 gesamt"},
    "omega3_ala_mg":  {"value": None, "unit": "mg", "label": "Omega-3 ALA"},
    "omega3_epa_mg":  {"value": None, "unit": "mg", "label": "Omega-3 EPA"},
    "omega3_dha_mg":  {"value": None, "unit": "mg", "label": "Omega-3 DHA"},
    "omega3_dpa_mg":  {"value": None, "unit": "mg", "label": "Omega-3 DPA"},
    "omega3_epa_dha_mg": {"value": 250, "unit": "mg", "label": "EPA + DHA", "source": "EFSA"},
}

MICRO_KEYS = list(DACH.keys())


def get_status(value: float, reference: float) -> str:
    if not reference:
        return "unknown"
    if value >= reference * 0.9:
        return "ok"  # 90%+
    if value >= reference * 0.5:
        return "warning"  # 50-90%
    return "critical"  # <50%
