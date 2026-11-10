import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
load_dotenv(Path.home() / ".env" / "fuel.env", override=False)

# Echte, bereits existierende Datenbank nutzen statt eine neue leere Datei
# zu erfinden — v4 ist der Nachfolger von v3, kein separates Projekt mit
# eigenen Daten. ~/.aos/fuel/nutrition/nutrition.db ist v3s reale SQLite
# (siehe src/server/config/paths.mjs). Tabellennamen kollidieren nicht: v3 nutzt
# daily_logs/daily_water/ingredients/meal_components/meal_micros/meals,
# v4 (SQLAlchemy) legt food_logs/supplement_logs/meal_catalog/
# supplement_catalog/daily_journals/fuel_frames an.
def _expand_sqlite_url(value: str) -> str:
    prefix = "sqlite:///"
    if not value.startswith(prefix):
        return value
    sqlite_path = Path(value[len(prefix):]).expanduser()
    return f"{prefix}{sqlite_path}"


_AOS_FUEL_DATA_DIR = Path(
    os.getenv("AOS_FUEL_DATA_DIR", str(Path.home() / ".aos" / "fuel"))
).expanduser()

class Config:
    # Database Configuration
    DATABASE_URL = _expand_sqlite_url(
        os.getenv(
            "FUEL_DATABASE_URL",
            os.getenv("DATABASE_URL", f"sqlite:///{_AOS_FUEL_DATA_DIR / 'nutrition' / 'nutrition.db'}"),
        )
    )

    # Gemini Configuration
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

config = Config()
