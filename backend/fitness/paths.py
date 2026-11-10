"""
fitness.paths — Alle Pfad-Konstanten und -Auflösungen.

Zentralisiert: UID-Erkennung, sessions_dir, sqlite_db, Klienten-Root.
"""
from __future__ import annotations

from pathlib import Path

# ── Roots ─────────────────────────────────────────────────────────────────────
PACKAGE_ROOT = Path(__file__).resolve().parent          # …/backend/fitness
BACKEND_ROOT = PACKAGE_ROOT.parent                      # …/backend (fitness/fuel/…)
REPO_ROOT = BACKEND_ROOT.parent                         # …/coach-dev

# ── AOS User-Store ────────────────────────────────────────────────────────────
_uid_file  = Path.home() / ".aos" / "users" / ".active-uid"
ACTIVE_UID = _uid_file.read_text().strip() if _uid_file.exists() else None
AOS_USERS  = Path.home() / ".aos" / "users"
_AOS_FITNESS = (AOS_USERS / ACTIVE_UID / "fitness") if ACTIVE_UID else None

import os

def sessions_dir(uid: str | None = None) -> Path:
    """Primär: ~/.aos/users/<uid>/fitness/sessions/  Fallback: <repo>/data/sessions/"""
    target_uid = uid or os.getenv("FITNESS_UID") or os.getenv("AOS_UID") or ACTIVE_UID
    if target_uid:
        aos_fitness = AOS_USERS / target_uid / "fitness"
        if (aos_fitness / "sessions").exists():
            return aos_fitness / "sessions"
    return REPO_ROOT / "data" / "sessions"

def sqlite_db(uid: str | None = None) -> Path:
    return sessions_dir(uid) / "training_history.sqlite"

# ── Klienten ──────────────────────────────────────────────────────────────────
# SOT: ~/.local/Klienten (wie Coach-Server). ~/Klienten oft alter Symlink.
def resolve_klienten_dir() -> Path:
    for key in ("CLIENTS_ROOT", "KLIENTEN_DIR"):
        raw = os.getenv(key)
        if raw:
            return Path(raw).expanduser().resolve()
    local = Path.home() / ".local" / "Klienten"
    if local.is_dir():
        return local.resolve()
    legacy = Path.home() / "Klienten"
    if legacy.exists():
        return legacy.resolve()
    return local


KLIENTEN_DIR = resolve_klienten_dir()
KLIENTEN_SKIP = frozenset({
    "default", "kb", "_registry", "_entries",
    "_template", "_templates", "buchhaltung",
})
