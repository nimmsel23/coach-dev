"""Gemini API — thin wrapper für Muskel-Anatomie-Enrichment.

Kopiert aus anatomy-kb/anatomy_kb/gemini.py (2026-08-15) — bewusst eigenständig
statt Cross-Package-Import, damit fitness.anatomy ohne anatomy-kb/sys.path-Hack
lauffähig ist (Ziel: anatomy-kb-Server als eigener Prozess wird überflüssig).
"""
from __future__ import annotations

import os

import httpx
import yaml

# fitness.catalog.core.paths laedt ~/fitness/.env + ~/.env/fitness.env beim
# Import automatisch in os.environ (siehe fitness/catalog/CLAUDE.md) — jedes
# Modul, das (transitiv) core.paths importiert, hat GEMINI_API_KEY also schon.
import fitness.catalog.core.paths  # noqa: F401  (Seiteneffekt: laedt .env)

FALLBACK_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-flash-lite-latest",
]

MUSCLE_PROMPT = """\
Du bist Anatomie-Experte (Diplom Präventiver Vitaltrainer, FlexyFit Wien).
Muskel: {latin} (muscle_id: {muscle_id})
Antworte NUR mit diesem YAML-Block:
```yaml
origin: "Ursprung (Origo) — präzise Knochenstruktur und Knochenmarken"
insertion: "Ansatz (Insertio) — präzise Knochenstruktur und Knochenmarken"
innervation: "Nerv (Segmente)"
function: "Allgemeine Funktion des Muskels (1-2 Sätze Deutsch)"
```
"""


def load_env() -> tuple[str, str]:
    """GEMINI_API_KEY/GEMINI_MODEL aus os.environ (von fitness.catalog.core.paths
    aus ~/.env/fitness.env geladen — dieselbe Quelle wie der Rest von fitness.catalog)."""
    key = os.environ.get("GEMINI_API_KEY", "").strip().strip('"')
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip().strip('"')
    return key, model


def call(prompt: str, api_key: str, model: str) -> str:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {"contents": [{"parts": [{"text": prompt}]}]}
    resp = httpx.post(url, params={"key": api_key}, json=payload, timeout=60)
    resp.raise_for_status()
    return resp.json()["candidates"][0]["content"]["parts"][0]["text"]


def call_with_fallback(
    prompt: str,
    api_key: str,
    preferred_model: str,
    on_fallback=None,
) -> str | None:
    """Versucht preferred_model, fällt auf FALLBACK_MODELS zurück bei 503/429."""
    models = [preferred_model] + [m for m in FALLBACK_MODELS if m != preferred_model]
    for model in models:
        try:
            result = call(prompt, api_key, model)
            if model != preferred_model and on_fallback:
                on_fallback(model)
            return result
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (503, 429):
                continue
            raise
    return None


def extract_yaml_block(text: str) -> str:
    if "```yaml" in text:
        start = text.index("```yaml") + 7
        end = text.index("```", start)
        return text[start:end].strip()
    if "```" in text:
        start = text.index("```") + 3
        end = text.index("```", start)
        return text[start:end].strip()
    return text.strip()


def parse_response(text: str) -> dict:
    yaml_str = extract_yaml_block(text)
    parsed = yaml.safe_load(yaml_str)
    return parsed if isinstance(parsed, dict) else {}
