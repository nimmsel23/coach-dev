"""Lädt die Nährwert-Key-Listen aus nutrients.yaml (SSOT, siehe dort).

Genutzt von: sources/usda.py-Konsumenten, ingredient_add.py,
supplement_add.py — statt jede Liste als Python-Literal zu duplizieren.
"""

from __future__ import annotations

from pathlib import Path

import yaml

_YAML_PATH = Path(__file__).resolve().parent / "nutrients.yaml"
_data = yaml.safe_load(_YAML_PATH.read_text(encoding="utf-8"))

MACRO_KEYS: list[str] = _data["macro_keys"]
MICRO_KEYS: list[str] = _data["micro_keys"]
ALL_KEYS: list[str] = MACRO_KEYS + MICRO_KEYS
