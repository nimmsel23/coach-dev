"""Lokaler Session-Speicher: ~/.aos/fitness/users/<uid>/sessions/<doc_id>.json.

* doc_id wird als Dateiname validiert (kommt aus Firestore, nie blind vertrauen).
* Schreiben ist atomar (tmp + os.replace). Der tmp-Name `.<name>.tmp` passt
  nicht auf den Session-Dateinamen-Regex der Watcher und wird dort ignoriert.
* Vor dem Ersetzen wird die bisherige Fassung nach
  `<root>/.fitsync/prev/<uid>/<doc_id>.json` gesichert (letzte ersetzte Version).
"""
from __future__ import annotations

import fcntl
import json
import os
import re
import shutil
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from fitness.runtime.session_store import parse_session_doc_id, validate_session_date, validate_session_id

_DOC_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.\-]*$")
_SESSION_FILE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})(?:__(.+))?\.json$")


class InvalidDocId(ValueError):
    pass


def jsonable(value: Any) -> Any:
    """Rekursiv JSON-tauglich machen (Firestore-Timestamps → ISO-String)."""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    return value


def check_doc_id(doc_id: str) -> str:
    if not _DOC_ID_RE.match(doc_id) or ".." in doc_id:
        raise InvalidDocId(doc_id)
    return doc_id


class SessionStore:
    def __init__(self, root: Path):
        self.root = Path(root)

    @contextmanager
    def write_lock(self):
        """Kurzer, blockierender Lock um Lesen-Prüfen-Schreiben. Schützt vor Lost-Updates
        zwischen API-Speichern und laufendem Pull (getrennt vom Ein-Instanz-Lock des Syncs)."""
        lock_file = self.root / ".fitsync" / "write.lock"
        lock_file.parent.mkdir(parents=True, exist_ok=True)
        with open(lock_file, "w") as fh:
            fcntl.flock(fh, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(fh, fcntl.LOCK_UN)

    def sessions_dir(self, uid: str) -> Path:
        return self.root / "users" / check_doc_id(uid) / "sessions"

    def path(self, uid: str, doc_id: str) -> Path:
        doc_id = check_doc_id(doc_id)
        try:
            parse_session_doc_id(doc_id)
        except ValueError:
            raise InvalidDocId(doc_id) from None
        return self.sessions_dir(uid) / f"{doc_id}.json"

    def read(self, uid: str, doc_id: str) -> tuple[dict | None, str | None]:
        """(daten, fehler): (None, None) = nicht vorhanden, (None, msg) = defekt."""
        p = self.path(uid, doc_id)
        if not p.exists():
            return None, None
        try:
            data = json.loads(p.read_text())
        except Exception as exc:
            return None, f"{type(exc).__name__}: {exc}"
        if not isinstance(data, dict):
            return None, "kein JSON-Objekt"
        return data, None

    def list_ids(self, uid: str) -> set[str]:
        d = self.sessions_dir(uid)
        if not d.is_dir():
            return set()
        ids = set()
        for path in d.iterdir():
            match = _SESSION_FILE_RE.match(path.name)
            if not match:
                continue
            try:
                validate_session_date(match.group(1))
                validate_session_id(match.group(2))
            except ValueError:
                continue
            ids.add(path.name.removesuffix(".json"))
        return ids

    def _backup(self, uid: str, doc_id: str) -> Path | None:
        src = self.path(uid, doc_id)
        if not src.exists():
            return None
        dst = self.root / ".fitsync" / "prev" / uid / f"{doc_id}.json"
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        return dst

    def quarantine(self, uid: str, doc_id: str) -> Path:
        """Defekte lokale Datei beiseitelegen (statt sie stumm zu überschreiben)."""
        src = self.path(uid, doc_id)
        dst = src.with_name(src.name + ".corrupt")
        os.replace(src, dst)
        return dst

    def trash(self, uid: str, doc_id: str) -> Path:
        """Session in den Papierkorb verschieben (wiederherstellbar):
        `<root>/.fitsync/trash/<uid>/<doc_id>.<UTC-Zeit>.json`."""
        src = self.path(uid, doc_id)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        dst = self.root / ".fitsync" / "trash" / uid / f"{doc_id}.{stamp}.json"
        dst.parent.mkdir(parents=True, exist_ok=True)
        os.replace(src, dst)        # FileNotFoundError, wenn es die Session nicht gibt
        return dst

    def write(self, uid: str, doc_id: str, data: dict[str, Any]) -> Path | None:
        """Schreibt atomar, gibt den Pfad der Sicherung der Vorversion zurück (oder None)."""
        target = self.path(uid, doc_id)
        target.parent.mkdir(parents=True, exist_ok=True)
        backup = self._backup(uid, doc_id)
        tmp = target.with_name(f".{target.name}.tmp")
        tmp.write_text(json.dumps(jsonable(data), indent=2, ensure_ascii=False))
        os.replace(tmp, target)
        return backup
