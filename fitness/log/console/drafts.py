"""Persistenz fuer Live-Console KI-Ausgaben (Gap-Erklaerungen, Feedback-Entwuerfe).

Vorher: KI-Ausgaben waren nur Zeilen in der Live-Queue — verschwinden bei
Ctrl+C, kein Wiedersehen ausserhalb der laufenden Session. Schritt 1 im
console-Ausbau (Persistenz -> interaktive Freigabe -> Senden an Klient,
in dieser Reihenfolge, siehe console/__init__.py).

Ablage: runtime_root()/console/drafts/<uid>/<timestamp>_<kind>_<id>.json
"""
from __future__ import annotations

import json
import time
import uuid
from pathlib import Path

from ...catalog.core.paths import runtime_root


def drafts_dir(uid: str) -> Path:
    d = runtime_root() / "console" / "drafts" / uid
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_draft(uid: str, name: str, kind: str, text: str, **meta) -> Path:
    ts = time.strftime("%Y-%m-%dT%H-%M-%S")
    path = drafts_dir(uid) / f"{ts}_{kind}_{uuid.uuid4().hex[:6]}.json"
    payload = {
        "uid": uid,
        "name": name,
        "kind": kind,
        "text": text,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        **meta,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def mark_status(path: Path, status: str) -> None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return
    data["status"] = status
    data["reviewed_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def list_drafts(uid: str | None = None) -> list[dict]:
    base = runtime_root() / "console" / "drafts"
    if not base.exists():
        return []
    uids = [uid] if uid else [p.name for p in base.iterdir() if p.is_dir()]
    out: list[dict] = []
    for u in uids:
        d = base / u
        if not d.exists():
            continue
        for f in sorted(d.glob("*.json")):
            try:
                entry = json.loads(f.read_text(encoding="utf-8"))
            except Exception:
                continue
            entry["id"] = f.stem
            out.append(entry)
    return sorted(out, key=lambda e: e.get("created_at", ""), reverse=True)


def find_draft_path(uid: str, draft_id: str) -> Path | None:
    """Adressiert einen Draft per (uid, id) fuer die API — id ist der
    Dateiname ohne Endung (<timestamp>_<kind>_<hex6>), wie list_drafts()
    ihn zurueckgibt. Kein Pfad-Parameter von aussen, um Path-Traversal
    ueber den Dateinamen auszuschliessen (uid wird in der API-Schicht
    gegen [\\w-]{1,128} validiert, siehe fitness/api/routers/coaching.py)."""
    path = drafts_dir(uid) / f"{draft_id}.json"
    return path if path.exists() else None
