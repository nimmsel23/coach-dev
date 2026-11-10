import json
import sqlite3
from datetime import date
from pathlib import Path

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from fuel.core.config import config
from fuel.db.models.journal import DailyJournal


def _sqlite_path() -> Path | None:
    prefix = "sqlite:///"
    if not config.DATABASE_URL.startswith(prefix):
      return None
    return Path(config.DATABASE_URL[len(prefix):])


def _sum_micros(meals: list[dict]) -> dict:
    totals: dict[str, float] = {}
    for meal in meals:
        micros = meal.get("micros") or {}
        if not isinstance(micros, dict):
            continue
        for key, value in micros.items():
            try:
                amount = float(value or 0)
            except (TypeError, ValueError):
                continue
            if amount:
                totals[key] = totals.get(key, 0.0) + amount
    return totals


def _normalize_meal_for_v4(meal: dict) -> dict:
    kcal = meal.get("kcal", meal.get("calories", 0)) or 0
    logged_at = meal.get("logged_at") or meal.get("time")
    normalized = {
        **meal,
        "name": meal.get("name") or meal.get("description") or "",
        "description": meal.get("description") or meal.get("name") or "",
        "original_text": meal.get("original_text") or meal.get("description") or meal.get("name") or "",
        "calories": kcal,
        "kcal": kcal,
        "logged_at": logged_at,
        "time": meal.get("time") or logged_at,
    }
    return normalized


def _load_v3_meals(conn: sqlite3.Connection) -> dict[str, list[dict]]:
    rows = conn.execute(
        "SELECT id, date, catalog_id, type, description, notes, kcal, protein, carbs, fat, micros_json, logged_at FROM meals ORDER BY date, logged_at, id"
    ).fetchall()
    by_date: dict[str, list[dict]] = {}
    for row in rows:
        meal = {
            "id": row[0],
            "catalog_id": row[2],
            "type": row[3] or "meal",
            "name": row[4] or "",
            "description": row[4] or "",
            "original_text": row[4] or "",
            "notes": row[5] or "",
            "calories": row[6] or 0,
            "protein": row[7] or 0,
            "carbs": row[8] or 0,
            "fat": row[9] or 0,
            "logged_at": row[11],
        }
        if row[10]:
            try:
                meal["micros"] = json.loads(row[10])
            except json.JSONDecodeError:
                pass
        if row[1]:
            by_date.setdefault(row[1], []).append(meal)
    return by_date


def _load_v3_water(conn: sqlite3.Connection) -> dict[str, int]:
    rows = conn.execute("SELECT date, water_ml FROM daily_water").fetchall()
    return {date: int(water or 0) for date, water in rows if date}


def _load_v3_journal_files() -> dict[str, str]:
    db_path = _sqlite_path()
    if not db_path:
        return {}
    journal_dir = db_path.parent.parent / "nutrition_journal"
    if not journal_dir.exists():
        return {}

    content: dict[str, str] = {}
    for file_path in journal_dir.glob("*.md"):
        if file_path.stem:
            content[file_path.stem] = file_path.read_text(encoding="utf-8")
    return content


def _load_v3_json_logs() -> dict[str, dict]:
    db_path = _sqlite_path()
    if not db_path:
        return {}
    nutrition_dir = db_path.parent
    if not nutrition_dir.exists():
        return {}

    logs: dict[str, dict] = {}
    for file_path in nutrition_dir.glob("*.json"):
        try:
            log_date = date.fromisoformat(file_path.stem).isoformat()
        except ValueError:
            continue
        try:
            payload = json.loads(file_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        logs[log_date] = {
            "meals": payload.get("meals") or [],
            "water_ml": int(payload.get("water_ml") or 0),
        }
    return logs


def backfill_from_v3_if_needed(db: Session) -> dict[str, int]:
    db_path = _sqlite_path()
    if not db_path or not db_path.exists():
        return {"dates_seen": 0, "rows_created": 0, "rows_updated": 0}

    with sqlite3.connect(db_path) as conn:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "meals" not in tables:
            return {"dates_seen": 0, "rows_created": 0, "rows_updated": 0}

        meals_by_date = _load_v3_meals(conn)
        water_by_date = _load_v3_water(conn) if "daily_water" in tables else {}

    json_logs_by_date = _load_v3_json_logs()
    journal_by_date = _load_v3_journal_files()
    dates = sorted(set(meals_by_date) | set(water_by_date) | set(journal_by_date) | set(json_logs_by_date))
    created = 0
    updated = 0

    for date in dates:
        json_log = json_logs_by_date.get(date) or {}
        meals = meals_by_date.get(date, [])
        if not meals and json_log.get("meals"):
            meals = [_normalize_meal_for_v4(meal) for meal in json_log["meals"]]
        water_ml = water_by_date.get(date, 0) or json_log.get("water_ml", 0)
        journal_text = journal_by_date.get(date, "")
        micros_sum = _sum_micros(meals)

        row = db.query(DailyJournal).filter(DailyJournal.date == date).first()
        if row is None:
            row = DailyJournal(
                date=date,
                food_logs=meals,
                habits=[],
                notes=[],
                water_ml=water_ml,
                journal_text=journal_text,
                micros_sum=micros_sum,
            )
            db.add(row)
            created += 1
            continue

        changed = False
        if not row.food_logs and meals:
            row.food_logs = meals
            flag_modified(row, "food_logs")
            changed = True
        if (not row.water_ml) and water_ml:
            row.water_ml = water_ml
            changed = True
        if not row.journal_text and journal_text:
            row.journal_text = journal_text
            changed = True
        if not row.micros_sum and micros_sum:
            row.micros_sum = micros_sum
            flag_modified(row, "micros_sum")
            changed = True
        if changed:
            updated += 1

    if created or updated:
        db.commit()

    return {"dates_seen": len(dates), "rows_created": created, "rows_updated": updated}
