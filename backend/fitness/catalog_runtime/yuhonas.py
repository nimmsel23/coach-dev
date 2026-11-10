"""yuhonas free-exercise-db direkt als Laufzeit-Quelle (nur lesen, nie in die KB importieren).

Quelle ist der Git-Klon (`dist/exercises.json` + `exercises/<Id>/<n>.jpg`). Er wird nicht
verändert und nicht über das Netz nachgeladen — fehlt er, gibt es eine klare Fehlermeldung.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import quote

IMAGE_ROUTE_PREFIX = "/api/catalog/images/"      # Route, die der API-Router bereitstellt
IMAGE_SUFFIXES = frozenset({".jpg", ".jpeg", ".png", ".gif", ".webp"})
_DEFAULT_DIRS = (
    Path.home() / ".local" / "fitness" / "free-exercise-db",
    Path.home() / "fitness" / "free-exercise-db",      # Altpfad (existiert aktuell nicht mehr)
)


class YuhonasUnavailable(RuntimeError):
    """Der yuhonas-Klon fehlt oder ist unbrauchbar."""


@dataclass(frozen=True)
class YuhonasEntry:
    raw_id: str                       # z.B. "Chin-Up" (Ordner-/Dateiname im Klon)
    exercise_id: str                  # "yuhonas_chin-up" (Schema des früheren Imports, in Sessions in Gebrauch)
    name: str
    category: str | None = None
    equipment: str | None = None
    level: str | None = None
    force: str | None = None
    mechanic: str | None = None
    primary_muscles: tuple[str, ...] = ()      # rohe yuhonas-Wörter ("lower back", ...)
    secondary_muscles: tuple[str, ...] = ()
    instructions: tuple[str, ...] = ()
    images: tuple[str, ...] = ()               # relativ zu exercises/, z.B. "Chin-Up/0.jpg"

    def image_urls(self) -> list[str]:
        return [IMAGE_ROUTE_PREFIX + quote(p) for p in self.images]

    def as_dict(self) -> dict[str, Any]:
        return {
            "raw_id": self.raw_id, "exercise_id": self.exercise_id, "name": self.name,
            "category": self.category, "equipment": self.equipment, "level": self.level,
            "force": self.force, "mechanic": self.mechanic,
            "primary_muscles": list(self.primary_muscles), "secondary_muscles": list(self.secondary_muscles),
            "instructions": list(self.instructions),
            "images": [{"path": p, "url": IMAGE_ROUTE_PREFIX + quote(p)} for p in self.images],
        }


@dataclass(frozen=True)
class YuhonasDB:
    root: Path
    entries: tuple[YuhonasEntry, ...]
    by_exercise_id: Mapping[str, YuhonasEntry] = field(repr=False, default_factory=dict)
    by_raw_id: Mapping[str, YuhonasEntry] = field(repr=False, default_factory=dict)


def exercise_id_for(raw_id: str) -> str:
    """Gleiches Schema wie der frühere Import: yuhonas_<id klein, Leerzeichen → _>."""
    return "yuhonas_" + raw_id.lower().replace(" ", "_")


def yuhonas_dir(env: Mapping[str, str] | None = None) -> Path:
    env = os.environ if env is None else env
    explicit = (env.get("FITNESS_YUHONAS_DIR") or "").strip()
    if explicit:
        return Path(explicit).expanduser()
    for candidate in _DEFAULT_DIRS:
        if (candidate / "dist" / "exercises.json").is_file():
            return candidate
    return _DEFAULT_DIRS[0]


def _as_str_tuple(value: Any) -> tuple[str, ...]:
    return tuple(str(v) for v in value) if isinstance(value, list) else ()


def _entry(item: dict[str, Any]) -> YuhonasEntry | None:
    raw_id, name = item.get("id"), item.get("name")
    if not isinstance(raw_id, str) or not raw_id or not isinstance(name, str) or not name:
        return None
    return YuhonasEntry(
        raw_id=raw_id, exercise_id=exercise_id_for(raw_id), name=name,
        category=item.get("category"), equipment=item.get("equipment"), level=item.get("level"),
        force=item.get("force"), mechanic=item.get("mechanic"),
        primary_muscles=_as_str_tuple(item.get("primaryMuscles")),
        secondary_muscles=_as_str_tuple(item.get("secondaryMuscles")),
        instructions=_as_str_tuple(item.get("instructions")),
        images=_as_str_tuple(item.get("images")),
    )


_cache: dict[tuple, YuhonasDB] = {}


def load(root: Path | None = None) -> YuhonasDB:
    """Lädt dist/exercises.json (gecacht; ändert sich die Datei, wird neu geladen)."""
    root = Path(root) if root is not None else yuhonas_dir()
    dist = root / "dist" / "exercises.json"
    try:
        st = dist.stat()
    except OSError:
        raise YuhonasUnavailable(
            f"yuhonas-Klon nicht gefunden: erwartet {dist}. FITNESS_YUHONAS_DIR auf den Klon von "
            "github.com/yuhonas/free-exercise-db setzen (wird nicht automatisch nachgeladen)."
        ) from None
    key = (str(root), st.st_mtime_ns, st.st_size)
    cached = _cache.get(key)
    if cached is not None:
        return cached
    try:
        data = json.loads(dist.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise YuhonasUnavailable(f"{dist} ist nicht lesbar: {exc}") from None
    if not isinstance(data, list):
        raise YuhonasUnavailable(f"{dist}: Liste von Übungen erwartet")
    entries = tuple(e for e in (_entry(i) for i in data if isinstance(i, dict)) if e is not None)
    db = YuhonasDB(
        root=root, entries=entries,
        by_exercise_id={e.exercise_id: e for e in entries},
        by_raw_id={e.raw_id: e for e in entries},
    )
    _cache.clear()
    _cache[key] = db
    return db


def status(root: Path | None = None) -> dict[str, Any]:
    try:
        db = load(root)
    except YuhonasUnavailable as exc:
        return {"available": False, "error": str(exc)}
    return {"available": True, "path": str(db.root), "entries": len(db.entries)}


def resolve_image(rel_path: str, root: Path | None = None) -> Path | None:
    """Sicherer Bildpfad: `rel_path` (z.B. "Chin-Up/0.jpg") → Datei im Klon oder None.

    Abgelehnt werden absolute Pfade, `..`/`.`-Segmente, Backslashes, NUL-Bytes, leere Segmente,
    unbekannte Endungen und Symlinks, die aus `exercises/` herausführen.
    """
    if not isinstance(rel_path, str) or not rel_path or "\x00" in rel_path or "\\" in rel_path:
        return None
    if rel_path.startswith("/"):
        return None
    parts = rel_path.split("/")
    if any(p in ("", ".", "..") for p in parts):
        return None
    if Path(rel_path).suffix.lower() not in IMAGE_SUFFIXES:
        return None
    try:
        base = ((Path(root) if root is not None else yuhonas_dir()) / "exercises").resolve()
        candidate = (base / rel_path).resolve()
    except (OSError, RuntimeError):
        return None
    if not candidate.is_relative_to(base) or not candidate.is_file():
        return None
    return candidate
