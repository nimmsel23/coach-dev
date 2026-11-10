from pydantic import BaseModel, Field
from typing import List, Optional
from fuel.schemas.micros import MicroNutrients

class MacroNutrients(BaseModel):
    calories: int = Field(description="Total calories in kcal")
    protein: float = Field(description="Protein in grams")
    carbs: float = Field(description="Carbohydrates in grams")
    fat: float = Field(description="Fat in grams")
    fiber: Optional[float] = Field(None, description="Fiber in grams")
    sugar: Optional[float] = Field(None, description="Sugar in grams")

class MealEntry(BaseModel):
    name: str = Field(description="A concise, descriptive name for the meal or food item")
    description: str = Field(description="A short description of what was eaten")
    ingredients: List[str] = Field(description="List of identified ingredients and their amounts")
    macros: MacroNutrients = Field(description="Estimated macronutrients for the entire meal based on average nutritional values")
    micros: MicroNutrients = Field(description="Estimated micronutrients (DACH reference) for the entire meal")
