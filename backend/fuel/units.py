"""Mengen-Lexikon für Freitext-Eingaben (DE/AT): Einheit → Gramm, Mengenwörter.

Single Source für den Parse-Prompt (fuel/parse.py) UND die deterministische
Gramm-Berechnung: was hier steht, wird nicht vom LLM geraten.
"""

from __future__ import annotations

import unicodedata

# Einheit (ascii-gefaltet, ohne Punkt) → Gramm. ml/l zählen als g (Wasser-Näherung).
UNIT_GRAMS: dict[str, float] = {
    "g": 1, "gr": 1, "gramm": 1,
    "dag": 10, "dkg": 10, "deka": 10, "dekagramm": 10,  # AT: 5dag = 50 g
    "kg": 1000, "kilo": 1000,
    "ml": 1, "cl": 10, "dl": 100, "l": 1000, "liter": 1000,
    "el": 15, "essloeffel": 15,
    "tl": 5, "teeloeffel": 5,
}

# Zähleinheiten: Stückzahl steht im Text, das Gewicht pro Stück nicht.
PIECE_UNITS = frozenset({
    "stk", "stueck", "x", "mal", "scheibe", "scheiben", "portion", "portionen",
    "packerl", "packung", "becher", "tasse", "schoepfer", "handvoll", "hand",
    "semmel", "semmeln", "ei", "eier", "dose", "glas",
})

# Unscharfe Mengenwörter → Richtung. Gewicht ist immer geschätzt.
VAGUE_WORDS: dict[str, str] = {
    "bissl": "small", "bisserl": "small", "bissi": "small", "bisschen": "small",
    "bissel": "small", "etwas": "small", "wenig": "small", "klein": "small",
    "ein bissl": "small", "ein bisschen": "small", "ein wenig": "small",
    "viel": "large", "reichlich": "large", "gross": "large", "haufen": "large",
}


def fold(s: str) -> str:
    """casefold + Umlaute/ß falten + Punkte entfernen ('Löffel.' → 'loeffel')."""
    s = (s or "").strip().casefold().replace("ß", "ss")
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue")):
        s = s.replace(a, b)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.replace(".", "")


def vague_direction(word: str | None) -> str | None:
    if not word:
        return None
    return VAGUE_WORDS.get(fold(word))


def grams_for(
    count: float | None,
    unit: str | None,
    *,
    piece_g: float | None = None,
    grams_guess: float | None = None,
) -> tuple[float | None, str]:
    """(Gramm, Quelle). Quelle: 'stated' | 'piece' | 'guessed' | 'unknown'.

    stated  – Menge × Einheit aus dem Text, rein rechnerisch (g, dag, EL …)
    piece   – Stückzahl aus dem Text × geschätztes Gewicht pro Stück
    guessed – keine Menge im Text, Gesamtgewicht ist LLM-Schätzung
    """
    u = fold(unit or "")
    if count and u in UNIT_GRAMS:
        return round(count * UNIT_GRAMS[u], 1), "stated"
    if count and piece_g:
        return round(count * piece_g, 1), "piece"
    if grams_guess:
        return round(float(grams_guess), 1), "guessed"
    return None, "unknown"
