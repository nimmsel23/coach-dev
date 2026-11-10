"""Freitext → strukturierte Mahlzeiten (Stufe 1 der Meal-Pipeline).

Ein LLM-Call zerlegt den Satz in Mahlzeiten und Zutaten (Name, Marke, Menge,
Einheit, unscharfes Mengenwort). Alles Rechenbare passiert danach im Code
(fuel/units.py): Gramm aus "5dag"/"2 EL", Unterscheidung stated/piece/guessed,
Tag und Uhrzeit werden validiert statt dem LLM geglaubt.

Die Nährwerte selbst schätzt weiterhin fuel.gemini.estimate_nutrition — aber
auf einem normalisierten Text mit festen Gramm-Angaben (`ParsedMeal.estimate_text`)
statt auf dem rohen Satz. Schlägt das Parsen fehl, liefert parse_input() None
und der Aufrufer fällt auf den bisherigen Pfad zurück.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal

from loguru import logger
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from . import log as _log
from .dates import resolve as _resolve_day
from .units import PIECE_UNITS, UNIT_GRAMS, VAGUE_WORDS, grams_for, vague_direction

_log.setup()

MealType = Literal["breakfast", "lunch", "dinner", "snack"]

# Wörter, die auf mehrere Zutaten/Mahlzeiten/Zeitangaben hindeuten. Ohne einen
# davon ist ein Satz ein einzelnes Item und der Extra-Parse-Call lohnt nicht.
_COMPLEX_HINT = re.compile(
    r"[,;+&]|^\s*\d+(?:[.,]\d+)?\s*[^\W\d]|\b(?:und|mit|von|dazu|danach|nachher|plus|sowie|bissl|bisserl|bisschen|"
    r"etwas|wenig|viel|fr[uü]hst[uü]ck|mittag|abend|jause|heute|gestern|"
    r"vorgestern|um\s+\d|uhr|vor\s+\d|morgens|abends|mittags)\b",
    re.IGNORECASE,
)


def looks_complex(text: str) -> bool:
    return bool(_COMPLEX_HINT.search(text)) or len(text.split()) >= 8


class ParsedItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = Field(..., min_length=1)
    brand: str | None = None
    count: float | None = Field(None, ge=0)
    unit: str | None = None
    vague: str | None = None          # "bissl", "viel" … wie im Text
    piece_g: float | None = Field(None, gt=0)       # Gewicht EINES Stücks (Schätzung)
    grams_guess: float | None = Field(None, gt=0)   # Gesamtgewicht, nur ohne Menge im Text
    prep: Literal["raw", "cooked"] | None = None

    @field_validator("count", "piece_g", "grams_guess", mode="before")
    @classmethod
    def _num(cls, v):
        if v in (None, ""):
            return None
        if isinstance(v, str):
            v = v.replace(",", ".")
        return v

    def grams(self) -> tuple[float | None, str]:
        grams, source = grams_for(
            self.count, self.unit, piece_g=self.piece_g, grams_guess=self.grams_guess,
        )
        # "ein bissl Brot": Wortmenge ist immer geschätzt, auch wenn das LLM eine
        # Stückzahl mitliefert.
        if source == "stated" and self.vague:
            return grams, "guessed"
        return grams, source


class ParsedMeal(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = Field(..., min_length=1)   # Originalwortlaut dieser Mahlzeit
    meal_type: MealType | None = None
    day: str | None = None                 # heute|gestern|vorgestern|YYYY-MM-DD
    time: str | None = None                # HH:MM
    items: list[ParsedItem] = Field(..., min_length=1)

    @field_validator("time")
    @classmethod
    def _time(cls, v):
        if not v:
            return None
        try:
            return datetime.strptime(v.strip(), "%H:%M").strftime("%H:%M")
        except ValueError:
            logger.warning(f"parse: ungültige Uhrzeit {v!r} verworfen")
            return None

    def resolved_day(self, today: date | None = None) -> str | None:
        if not self.day:
            return None
        try:
            return _resolve_day(self.day, today=today)
        except ValueError:
            logger.warning(f"parse: Tag {self.day!r} nicht erkannt, verworfen")
            return None

    def guessed_items(self) -> list[ParsedItem]:
        return [i for i in self.items if i.grams()[1] in ("guessed", "unknown")]

    def estimate_text(self) -> str:
        """Normalisierter Schätz-Text: feste Gramm-Angaben pro Zutat."""
        parts: list[str] = []
        for it in self.items:
            grams, source = it.grams()
            label = it.name + (f" ({it.brand})" if it.brand else "")
            if it.prep == "cooked":
                label += " gekocht"
            if grams is None:
                parts.append(label)
            elif source == "guessed":
                parts.append(f"ca. {grams:g} g {label} (Menge geschätzt)")
            else:
                parts.append(f"{grams:g} g {label}")
        return "; ".join(parts)


class ParsedInput(BaseModel):
    model_config = ConfigDict(extra="ignore")
    meals: list[ParsedMeal] = Field(..., min_length=1)


def _prompt(text: str, today: date) -> str:
    units = ", ".join(sorted(UNIT_GRAMS))
    pieces = ", ".join(sorted(PIECE_UNITS))
    vague = ", ".join(sorted(VAGUE_WORDS))
    return f"""Zerlege diese Mahlzeiten-Beschreibung (Deutsch/Österreichisch) in strukturierte Daten.
Heute ist {today.isoformat()} ({today.strftime('%A')}).

Eingabe: "{text}"

REGELN:
1. Eine Eingabe kann MEHRERE Mahlzeiten enthalten ("zum Frühstück …, mittags …") → je eine Mahlzeit. Sonst genau eine.
2. "text" = der Originalwortlaut dieser Mahlzeit, unverändert (nur Zeit-/Tageswörter dürfen fehlen).
3. Pro Zutat: "name" ohne Menge und ohne Marke, "brand" nur wenn genannt (z.B. "Ja! Natürlich", "Billa").
4. Mengen NUR aus dem Text übernehmen: "count" = Zahl, "unit" = Einheit wörtlich. Bekannte Einheiten: {units}. Zähleinheiten: {pieces}. Österreichisch: "5dag" = count 5, unit "dag".
5. Unscharfe Wörter ({vague}) → "vague" mit dem Wort, count/unit leer lassen.
6. "piece_g" = realistisches Gewicht EINES Stücks, wenn nur eine Stückzahl dasteht ("4 Debreziner" → count 4, piece_g 50). "grams_guess" = realistisches Gesamtgewicht, wenn keine Menge oder nur ein unscharfes Wort dasteht. Beides leer lassen, wenn die Menge exakt in Gramm/ml angegeben ist.
7. "prep": "cooked" nur wenn "gekocht/zubereitet" dabeisteht, "raw" nur bei explizit roh, sonst null.
8. "meal_type": breakfast|lunch|dinner|snack nur wenn aus dem Text erkennbar, sonst null.
9. "day": "heute"|"gestern"|"vorgestern" oder YYYY-MM-DD nur wenn genannt, sonst null. "time": HH:MM (24h) nur wenn genannt ("um 13 Uhr", "vor 2 Stunden" → ausrechnen), sonst null.

Antworte NUR mit JSON, keine Erklärung, kein Markdown:
{{"meals": [{{"text": "...", "meal_type": null, "day": null, "time": null,
  "items": [{{"name": "...", "brand": null, "count": null, "unit": null, "vague": null,
             "piece_g": null, "grams_guess": null, "prep": null}}]}}]}}
"""


def parse_input(text: str, *, today: date | None = None) -> ParsedInput | None:
    """Freitext → ParsedInput. None bei jedem Fehler (kein Key, Netz, ungültiges JSON)."""
    from .gemini import _extract_json, call_gemini

    today = today or date.today()
    res = call_gemini(_prompt(text, today), retries=1, timeout=20, log_label="parse_input")
    if not res.get("ok"):
        logger.warning(f"parse_input: Gemini-Fehler {res.get('error')}")
        return None
    raw = _extract_json(res["text"])
    if not raw:
        logger.warning(f"parse_input: kein JSON: {res['text'][:120]!r}")
        return None
    try:
        return ParsedInput.model_validate(raw)
    except ValidationError as exc:
        logger.warning(f"parse_input: Schema verletzt ({exc.error_count()} Fehler)")
        return None


# ── Stufe 2: Zutaten auflösen ────────────────────────────────────────────────

_SUM_KEYS = ("kcal", "protein", "carbs", "fat")


class ResolvedMeal(BaseModel):
    macros: dict[str, float]
    micros: dict[str, float] = Field(default_factory=dict)
    components: list[dict] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)   # Terminal-Hinweise (Quelle/Schätzung)
    estimated: bool = False                          # True wenn ein Gemini-Call nötig war


def _catalog_ingredient(item: ParsedItem) -> dict | None:
    """Catalog-Baustein (kind=ingredient mit yield_g) zum Item, sonst None."""
    from .catalog_lookup import find_ingredient

    return find_ingredient(item.name, item.brand)


def resolve_meal(meal: ParsedMeal) -> ResolvedMeal | None:
    """Catalog-Bausteine pro Zutat, Rest in EINEM Schätz-Call; Summe rechnet der Code.

    None, wenn weder Catalog noch Schätzung etwas liefern (Aufrufer bricht ab).
    """
    from .catalog_lookup import extract_macros
    from .micros import ingredient_micros

    total = dict.fromkeys(_SUM_KEYS, 0.0)
    micros: dict[str, float] = {}
    components: list[dict] = []
    notes: list[str] = []
    pending: list[ParsedItem] = []

    def add_micros(src: dict, scale: float) -> None:
        for k, v in (src or {}).items():
            if isinstance(v, (int, float)) and v > 0:
                micros[k] = micros.get(k, 0.0) + v * scale

    for item in meal.items:
        hit = _catalog_ingredient(item)
        if not hit:
            pending.append(item)
            continue
        grams, source = item.grams()
        # Stückzahl ohne Gramm-Einheit: Gewicht pro Stück aus dem Catalog schlägt
        # die LLM-Schätzung (z.B. 4 Debreziner × 60 g laut Packung).
        if source != "stated" and item.count and hit.get("piece_g"):
            grams, source = round(item.count * float(hit["piece_g"]), 1), "catalog"
        if not grams:
            pending.append(item)
            continue
        scale = grams / float(hit["yield_g"])
        m = extract_macros(hit)
        for k in _SUM_KEYS:
            total[k] += m[k] * scale
        hit_micros, fresh = ingredient_micros(hit)
        if hit_micros:
            add_micros(hit_micros, scale)
            if fresh:
                notes.append(f"{hit.get('name')}: Mikros einmalig geschätzt, im Catalog gespeichert")
        else:
            notes.append(f"{hit.get('name')}: Mikros fehlen (Summe unvollständig)")
        components.append({
            "name": hit.get("name") or item.name, "qty": f"{grams:g} g",
            **{k: round(m[k] * scale, 1) for k in _SUM_KEYS},
        })
        tag = "aus Catalog" if source in ("stated", "catalog") else "Menge geschätzt, Werte aus Catalog"
        notes.append(f"{hit.get('name')}: {grams:g} g · {tag}")

    estimated = False
    if pending:
        from .gemini import estimate_nutrition

        sub = ParsedMeal(text=meal.text, items=pending)
        est = estimate_nutrition(sub.estimate_text(), verify=True)
        if est.get("_error"):
            logger.warning(f"resolve_meal: Schätzung fehlgeschlagen: {est['_error']}")
            return None
        estimated = True
        for k in _SUM_KEYS:
            total[k] += float((est.get("macros") or {}).get(k, 0) or 0)
        add_micros(est.get("micros") or {}, 1.0)
        components.extend(est.get("components") or [])
        for it in pending:
            grams, source = it.grams()
            if source in ("guessed", "unknown"):
                g = f"ca. {grams:g} g" if grams else "Menge unbekannt"
                notes.append(f"{it.name}: {g} · GESCHÄTZT (keine Menge im Text)")

    if not any(total.values()):
        return None
    return ResolvedMeal(
        macros={k: round(v, 1) for k, v in total.items()},
        micros={k: round(v, 3) for k, v in micros.items()},
        components=components, notes=notes, estimated=estimated,
    )
