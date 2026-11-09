"""Übungs-Index: lokale KB (schneller, gecachter `build_exercise_index`) + yuhonas direkt.

* `get_local_records()` liefert dieselben Records wie `fitness.catalog.core.resolver.build_exercise_index()`
  (Gleichheit ist per Test belegt), aber mit Festplatten-Cache. Der Cache gilt nur, solange der
  Fingerabdruck (Pfad, mtime, Größe aller gelesenen KB-Dateien + resolver.py) unverändert ist.
* `get_records()` ergänzt yuhonas-Einträge, die lokal nicht als ID existieren — direkt aus dem Klon,
  nicht aus der KB. Lokale Records werden NIE verändert.
"""
from __future__ import annotations

import dataclasses
import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any

from loguru import logger

from backend.catalog import yuhonas as yu

CACHE_SCHEMA = 1
_mem: dict[str, list] = {}          # fingerprint -> Records (nur der letzte Stand wird gehalten)


def cache_dir() -> Path:
    explicit = os.environ.get("FITNESS_CACHE_DIR")
    if explicit:
        return Path(explicit)
    return Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "fitness-backend"


def _stat_sig(path: Path) -> str:
    try:
        st = path.stat()
    except OSError:
        return "-"
    return f"{st.st_mtime_ns}:{st.st_size}"


def kb_fingerprint() -> str:
    """Hash über die KB-Dateien für Exercise-Index und gecachte Coverage-Ressourcen."""
    from fitness.catalog.core import resolver
    from fitness.catalog.core.loader import catalog_path, iter_catalog_yaml_files

    kb_root = catalog_path("exercises").parent
    h = hashlib.sha256()
    h.update(f"schema={CACHE_SCHEMA}\n".encode())
    for rel in ("exercises", "inbox", "muscles"):
        for f in iter_catalog_yaml_files(rel):
            h.update(f"{f.relative_to(kb_root)}|{_stat_sig(f)}\n".encode())
    for rel in ("muscle_index.yml", "rules/muscle_coverage_rules.yml"):
        f = kb_root / rel
        h.update(f"{rel}|{_stat_sig(f)}\n".encode())
    # "Durchlauf 3" des alten Index liest <kb>/../yuhonas, falls es existiert — dann mit einbeziehen
    legacy_dir = kb_root.parent / "yuhonas"
    h.update(f"legacy_yuhonas_dir={legacy_dir.exists()}:{_stat_sig(legacy_dir)}\n".encode())
    h.update(f"resolver={_stat_sig(Path(resolver.__file__))}\n".encode())
    return h.hexdigest()


def _record_from_dict(data: dict[str, Any]):
    from fitness.catalog.core.resolver import ExerciseRecord

    known = {f.name for f in dataclasses.fields(ExerciseRecord)}
    return ExerciseRecord(**{k: v for k, v in data.items() if k in known})


def _cache_file() -> Path:
    return cache_dir() / "exercise-index.json"


def _read_disk(fingerprint: str) -> list | None:
    try:
        payload = json.loads(_cache_file().read_text(encoding="utf-8"))
        if payload.get("fingerprint") != fingerprint or payload.get("schema") != CACHE_SCHEMA:
            return None
        return [_record_from_dict(d) for d in payload["records"]]
    except Exception:
        return None      # kein Cache / kaputt / veraltet -> neu bauen


def _write_disk(fingerprint: str, records: list) -> None:
    try:
        target = _cache_file()
        target.parent.mkdir(parents=True, exist_ok=True)
        payload = {"schema": CACHE_SCHEMA, "fingerprint": fingerprint,
                   "records": [dataclasses.asdict(r) for r in records]}
        fd, tmp = tempfile.mkstemp(dir=target.parent, prefix=".exercise-index.", suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, default=str)
        os.replace(tmp, target)
    except Exception as exc:          # Cache ist optional, nie fatal
        logger.warning(f"Katalog-Cache nicht schreibbar: {exc}")


def get_local_records() -> list:
    """Lokale Records (Experten-KB, Inbox, Bulk) — identisch zu `build_exercise_index()`."""
    fp = kb_fingerprint()
    if fp in _mem:
        return _mem[fp]
    records = _read_disk(fp)
    source = "festplatten-cache"
    if records is None:
        from fitness.catalog.core.resolver import build_exercise_index

        records = build_exercise_index()
        _write_disk(fp, records)
        source = "neu gebaut"
    logger.debug(f"Katalog-Index: {len(records)} Records ({source})")
    _mem.clear()
    _mem[fp] = records
    return records


def reset_cache(*, disk: bool = False) -> None:
    _mem.clear()
    if disk:
        _cache_file().unlink(missing_ok=True)


def yuhonas_record(entry: yu.YuhonasEntry):
    """yuhonas-Eintrag als ExerciseRecord (für Auflösung/Coverage). Muskel-Wörter laufen durch die
    vorhandene Normalisierung (string_aliases + Taxonomie + Schulter-Zuordnung)."""
    from fitness.catalog.core.muscle_normalization import normalize_exercise_muscle_list
    from fitness.catalog.core.resolver import ExerciseRecord

    return ExerciseRecord(
        exercise_id=entry.exercise_id,
        display_name=entry.name,
        source_file=f"free-exercise-db/{entry.raw_id}",
        source="yuhonas",
        category=entry.category or "",
        tags=["yuhonas", "unreviewed"],
        yuhonas_id=entry.raw_id,
        primary_muscles=normalize_exercise_muscle_list(list(entry.primary_muscles), entry.name),
        secondary_muscles=normalize_exercise_muscle_list(list(entry.secondary_muscles), entry.name),
        equipment=[entry.equipment] if entry.equipment else None,
        images=list(entry.images) or None,
        instructions=list(entry.instructions) or None,
    )


def get_records(*, include_yuhonas: bool = True) -> list:
    """Lokale Records, danach yuhonas-Records für IDs, die lokal nicht vorkommen.

    Fehlt der yuhonas-Klon, bleibt es bei den lokalen Records (Warnung im Log).
    """
    local = get_local_records()
    if not include_yuhonas:
        return list(local)
    try:
        db = yu.load()
    except yu.YuhonasUnavailable as exc:
        logger.warning(f"Katalog ohne yuhonas: {exc}")
        return list(local)
    have = {r.exercise_id for r in local}
    return [*local, *(yuhonas_record(e) for e in db.entries if e.exercise_id not in have)]
