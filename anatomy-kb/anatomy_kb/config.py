"""Central path resolver for anatomy-kb (coach-dev SOT).

Canonical layout (2026-11-09):
  ~/dev/coach-dev/anatomy-kb/     — this package (SOT)
  ~/dev/coach-dev/fitness/catalog/kb/   — YAML SSOT (submodule nimmsel23/fitness)
  ~/dev/fitness                         — same KB, standalone checkout

Compat symlinks (not SOT):
  ~/dev/coach-dev/anatomy-kb = this tree (SOT)
  ~/dev/fitness-dev/anatomy-kb → here

Override:
  ANATOMY_KB_CATALOG=/path/to/catalog   (dir that contains kb/)
  ANATOMY_KB_COACH_DEV=/path/to/coach-dev
  ANATOMY_KB_FITNESS_DEV=…              (legacy alias for a repo with catalog/kb)
"""
from __future__ import annotations

import os
from pathlib import Path

ANATOMY_KB_ROOT = Path(__file__).resolve().parent.parent


def _catalog_from_repo(repo: Path) -> Path | None:
    for rel in ("fitness/catalog", "catalog"):
        cand = repo / rel
        if (cand / "kb").exists():
            return cand
    return None


def get_catalog_dir() -> Path | None:
    if env := os.environ.get("ANATOMY_KB_CATALOG"):
        p = Path(env)
        if (p / "kb").exists():
            return p
        if p.name == "kb" and p.exists():
            return p.parent

    for key in ("ANATOMY_KB_COACH_DEV", "ANATOMY_KB_FITNESS_DEV"):
        if env := os.environ.get(key):
            found = _catalog_from_repo(Path(env))
            if found:
                return found

    home = Path.home()
    # Preferred: coach-dev catalog submodule
    for repo in (
        home / "dev" / "coach-dev",
        home / "dev" / "fitness",  # bare KB checkout: treat as catalog root? no — kb at root
    ):
        found = _catalog_from_repo(repo)
        if found:
            return found

    # Bare KB repo ~/dev/fitness has kb at root (exercises/, muscles/, …)
    bare = home / "dev" / "fitness"
    if (bare / "muscles").exists() and (bare / "exercises").exists():
        return bare  # callers use CATALOG_DIR / "kb" / … — adapt below

    # Walk up: package lives in coach-dev/anatomy-kb
    found = _catalog_from_repo(ANATOMY_KB_ROOT.parent)
    if found:
        return found

    return None


def get_fitness_dev() -> Path | None:
    """Repo root that owns the catalog tools (usually coach-dev)."""
    cat = get_catalog_dir()
    if not cat:
        return None
    # bare KB ~/dev/fitness — no nested kb/
    if cat.name == "fitness" and (cat / "muscles").exists() and not (cat / "kb").exists():
        return cat
    if cat.name == "catalog" and cat.parent.name == "fitness":
        return cat.parent.parent
    if cat.name == "catalog":
        return cat.parent
    return cat.parent


CATALOG_DIR = get_catalog_dir()
FITNESS_DEV = get_fitness_dev()

# Support both layouts: catalog/kb/… and bare KB repo (kb files at root)
if CATALOG_DIR and (CATALOG_DIR / "kb").exists():
    _KB = CATALOG_DIR / "kb"
elif CATALOG_DIR and (CATALOG_DIR / "muscles").exists():
    _KB = CATALOG_DIR
else:
    _KB = None

CATALOG_EXERCISES = _KB / "exercises" if _KB else None
ANATOMY_TEACHING = _KB / "anatomy_teaching" if _KB else None
MUSCLES_KB = _KB / "muscles" if _KB else None
