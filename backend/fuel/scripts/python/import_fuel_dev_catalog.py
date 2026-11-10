"""Einmaliges Import-Skript: ~/dev/fuel-dev/catalogs/*.yaml -> Postgres (meal_catalog, supplement_catalog).

~/dev/fuel-dev bleibt dabei unverändert (reine Lesequelle). Idempotent: existierende
IDs werden übersprungen (ON CONFLICT DO NOTHING), mehrfaches Ausführen ist sicher.

Aufruf: poetry run python scripts/import_fuel_dev_catalog.py
"""

from __future__ import annotations

from pathlib import Path

import yaml
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from fuel.db.database import SessionLocal
from fuel.db.models.catalog import MealCatalogItem, SupplementCatalogItem

FUEL_DEV_CATALOGS = Path.home() / "dev" / "fuel-dev" / "catalogs"
MEALS_DIR = FUEL_DEV_CATALOGS / "nutrition" / "meals"
SUPPLEMENTS_YAML = FUEL_DEV_CATALOGS / "supplements" / "catalog.yaml"


def _insert_do_nothing(db, model, rows) -> int:
    if not rows:
        return 0
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        stmt = pg_insert(model).values(rows)
    elif dialect == "sqlite":
        stmt = sqlite_insert(model).values(rows)
    else:
        raise RuntimeError(f"Unsupported catalog import database dialect: {dialect}")
    result = db.execute(stmt.on_conflict_do_nothing(index_elements=["id"]))
    db.commit()
    return result.rowcount or 0


def import_meals(db) -> int:
    if not MEALS_DIR.exists():
        print(f"[meals] Verzeichnis fehlt: {MEALS_DIR}")
        return 0

    rows = []
    for f in sorted(MEALS_DIR.glob("*.yaml")):
        try:
            data = yaml.safe_load(f.read_text())
        except Exception as e:
            print(f"[meals] skip {f.name}: parse error ({e})")
            continue
        if not isinstance(data, dict) or not data.get("id") or not data.get("name"):
            print(f"[meals] skip {f.name}: kein id/name")
            continue

        rows.append({
            "id": data["id"],
            "kind": data.get("kind") or "meal",
            "category": data.get("category"),
            "name": data["name"],
            "alias": data.get("alias"),
            "meal_type": data.get("meal_type"),
            "description": data.get("description"),
            "notes": data.get("notes"),
            "kcal": float(data.get("kcal") or 0),
            "protein": float(data.get("protein") or 0),
            "carbs": float(data.get("carbs") or 0),
            "fat": float(data.get("fat") or 0),
            "yield_g": data.get("yield_g"),
            "components": data.get("components") or [],
            "addons": data.get("addons") or [],
            "default_addon_ids": data.get("default_addon_ids") or [],
            "micros": data.get("micros") or {},
            "micros_meta": data.get("micros_meta") or {},
            "source": data.get("source") or "fuel-dev-import",
        })

    imported = _insert_do_nothing(db, MealCatalogItem, rows)
    print(f"[meals] {len(rows)} YAML-Dateien gelesen, {imported} neu importiert")
    return imported


def import_supplements(db) -> int:
    if not SUPPLEMENTS_YAML.exists():
        print(f"[supplements] Datei fehlt: {SUPPLEMENTS_YAML}")
        return 0

    data = yaml.safe_load(SUPPLEMENTS_YAML.read_text()) or {}
    items = data.get("items") or []
    rows = []
    for it in items:
        if not it.get("id") or not it.get("name"):
            continue
        rows.append({
            "id": it["id"],
            "name": it["name"],
            "product": it.get("product"),
            "unit": it.get("unit") or "mg",
            "default_dose": it.get("default_dose"),
            "default_time_of_day": it.get("default_time_of_day") or "any",
            "micros": it.get("micros") or {},
            "notes": it.get("notes"),
        })

    imported = _insert_do_nothing(db, SupplementCatalogItem, rows)
    print(f"[supplements] {len(rows)} Einträge gelesen, {imported} neu importiert")
    return imported


def main():
    db = SessionLocal()
    try:
        import_meals(db)
        import_supplements(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
