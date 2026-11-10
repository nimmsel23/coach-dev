"""Mikronährstoffe aus Catalog-Bausteinen: einmal ermitteln, danach nur noch rechnen.

Zwei Wege, die sich dieselbe Logik teilen:

  ingredient_micros(entry)   Mikros eines Bausteins (kind=ingredient, bezogen auf
                             yield_g). Fehlen sie, werden sie EINMAL geschätzt und
                             im Catalog gespeichert (`source` des Bausteins bleibt
                             unangetastet, die Herkunft steht in `micros_meta`).
  recompute_entry(entry)     Mikros eines Log-Eintrags / Catalog-Meals neu aus
                             `components` summieren — nach Korrektur von Mengen
                             oder Komponenten. Komponenten ohne Baustein werden
                             gebündelt geschätzt, alles andere rechnet der Code.

Summiert wird immer im Code; das LLM schätzt nur, was kein Baustein abdeckt.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from loguru import logger

from . import log as _log

_log.setup()

_QTY_PREFIX = re.compile(r"^\s*(\d+)x\s")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _positive(micros: dict | None) -> dict[str, float]:
    return {k: float(v) for k, v in (micros or {}).items() if isinstance(v, (int, float)) and v > 0}


def _estimate(text: str) -> dict[str, float] | None:
    """Schätz-Mikros für `text` (ganze Menge wie angegeben); None bei Fehler."""
    from .gemini import estimate_nutrition

    est = estimate_nutrition(text)
    if est.get("_error"):
        logger.warning(f"micros: Schätzung fehlgeschlagen ({text[:60]!r}): {est['_error']}")
        return None
    return _positive(est.get("micros"))


def ingredient_micros(entry: dict, *, uid: str | None = None) -> tuple[dict[str, float], bool]:
    """(Mikros bezogen auf yield_g, frisch_ermittelt). ({}, False) wenn nicht ermittelbar.

    Vorhandene Mikros werden nie neu geschätzt. Beim Erst-Ermitteln fließen die
    Packungs-Makros mit in den Schätz-Text, damit Gemini zur echten Rezeptur passt.
    """
    existing = _positive(entry.get("micros"))
    if existing:
        return existing, False
    grams = float(entry.get("yield_g") or 0)
    if grams <= 0:
        return {}, False
    text = (
        f"{grams:g} g {entry.get('name', '?')} "
        f"(Nährwerte laut Packung: {entry.get('kcal', 0):g} kcal, {entry.get('protein', 0):g} g Eiweiß, "
        f"{entry.get('carbs', 0):g} g Kohlenhydrate, {entry.get('fat', 0):g} g Fett pro {grams:g} g)"
    )
    micros = _estimate(text)
    if not micros:
        return {}, False

    from .catalog_lookup import update_catalog_item

    meta = {"source": "gemini", "method": "ingredient_estimate", "basis_g": grams, "resolved_at": _now()}
    if entry.get("id"):
        update_catalog_item(entry["id"], {"micros": {k: round(v, 3) for k, v in micros.items()}, "micros_meta": meta}, uid=uid)
    entry["micros"] = {k: round(v, 3) for k, v in micros.items()}
    entry["micros_meta"] = meta
    logger.info(f"micros: Baustein {entry.get('id')} einmalig geschätzt ({len(micros)} Werte)")
    return entry["micros"], True


def sum_components_micros(components: list[dict], *, uid: str | None = None) -> tuple[dict[str, float], dict]:
    """Mikros aus `components` ({name, amount_g|qty_text, …}) summieren.

    Returns (micros, info). info: from_catalog / estimated / missing (je Liste von Namen),
    created (Bausteine, deren Mikros dabei neu ermittelt wurden).
    """
    from .catalog_lookup import _amount_to_grams, find_ingredient

    total: dict[str, float] = {}
    info: dict[str, list[str]] = {"from_catalog": [], "estimated": [], "missing": [], "created": []}
    rest: list[tuple[str, float | None]] = []

    def add(src: dict, scale: float) -> None:
        for k, v in src.items():
            total[k] = total.get(k, 0.0) + v * scale

    for comp in components or []:
        name = comp.get("name") or "?"
        grams = comp.get("amount_g") or _amount_to_grams(comp.get("qty_text") or comp.get("qty") or "")
        hit = find_ingredient(name) if grams else None
        if not hit:
            rest.append((name, grams))
            continue
        m, fresh = ingredient_micros(hit, uid=uid)
        if not m:
            info["missing"].append(name)
            continue
        add(m, float(grams) / float(hit["yield_g"]))
        info["from_catalog"].append(name)
        if fresh:
            info["created"].append(hit.get("name") or name)

    if rest:
        text = "; ".join(f"{g:g} g {n}" if g else n for n, g in rest)
        est = _estimate(text)
        if est is None:
            info["missing"].extend(n for n, _ in rest)
        else:
            add(est, 1.0)
            info["estimated"].extend(n for n, _ in rest)

    return {k: round(v, 3) for k, v in total.items()}, info


def recompute_entry(entry: dict, *, uid: str | None = None) -> tuple[dict, dict] | None:
    """Neue Felder {micros, micros_meta} für einen Eintrag mit `components`; None ohne Komponenten.

    Ein "Nx "-Präfix in der Beschreibung (do_meal_log skaliert die Makros mit qty,
    die Komponenten bleiben je Einzelportion) wird auf die Mikros übertragen.
    """
    components = entry.get("components") or []
    if not components:
        return None
    micros, info = sum_components_micros(components, uid=uid)
    if not micros:
        return None
    m = _QTY_PREFIX.match(entry.get("description") or entry.get("name") or "")
    qty = int(m.group(1)) if m else 1
    if qty > 1:
        micros = {k: round(v * qty, 3) for k, v in micros.items()}
    meta = {
        "source": "catalog+gemini" if info["estimated"] else "catalog",
        "method": "components_sum",
        "resolved_at": _now(),
    }
    if info["missing"]:
        meta["incomplete"] = info["missing"]
    return {"micros": micros, "micros_meta": meta}, info
