"""Catalog-Lookup für Meals + Supplements.

DB-backed Port von ~/dev/fuel-dev/fuel/catalog_lookup.py (dort: YAML-Dateiscan).
Ziel: vor jedem Gemini-Call erst den Catalog durchsuchen. Bei Hit werden die
gespeicherten Makros übernommen — kein Gemini-Call nötig.
"""

from __future__ import annotations

import re
import unicodedata

from sqlalchemy.orm import Session

from fuel.db.models.catalog import MealCatalogItem, SupplementCatalogItem

_QUANTITY_NOISE = re.compile(r"\d+\s*(g|gr|gramm|ml|stk|stück|x)\b", re.IGNORECASE)


def _normalize(s: str) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("ß", "ss")
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return re.sub(r"\s+", " ", s)


def _singularize(token: str) -> str:
    if len(token) > 5 and token.endswith("n"):
        return token[:-1]
    if len(token) > 4 and token.endswith("er"):
        return token[:-2]
    return token


def _normalize_singular(s: str) -> str:
    return " ".join(_singularize(t) for t in _normalize(s).split())


def _score_match(query_norm: str, item: MealCatalogItem) -> float:
    """Höher = besser. 0.0 = kein Match."""
    name = item.name or ""
    alias = item.alias or ""
    name_norm = _normalize_singular(name)
    alias_norm = _normalize_singular(alias) if alias else ""
    q = _normalize_singular(query_norm)

    score = 0.0
    if alias_norm and q == alias_norm:
        score += 100.0
    if q == name_norm:
        score += 90.0
    if q in name_norm:
        score += 40.0
    elif name_norm in q:
        score += 30.0
    if alias_norm and alias_norm in q:
        score += 20.0

    q_tokens = set(q.split())
    n_tokens = set(name_norm.split())
    if q_tokens and n_tokens:
        overlap = len(q_tokens & n_tokens) / len(q_tokens | n_tokens)
        score += overlap * 25.0

    if score == 0:
        return 0.0

    if _QUANTITY_NOISE.search(name):
        score -= 15.0
    if item.kind in ("meal", "recipe"):
        score += 5.0
    score -= min(len(name) * 0.1, 10.0)
    if item.addons:
        score += 3.0
    return score


def find_meal(query: str, db: Session, *, min_score: float = 40.0) -> MealCatalogItem | None:
    """Sucht best-passenden Meal-Catalog-Eintrag. None wenn kein guter Match.

    min_score=40 entspricht etwa "query in name" oder mittlerem Token-Overlap.
    Schwellwert konservativ gewählt — lieber Gemini fragen als falschen Hit nehmen.
    """
    if not query or not query.strip():
        return None
    items = db.query(MealCatalogItem).all()
    if not items:
        return None
    q_norm = _normalize_singular(query)
    scored = [(_score_match(q_norm, it), it) for it in items]
    scored = [(s, it) for s, it in scored if s >= min_score]
    if not scored:
        return None
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0][1]


def resolve_catalog_item(item: MealCatalogItem, addon_ids: list[str] | None = None) -> dict:
    """Summiert Basis-Makros + ausgewählte Addons. Port von resolveCatalogItem()
    aus fuel-dev-frontend/src/server/routes/nutrition/log.mjs."""
    default_set = set(item.default_addon_ids or [])
    selected_set = set(addon_ids) if addon_ids is not None else default_set
    selected_addons = [a for a in (item.addons or []) if a.get("id") in selected_set]

    if selected_set == default_set:
        # item.kcal/protein/carbs/fat ist bereits inkl. Default-Addons gecacht
        # (siehe fuel-dev/fuel/catalog_lookup.py::extract_macros) — nicht nochmal addieren.
        totals = {
            "kcal": item.kcal or 0,
            "protein": item.protein or 0,
            "carbs": item.carbs or 0,
            "fat": item.fat or 0,
        }
    else:
        # Abweichende Addon-Auswahl: Default-Addons aus dem gecachten Totalwert
        # herausrechnen, dann die tatsächlich gewählten Addons addieren.
        default_addons = [a for a in (item.addons or []) if a.get("id") in default_set]
        totals = {
            "kcal": (item.kcal or 0) - sum(a.get("kcal") or 0 for a in default_addons),
            "protein": (item.protein or 0) - sum(a.get("protein") or 0 for a in default_addons),
            "carbs": (item.carbs or 0) - sum(a.get("carbs") or 0 for a in default_addons),
            "fat": (item.fat or 0) - sum(a.get("fat") or 0 for a in default_addons),
        }
        for a in selected_addons:
            totals["kcal"] += a.get("kcal") or 0
            totals["protein"] += a.get("protein") or 0
            totals["carbs"] += a.get("carbs") or 0
            totals["fat"] += a.get("fat") or 0

    addon_label = ", ".join(a.get("label", "") for a in selected_addons if a.get("label"))
    description = f"{item.name} ({addon_label})" if addon_label else item.name

    micros = {
        key: value for key, value in (item.micros or {}).items()
        if isinstance(key, str) and isinstance(value, (int, float)) and not isinstance(value, bool)
    }
    if selected_set != default_set:
        for addon in item.addons or []:
            if addon.get("id") in default_set:
                for key, value in (addon.get("micros") or {}).items():
                    micros[key] = micros.get(key, 0) - (value or 0)
        for addon in selected_addons:
            for key, value in (addon.get("micros") or {}).items():
                micros[key] = micros.get(key, 0) + (value or 0)
        micros = {key: max(0, value) for key, value in micros.items() if value}

    return {
        "catalog_id": item.id,
        "type": item.meal_type or "meal",
        "description": description,
        "notes": item.notes or "",
        "kcal": round(totals["kcal"], 1),
        "protein": round(totals["protein"], 1),
        "carbs": round(totals["carbs"], 1),
        "fat": round(totals["fat"], 1),
        "micros": micros,
        "micros_meta": item.micros_meta or {},
    }


def _slugify(name: str) -> str:
    s = _normalize(name).replace(" ", "_")
    return re.sub(r"_+", "_", s).strip("_")[:60] or "item"


def generate_meal_id(name: str, db: Session) -> str:
    base_id = f"meal_{_slugify(name)}"
    item_id = base_id
    n = 2
    while db.query(MealCatalogItem).filter(MealCatalogItem.id == item_id).first():
        item_id = f"{base_id}_{n}"
        n += 1
    return item_id


def generate_supplement_id(name: str, db: Session) -> str:
    base_id = _slugify(name)
    item_id = base_id
    n = 2
    while db.query(SupplementCatalogItem).filter(SupplementCatalogItem.id == item_id).first():
        item_id = f"{base_id}_{n}"
        n += 1
    return item_id
