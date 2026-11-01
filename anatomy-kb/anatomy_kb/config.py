"""Central path resolver for anatomy-kb.

Works in two layouts:
  Subtree:  ~/dev/fitness-dev/anatomy-kb/   (anatomy-kb is child of fitness-dev)
  Sibling:  ~/anatomy-kb/ next to ~/dev/fitness-dev/   (legacy)

Override via env: ANATOMY_KB_FITNESS_DEV=/path/to/fitness-dev
"""
from __future__ import annotations

import os
from pathlib import Path

# anatomy-kb package root (this file lives in anatomy_kb/)
ANATOMY_KB_ROOT = Path(__file__).resolve().parent.parent


def get_fitness_dev() -> Path | None:
    if env := os.environ.get("ANATOMY_KB_FITNESS_DEV"):
        p = Path(env)
        if (p / "fitness" / "catalog" / "kb").exists():
            return p
        if (p / "catalog" / "kb").exists():
            return p

    # Subtree layout: anatomy-kb/ is direct child of fitness-dev/
    candidate = ANATOMY_KB_ROOT.parent
    if (candidate / "fitness" / "catalog" / "kb").exists():
        return candidate
    if (candidate / "catalog" / "kb").exists():
        return candidate

    # Legacy sibling layout: ~/anatomy-kb/ next to ~/dev/fitness-dev/
    candidate = ANATOMY_KB_ROOT.parent / "fitness-dev"
    if (candidate / "fitness" / "catalog" / "kb").exists():
        return candidate
    if (candidate / "catalog" / "kb").exists():
        return candidate

    return None


FITNESS_DEV = get_fitness_dev()
if FITNESS_DEV:
    if (FITNESS_DEV / "fitness" / "catalog" / "kb").exists():
        CATALOG_DIR = FITNESS_DEV / "fitness" / "catalog"
    else:
        CATALOG_DIR = FITNESS_DEV / "catalog"
else:
    CATALOG_DIR = None

CATALOG_EXERCISES = CATALOG_DIR / "kb" / "exercises" if CATALOG_DIR else None
ANATOMY_TEACHING = CATALOG_DIR / "kb" / "anatomy_teaching" if CATALOG_DIR else None
