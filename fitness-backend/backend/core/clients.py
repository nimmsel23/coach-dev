"""Klienten-Registry aus ~/Klienten/*/client.json (nur lesen)."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Client:
    uid: str
    name: str
    slug: str
    is_coach: bool


def klienten_dir() -> Path:
    return Path(os.environ.get("FITNESS_KLIENTEN_DIR", Path.home() / "Klienten"))


def load_clients(directory: Path | None = None) -> dict[str, Client]:
    """uid -> Client. Verzeichnisse ohne lesbare client.json (Templates etc.) werden ignoriert."""
    directory = directory or klienten_dir()
    registry: dict[str, Client] = {}
    if not directory.is_dir():
        return registry
    for sub in sorted(directory.iterdir()):
        cfg_path = sub / "client.json"
        if not cfg_path.is_file():
            continue
        try:
            cfg = json.loads(cfg_path.read_text())
        except Exception:
            continue
        if not isinstance(cfg, dict):
            continue
        uids = [u for u in (cfg.get("firebase_uids") or []) if u]
        if cfg.get("firebase_uid"):
            uids.append(cfg["firebase_uid"])
        is_coach = "coach" in (cfg.get("role"), cfg.get("status"))
        name = str(cfg.get("name") or sub.name)
        for uid in dict.fromkeys(uids):
            registry[uid] = Client(uid=uid, name=name, slug=sub.name, is_coach=is_coach)
    return registry
