from pydantic import BaseModel, Field, model_validator
from fuel.omega3 import normalize_omega3
from typing import Optional

class MicroNutrients(BaseModel):
    vitamin_b12_ug: Optional[float] = Field(None, description="Vitamin B12 in µg")
    calcium_mg: Optional[float] = Field(None, description="Calcium in mg")
    iron_mg: Optional[float] = Field(None, description="Iron (Eisen) in mg")
    vitamin_d_ug: Optional[float] = Field(None, description="Vitamin D in µg")
    vitamin_e_mg: Optional[float] = Field(None, description="Vitamin E in mg")
    folate_ug: Optional[float] = Field(None, description="Folate (Folsäure) in µg")
    magnesium_mg: Optional[float] = Field(None, description="Magnesium in mg")
    zinc_mg: Optional[float] = Field(None, description="Zinc (Zink) in mg")
    sodium_mg: Optional[float] = Field(None, description="Sodium (Natrium) in mg")
    potassium_mg: Optional[float] = Field(None, description="Potassium (Kalium) in mg")
    vitamin_c_mg: Optional[float] = Field(None, description="Vitamin C in mg")
    vitamin_a_ug: Optional[float] = Field(None, description="Vitamin A in µg")
    omega3_mg: Optional[float] = Field(None, description="Omega-3 fatty acids in mg")
    omega3_ala_mg: Optional[float] = Field(None, ge=0, description="ALA in mg; omit if unknown")
    omega3_epa_mg: Optional[float] = Field(None, ge=0, description="EPA in mg; omit if unknown")
    omega3_dha_mg: Optional[float] = Field(None, ge=0, description="DHA in mg; omit if unknown")
    omega3_dpa_mg: Optional[float] = Field(None, ge=0, description="DPA in mg; omit if unknown")
    omega3_epa_dha_mg: Optional[float] = Field(None, ge=0, description="EPA + DHA in mg; omit if unknown")

    @model_validator(mode="before")
    @classmethod
    def derive_omega3(cls, values):
        return normalize_omega3(values) if isinstance(values, dict) else values
