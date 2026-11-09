"""Tombstones: lokal gelöschte Sessions dürfen durch den nächsten Pull/Daemon nicht wieder auftauchen.

Pro UID eine Datei `<root>/.fitsync/tombstones/<uid>.json` mit {doc_id: {"rev", "deleted_at"}}.
Ein Remote-Stand wird erst wieder übernommen, wenn seine rev HÖHER ist als die gelöschte —
dann wurde das Dokument nach dem Löschen woanders erneut bearbeitet.
Gelöscht wird nur lokal; ob das Löschen nach Firestore weitergegeben wird, ist eine bewusste
Entscheidung des Nutzers (aktuell: nein).
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path


def _path(root: Path, uid: str) -> Path:
    return Path(root) / ".fitsync" / "tombstones" / f"{uid}.json"


def load(root: Path, uid: str) -> dict[str, dict]:
    try:
        data = json.loads(_path(root, uid).read_text())
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _save(root: Path, uid: str, data: dict[str, dict]) -> None:
    p = _path(root, uid)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    os.replace(tmp, p)


def add(root: Path, uid: str, doc_id: str, rev: int, now: datetime | None = None) -> None:
    data = load(root, uid)
    data[doc_id] = {"rev": int(rev), "deleted_at": (now or datetime.now(timezone.utc)).isoformat()}
    _save(root, uid, data)


def remove(root: Path, uid: str, doc_id: str) -> None:
    data = load(root, uid)
    if data.pop(doc_id, None) is not None:
        _save(root, uid, data)
