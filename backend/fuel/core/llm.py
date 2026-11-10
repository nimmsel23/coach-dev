try:
    from google import genai
    from google.genai import types
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False
    genai = None
    types = None

from fuel.omega3 import OMEGA3_RULES
from fuel.core.config import config
from fuel.schemas.food import MealEntry
from fuel.schemas.catalog import SupplementEstimate


class LLMUnavailableError(RuntimeError):
    """Raised when no real nutrition estimate can be produced."""

# It relies on GOOGLE_API_KEY in the environment if api_key is not passed,
# but we explicitly pass it for clarity if configured.
client = None
if GENAI_AVAILABLE:
    client_kwargs = {}
    if config.GEMINI_API_KEY:
        client_kwargs['api_key'] = config.GEMINI_API_KEY
    try:
        client = genai.Client(**client_kwargs)
    except Exception as e:
        print(f"Warning: Failed to initialize Gemini client: {e}")
        GENAI_AVAILABLE = False

def extract_macros_from_text(text: str) -> MealEntry:
    """
    Takes a natural language description of a meal and returns structured
    macro and ingredient information using Gemini.
    Raises LLMUnavailableError if Gemini is unavailable; fabricated values are
    never returned as if they were a real nutrition estimate.
    """
    if not GENAI_AVAILABLE or client is None:
        raise LLMUnavailableError("Gemini ist nicht verfügbar; Mahlzeit wurde nicht geschätzt.")

    prompt = f"""
    You are an expert nutrition AI. The user has provided a description of what they ate.
    Your task is to estimate the macronutrients, breakdown the ingredients, and estimate
    the micronutrients (Vitamins/Minerals based on D-A-CH references).
    Provide realistic, average nutritional values. If amounts aren't specified, assume standard portion sizes.

    User Input:
    {text}
    """

    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt + "\n" + OMEGA3_RULES,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=MealEntry,
        ),
    )

    return MealEntry.model_validate_json(response.text)


def estimate_supplement_from_text(description: str) -> SupplementEstimate:
    """
    Takes a free-text description of a supplement and returns structured
    catalog data (name, unit, default dose, time of day) using Gemini.
    Raises LLMUnavailableError if Gemini is unavailable.
    """
    if not GENAI_AVAILABLE or client is None:
        raise LLMUnavailableError("Gemini ist nicht verfügbar; Supplement wurde nicht geschätzt.")

    prompt = f"""
    Du bist Ernährungsexperte. Analysiere die folgende Supplement-Beschreibung
    und schätze Name, Einheit, übliche Einzeldosis und Einnahmezeitpunkt.

    Supplement:
    {description}
    """

    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt + "\n" + OMEGA3_RULES,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=SupplementEstimate,
        ),
    )

    return SupplementEstimate.model_validate_json(response.text)
