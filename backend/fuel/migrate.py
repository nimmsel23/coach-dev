"""Run Alembic migrations and safely baseline the pre-Alembic v4 database."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from sqlalchemy import inspect, text

from fuel.core.config import config as app_config
from fuel.db.database import engine

BASELINE_REVISION = "add_journal_text_frames_001"
ALEMBIC_INI = Path(__file__).resolve().parent / "alembic.ini"

_BASELINE_COLUMNS = {
    "food_logs": {
        "id", "created_at", "original_text", "name", "description", "ingredients", "calories",
        "protein", "carbs", "fat", "fiber", "sugar", "micros",
    },
    "supplement_logs": {"id", "created_at", "name", "dose", "unit", "time_of_day"},
    "daily_journals": {
        "date", "food_logs", "habits", "notes", "water_ml", "micros_sum", "journal_text",
    },
    "meal_catalog": {
        "id", "kind", "category", "name", "alias", "meal_type", "description", "notes",
        "kcal", "protein", "carbs", "fat", "yield_g", "components", "addons",
        "default_addon_ids", "source", "created_at", "updated_at",
    },
    "supplement_catalog": {
        "id", "name", "product", "unit", "default_dose", "default_time_of_day", "micros",
        "created_at", "updated_at",
    },
    "fuel_frames": {"id", "created_at", "data"},
}
_V4_TABLES = set(_BASELINE_COLUMNS)


def _alembic_config() -> AlembicConfig:
    alembic_config = AlembicConfig(str(ALEMBIC_INI))
    # ConfigParser treats percent signs as interpolation markers.
    alembic_config.set_main_option("sqlalchemy.url", app_config.DATABASE_URL.replace("%", "%%"))
    return alembic_config


def _baseline_unversioned_schema() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "alembic_version" in tables:
        with engine.connect() as connection:
            has_revision = connection.execute(text("SELECT 1 FROM alembic_version LIMIT 1")).first()
        if has_revision:
            return

    existing_v4_tables = tables & _V4_TABLES
    if not existing_v4_tables:
        return

    missing_tables = _V4_TABLES - tables
    missing_columns = {
        table: sorted(required - {col["name"] for col in inspector.get_columns(table)})
        for table, required in _BASELINE_COLUMNS.items()
        if table in tables and required - {col["name"] for col in inspector.get_columns(table)}
    }
    if missing_tables or missing_columns:
        raise RuntimeError(
            "Unversioned partial Fuel v4 schema detected; refusing to stamp or alter it. "
            f"Missing tables: {sorted(missing_tables)}; missing columns: {missing_columns}. "
            "Back up the database and reconcile its schema before starting the API."
        )

    command.stamp(_alembic_config(), BASELINE_REVISION)
    print(f"[alembic] stamped complete unversioned v4 schema at {BASELINE_REVISION}")


def migrate() -> None:
    """Upgrade the configured database without create_all schema shortcuts."""
    _baseline_unversioned_schema()
    command.upgrade(_alembic_config(), "head")


if __name__ == "__main__":
    migrate()
