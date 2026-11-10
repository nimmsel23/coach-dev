"""Filesystem roots shared by the Fuel package entry points."""

from __future__ import annotations

import os
from pathlib import Path

from .env import load_env_file, load_fuel_env

PACKAGE_ROOT = Path(__file__).resolve().parent          # …/backend/fuel
BACKEND_ROOT = PACKAGE_ROOT.parent                      # …/backend
COACH_ROOT = BACKEND_ROOT.parent                        # …/coach-dev

# YAML-Kataloge / App-Checkout bleiben in fuel-dev, bis die auch wandern.
# Override: FUEL_REPO_DIR=/path/to/fuel-dev
_DEFAULT_REPO = Path.home() / "dev" / "fuel-dev"
REPO_DIR = Path(os.environ.get("FUEL_REPO_DIR", _DEFAULT_REPO)).expanduser()

load_env_file(REPO_DIR / ".env")
load_fuel_env()
if not os.environ.get("AOS_FUEL_DATA_DIR") and os.environ.get("AOS_FUEL_DIR"):
    os.environ["AOS_FUEL_DATA_DIR"] = os.environ["AOS_FUEL_DIR"]
