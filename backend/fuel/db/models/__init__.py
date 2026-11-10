from fuel.db.database import Base
from fuel.db.models.food import FoodLog
from fuel.db.models.supplements import SupplementLog
from fuel.db.models.journal import DailyJournal, FuelFrame
from fuel.db.models.catalog import MealCatalogItem, SupplementCatalogItem

# Alle Modelle hier importieren, damit Alembic sie findet
__all__ = [
    "Base",
    "FoodLog",
    "SupplementLog",
    "DailyJournal",
    "FuelFrame",
    "MealCatalogItem",
    "SupplementCatalogItem",
]
