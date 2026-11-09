"""Gemini API — thin wrapper für anatomy-kb."""
from __future__ import annotations

from pathlib import Path

import httpx
import yaml

FALLBACK_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-flash-lite-latest",
]

ENRICH_PROMPT = """\
Du bist Anatomie-Experte für die Diplom Präventiver Vitaltrainer Ausbildung (FlexyFit, Wien).

Übung: {name}
Kategorie: {category}
Bewegungsmuster: {movement_pattern}

Beteiligte Muskeln:
  Primär: {primary}
  Sekundär: {secondary}
  Stabilisatoren: {stabilizers}

Aufgabe: Gib für jeden oben genannten Muskel die anatomischen Grunddaten an.
Sprache: Deutsch. Fachterminologie auf Latein wo sinnvoll (in Klammern).

Expert-Beispiele (Stil-Vorgabe):
  latissimus_dorsi:
    latin: "Musculus latissimus dorsi"
    origin: "Dornfortsätze Th7–L5, Fascia thoracolumbalis, Crista iliaca (labium externum), 9.–12. Rippe, Angulus inferior scapulae"
    insertion: "Crista tuberculi minoris humeri"
    innervation: "Nervus thoracodorsalis (C6–C8)"
    function_in_exercise: "Hauptmotor der Adduktion und Retroversion des Oberarms."

  pectoralis_major:
    latin: "Musculus pectoralis major"
    origin: "Pars clavicularis: mediale Hälfte der Clavicula; Pars sternocostalis: Sternum und 2.–6. Rippenknorpel; Pars abdominalis: Lamina anterior der Rectusscheide"
    insertion: "Crista tuberculi majoris humeri"
    innervation: "Nervi pectorales medialis et lateralis (C5–Th1)"
    function_in_exercise: "Hauptmotor der horizontalen Adduktion und Innenrotation."

Antworte NUR mit diesem YAML-Block, kein erklärender Text davor oder danach:

```yaml
muscle_anatomy:
  muskelname_snake_case:
    latin: "Musculus ..."
    origin: "Ursprung (Origo) — genaue Knochenstruktur"
    insertion: "Ansatz (Insertio) — genaue Knochenstruktur"
    innervation: "Nervname (Segmente C/L/S)"
    function_in_exercise: "Was dieser Muskel in dieser Übung konkret tut (1-2 Sätze)"
```
"""

INGEST_PROMPT = """\
Du bist Anatomie-Experte für die Diplom Präventiver Vitaltrainer Ausbildung.

Unten steht eine Trainingsnotiz zu: {name}

Deine Aufgabe: Extrahiere aus der Notiz strukturierte Anatomiedaten als YAML.

Extrahiere folgende Blöcke:

1. **muscle_anatomy** — für JEDEN erwähnten Muskel:
   - latin: Lateinischer Name
   - origin: Ursprung (Origo) — präzise Knochenstruktur
   - insertion: Ansatz (Insertio) — präzise Knochenstruktur
   - innervation: Nerv + Segmente
   - function_in_exercise: Was dieser Muskel in dieser Übung tut (1-2 Sätze Deutsch)

2. **common_errors_explained** — aus dem "Häufige Fehler" Abschnitt:
   - error_id als snake_case Key
   - description: Fehler kurz beschrieben
   - anatomical_reason: Warum es biomechanisch/anatomisch passiert
   - correction: Wie korrigieren
   - teaches: Welche anatomischen Konzepte es lehrt (Liste)

Antworte NUR mit dem YAML-Block, kein Text davor oder danach:

```yaml
muscle_anatomy:
  muskelname_snake_case:
    latin: "..."
    origin: "..."
    insertion: "..."
    innervation: "..."
    function_in_exercise: "..."

common_errors_explained:
  fehler_id_snake_case:
    description: "..."
    anatomical_reason: "..."
    correction: "..."
    teaches:
      - konzept_1
```

Wenn Ursprung/Ansatz in der Notiz nicht explizit genannt: aus anatomischem Fachwissen ergänzen.
Wenn ein Fehlerabschnitt fehlt: leeres `common_errors_explained: {{}}` zurückgeben.
Muskel-Keys immer snake_case, keine Leerzeichen.

---
NOTIZ:
{note_content}
"""


def load_env() -> tuple[str, str]:
    """Lädt GEMINI_API_KEY + GEMINI_MODEL aus ~/.env/gemini.env."""
    env_file = Path.home() / ".env" / "gemini.env"
    key, model = "", "gemini-2.5-flash"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith("GEMINI_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"')
            elif line.startswith("GEMINI_MODEL="):
                model = line.split("=", 1)[1].strip().strip('"')
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
