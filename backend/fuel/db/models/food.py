from sqlalchemy import Column, Integer, String, Float, DateTime, Text, JSON
from sqlalchemy.sql import func
from fuel.db.database import Base

class FoodLog(Base):
    __tablename__ = "food_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    original_text = Column(Text, nullable=False)
    
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    ingredients = Column(JSON, nullable=True) 
    
    # Makros
    calories = Column(Integer, nullable=False)
    protein = Column(Float, nullable=False)
    carbs = Column(Float, nullable=False)
    fat = Column(Float, nullable=False)
    fiber = Column(Float, nullable=True)
    sugar = Column(Float, nullable=True)

    # Mikros (als JSON gespeichert um die Spaltenanzahl gering zu halten, 
    # oder alternativ als einzelne Spalten. Wir nutzen JSON für Flexibilität)
    micros = Column(JSON, nullable=True)
