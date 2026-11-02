"""Load the Relax-owned FastAPI application as routes inside Coach :9150."""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path


def load_relax_app():
    source = Path(os.environ.get(
        "COACH_RELAX_API_FILE",
        Path.home() / "dev" / "relax-dev" / "server.py",
    )).expanduser().resolve()
    if not source.is_file():
        return None
    module_name = "coach_embedded_relax_api"
    spec = importlib.util.spec_from_file_location(module_name, source)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load Relax API from {source}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module.app
