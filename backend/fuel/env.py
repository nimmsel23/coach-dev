"""Minimal .env loader — no python-dotenv dependency."""

from __future__ import annotations

import os
from pathlib import Path


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            key, sep, value = line.partition("=")
            key = key.strip()
            if not sep or not key:
                continue
            if key.startswith("export "):
                key = key[7:].strip()
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            os.environ.setdefault(key, value)


def load_fuel_env() -> None:
    home = Path.home()
    load_env_file(home / ".env" / "gemini.env")
    load_env_file(home / ".env" / "fuel.env")
