"""Laufzeit-Einstellungen aus der Umgebung (explizit, testbar — kein Import-Seiteneffekt)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping


@dataclass(frozen=True)
class Settings:
    data_root: Path        # enthält users/<uid>/sessions, logs/, .fitsync/
    klienten_dir: Path     # ~/Klienten/*/client.json
    host: str
    port: int
    frontend_dist: Path | None = None   # gebautes Frontend (index.html + assets); None = nicht ausliefern

    @property
    def is_loopback(self) -> bool:
        return self.host in {"127.0.0.1", "localhost", "::1"}

    @property
    def log_dir(self) -> Path:
        return self.data_root / "logs"


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    env = os.environ if env is None else env
    home = Path.home()
    return Settings(
        data_root=Path(env.get("FITNESS_DATA_ROOT") or home / ".aos" / "fitness"),
        klienten_dir=Path(env.get("FITNESS_KLIENTEN_DIR") or home / "Klienten"),
        host=env.get("FITNESS_HOST") or "127.0.0.1",
        port=int(env.get("FITNESS_PYTHON_PORT") or env.get("FITNESS_PORT") or 9150),
        frontend_dist=Path(env.get("FITNESS_FRONTEND_DIST") or Path(__file__).resolve().parents[2] / "frontend" / "dist"),
    )
