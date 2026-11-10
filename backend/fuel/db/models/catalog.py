from sqlalchemy import Column, String, Float, Text, DateTime, JSON
from fuel.db.database import Base
from datetime import datetime, timezone


class MealCatalogItem(Base):
    __tablename__ = "meal_catalog"

    id = Column(String(80), primary_key=True, index=True)
    kind = Column(String(30), default="meal")
    category = Column(String(50), nullable=True)
    name = Column(String(255), nullable=False, index=True)
    alias = Column(String(255), nullable=True)
    meal_type = Column(String(30), nullable=True)
    description = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    kcal = Column(Float, default=0)
    protein = Column(Float, default=0)
    carbs = Column(Float, default=0)
    fat = Column(Float, default=0)
    yield_g = Column(Float, nullable=True)

    components = Column(JSON, default=list)
    addons = Column(JSON, default=list)
    default_addon_ids = Column(JSON, default=list)
    micros = Column(JSON, default=dict, nullable=False)
    micros_meta = Column(JSON, default=dict, nullable=False)

    source = Column(String(30), default="manual")
    # server_default=func.now() funktioniert nicht über alle DBs (SQLite kennt now() nicht)
    # stattdessen Python-default verwenden
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class SupplementCatalogItem(Base):
    __tablename__ = "supplement_catalog"

    id = Column(String(80), primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    product = Column(String(255), nullable=True)
    unit = Column(String(20), default="mg")
    default_dose = Column(Float, nullable=True)
    default_time_of_day = Column(String(20), default="any")
    micros = Column(JSON, default=dict)
    notes = Column(Text, nullable=True)

    # server_default=func.now() funktioniert nicht über alle DBs (SQLite kennt now() nicht)
    # stattdessen Python-default verwenden
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
