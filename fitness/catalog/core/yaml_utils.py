from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


# libyaml-Parser (CSafeLoader) ist ~10x schneller als der reine Python-SafeLoader und
# liefert dieselben Datenstrukturen; Fallback bleibt der SafeLoader (kein libyaml installiert).
_SAFE_LOADER = getattr(yaml, "CSafeLoader", yaml.SafeLoader)


def load_yaml(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return yaml.load(handle, Loader=_SAFE_LOADER)


def dump_yaml(data: Any, path: Path) -> None:
    with path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(data, handle, sort_keys=False, allow_unicode=True)
