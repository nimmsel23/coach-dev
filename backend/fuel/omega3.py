"""Omega-3 recognition: missing is unknown, never a fabricated zero."""
import math
from pathlib import Path

OMEGA3_RULES = (Path(__file__).parent / "constants/omega3-rules.txt").read_text()
OMEGA3_KEYS = ("omega3_mg", "omega3_ala_mg", "omega3_epa_mg", "omega3_dha_mg", "omega3_dpa_mg", "omega3_epa_dha_mg")

def normalize_omega3(raw):
    out = dict(raw)
    for key in OMEGA3_KEYS:
        value = raw.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            out.pop(key, None)
    if all(key in out for key in ("omega3_epa_mg", "omega3_dha_mg")):
        out["omega3_epa_dha_mg"] = out["omega3_epa_mg"] + out["omega3_dha_mg"]
    parts = OMEGA3_KEYS[1:5]
    if all(key in out for key in parts):
        out["omega3_mg"] = max(out.get("omega3_mg", 0), sum(out[key] for key in parts))
    return out
