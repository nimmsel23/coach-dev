from pydantic import BaseModel, Field
from typing import List, Optional

class SupplementEntry(BaseModel):
    name: str = Field(description="Name des Supplements (z.B. Melatonin, Zink)")
    dose: float = Field(description="Eingenommene Menge als Zahl")
    unit: str = Field(description="Einheit (z.B. mg, g, Tropfen, Stück)")
    time_of_day: Optional[str] = Field(None, description="Tageszeit der Einnahme (z.B. morning, night, post-workout)")
