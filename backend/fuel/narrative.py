"""Narrative parser for meal logging.

Detektiert Erzähl-Marker in Mahlzeit-Beschreibungen:
  • "N Teller/Portionen/Mahlzeiten/mal"     → count
  • "Nachmittag bis Abend" / "von X bis Y"  → time window
  • "Mahlzeit heute …", "insgesamt", "bis jetzt", …  → Rauschen, wird gestrippt

Output: count, time_window (tuple[hour,hour]|None), items_text (clean für Gemini).

KEINE NLP — nur Regex-Pattern für deutsche Mahlzeit-Sätze. Sentinel: wenn
nichts erkannt wird, count=1, items_text=text unverändert.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from loguru import logger

from . import log as _log  # configures loguru

_log.setup()

TIME_OF_DAY_RANGES: dict[str, tuple[int, int]] = {
    "morgen": (6, 9), "morgens": (6, 9), "frueh": (5, 9), "früh": (5, 9),
    "vormittag": (9, 11), "vormittags": (9, 11),
    "mittag": (11, 14), "mittags": (11, 14), "lunch": (11, 14),
    "nachmittag": (14, 18), "nachmittags": (14, 18),
    "abend": (18, 22), "abends": (18, 22),
    "nacht": (22, 26), "nachts": (22, 26),
    "spätabend": (21, 23), "spaetabend": (21, 23),
}

COUNT_RE = re.compile(
    r"\b(\d+)\s*(?:teller|portionen|portion|mahlzeiten|mahlzeit|mal|x\b)",
    re.IGNORECASE,
)

# "von Nachmittag bis Abend", "Nachmittag bis Abend", "Nachmittag - Abend"
RANGE_RE = re.compile(
    r"(?:von\s+)?(?:heute\s+|gestern\s+)?"
    r"(morgens?|vormittags?|mittags?|nachmittags?|abends?|nachts?|früh|frueh|spätabend|spaetabend)"
    r"\s*(?:bis|-|–|—|jetzt\s+am)\s*"
    r"(?:jetzt\s+am\s+)?"
    r"(morgens?|vormittags?|mittags?|nachmittags?|abends?|nachts?|früh|frueh|spätabend|spaetabend)",
    re.IGNORECASE,
)

# Pure narrative-noise phrases. Patterns must NOT match item descriptions
# (Mengen + Lebensmittel). Each pattern matches only the noise phrase itself.
NOISE_PATTERNS = [
    r"\bInsgesamt gehört zu der Mahlzeit\b",
    r"\bMahlzeit (?:gesamt|insgesamt)\b",
    r"\bzu der Mahlzeit\b",
    r"\(?\s*\d+\s*(?:teller|portionen|portion|mahlzeiten|mahlzeit)\s*(?:insgesamt)?\s*\)?",
    r"\binsgesamt\b",
    r"\bbis jetzt\b",
    r"\bjetzt am\b",
    r"\bvon\s+(?:morgens?|vormittags?|mittags?|nachmittags?|abends?|nachts?|früh|frueh|spätabend|spaetabend)\s+bis\s+(?:morgens?|vormittags?|mittags?|nachmittags?|abends?|nachts?|früh|frueh|spätabend|spaetabend)\b",
    r"\b(?:morgens?|vormittags?|mittags?|nachmittags?|abends?|nachts?|früh|frueh|spätabend|spaetabend)\s+bis\s+(?:morgens?|vormittags?|mittags?|nachmittags?|abends?|nachts?|früh|frueh|spätabend|spaetabend)\b",
    r"\b(?:morgens?|vormittags?|mittags?|nachmittags?|abends?|nachts?|früh|frueh|spätabend|spaetabend)\b",
    r"\bhab(?:e)?\s+(?:grad(?:e)?|gerade|jetzt|heute)?\s*gegessen\b",
    r"\bgeh[oö]rt\b",
]


@dataclass
class ParsedNarrative:
    count: int
    time_window: tuple[int, int] | None
    items_text: str
    raw: str


def parse(text: str) -> ParsedNarrative:
    raw = text
    count = 1
    m = COUNT_RE.search(text)
    if m:
        try:
            count = max(1, int(m.group(1)))
        except ValueError:
            pass

    time_window: tuple[int, int] | None = None
    m = RANGE_RE.search(text)
    if m:
        a, b = m.group(1).lower(), m.group(2).lower()
        if a in TIME_OF_DAY_RANGES and b in TIME_OF_DAY_RANGES:
            time_window = (TIME_OF_DAY_RANGES[a][0], TIME_OF_DAY_RANGES[b][1])

    clean = text
    for pat in NOISE_PATTERNS:
        clean = re.sub(pat, " ", clean, flags=re.IGNORECASE)
    # Orphan-Präpositionen/Artikel am Anfang (nach Noise-Strip)
    clean = re.sub(
        r"^(?:[\s,:.;()-]|\b(?:am|im|den|der|die|das|zum|zur|bis|von)\b)+",
        "",
        clean,
        flags=re.IGNORECASE,
    )
    clean = re.sub(r"\s+", " ", clean)
    clean = re.sub(r"[\s,:.;()-]+$", "", clean)
    clean = clean.strip()

    parsed = ParsedNarrative(count=count, time_window=time_window, items_text=clean, raw=raw)
    logger.debug(f"parsed: count={parsed.count} window={parsed.time_window} items={parsed.items_text!r}")
    return parsed


def spread_times(count: int, window: tuple[int, int] | None) -> list[str | None]:
    """Verteile count Einträge gleichmäßig im Fenster. None = kein Slot."""
    if not window or count < 1:
        return [None] * count
    start, end = window
    if end <= start:
        end += 24
    span = end - start
    if span <= 0 or count == 1:
        mid_h = (start + end) / 2
        return [_fmt_hour(mid_h)]
    step = span / count
    out: list[str | None] = []
    for i in range(count):
        h = start + step * (i + 0.5)
        out.append(_fmt_hour(h))
    return out


def _fmt_hour(h: float) -> str:
    h_mod = h % 24
    hr = int(h_mod)
    mn = int(round((h_mod - hr) * 60))
    if mn == 60:
        hr = (hr + 1) % 24
        mn = 0
    return f"{hr:02d}:{mn:02d}"
