from pydantic import BaseModel, Field, field_validator
from typing import Optional


class MealCatalogUpsert(BaseModel):
    """Body für POST /nutrition/catalog — manuelles Anlegen/Update eines Meal-Eintrags."""

    id: Optional[str] = None
    name: str = Field(min_length=1)
    kind: str = "meal"
    category: Optional[str] = None
    alias: Optional[str] = None
    meal_type: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    kcal: float = 0
    protein: float = 0
    carbs: float = 0
    fat: float = 0
    yield_g: Optional[float] = None
    components: list[dict] = Field(default_factory=list)
    addons: list[dict] = Field(default_factory=list)
    default_addon_ids: list[str] = Field(default_factory=list)
    micros: dict[str, float] = Field(default_factory=dict)
    micros_meta: dict = Field(default_factory=dict)
    source: str = "manual"

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name darf nicht leer sein")
        return value


class MealCatalogItemOut(BaseModel):
    id: str
    kind: str = "meal"
    category: Optional[str] = None
    name: str
    alias: Optional[str] = None
    meal_type: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    kcal: float = 0
    protein: float = 0
    carbs: float = 0
    fat: float = 0
    yield_g: Optional[float] = None
    components: list[dict] = Field(default_factory=list)
    addons: list[dict] = Field(default_factory=list)
    default_addon_ids: list[str] = Field(default_factory=list)
    micros: dict[str, float] = Field(default_factory=dict)
    micros_meta: dict = Field(default_factory=dict)
    source: str = "manual"

    @field_validator("components", "addons", "default_addon_ids", mode="before")
    @classmethod
    def normalize_lists(cls, value):
        return [] if value is None else value

    @field_validator("micros", "micros_meta", mode="before")
    @classmethod
    def normalize_dicts(cls, value):
        if value is None:
            return {}
        return {key: amount for key, amount in value.items() if amount is not None}

    @field_validator("kind", mode="before")
    @classmethod
    def normalize_kind(cls, value):
        return "meal" if value is None else value

    @field_validator("source", mode="before")
    @classmethod
    def normalize_source(cls, value):
        return "manual" if value is None else value

    @field_validator("kcal", "protein", "carbs", "fat", mode="before")
    @classmethod
    def normalize_macros(cls, value):
        return 0 if value is None else value

    model_config = {"from_attributes": True}


class SupplementCatalogUpsert(BaseModel):
    """Body für POST /supplements/catalog — deckt sowohl manuelles Anlegen als auch
    das Speichern eines Gemini-Estimate-Previews ab (GeminiCatalogModal.jsx)."""

    id: Optional[str] = None
    name: str = Field(min_length=1)
    product: Optional[str] = None
    unit: str = "mg"
    default_dose: Optional[float] = None
    default_time_of_day: str = "any"
    micros: dict[str, float] = Field(default_factory=dict)
    notes: Optional[str] = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name darf nicht leer sein")
        return value


class SupplementCatalogItemOut(BaseModel):
    id: str
    name: str
    product: Optional[str] = None
    unit: str = "mg"
    default_dose: Optional[float] = None
    default_time_of_day: str = "any"
    micros: dict[str, float] = Field(default_factory=dict)
    notes: Optional[str] = None

    @field_validator("micros", mode="before")
    @classmethod
    def normalize_micros(cls, value):
        if value is None:
            return {}
        return {key: amount for key, amount in value.items() if amount is not None}

    @field_validator("unit", mode="before")
    @classmethod
    def normalize_unit(cls, value):
        return "mg" if value is None else value

    @field_validator("default_time_of_day", mode="before")
    @classmethod
    def normalize_time_of_day(cls, value):
        return "any" if value is None else value

    model_config = {"from_attributes": True}


class SupplementEstimateRequest(BaseModel):
    description: str


class SupplementEstimate(BaseModel):
    """Structured-Output-Schema für Gemini (core/llm.py::estimate_supplement_from_text)."""

    name: str = Field(description="Produktname des Supplements")
    unit: str = Field(description="Einheit: mg, g, ml, IU oder µg")
    default_dose: float = Field(description="Übliche Einzeldosis als Zahl")
    default_time_of_day: str = Field(
        description="Tageszeit der Einnahme: morning, midday, evening, night oder any"
    )
    notes: Optional[str] = Field(None, description="Kurze Beschreibung auf Deutsch, optional")
