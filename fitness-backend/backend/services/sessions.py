"""Sessions: Listen, Lesen, Speichern (JSON ist die Quelle, rev-Konfliktschutz)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from backend.core import tombstones
from backend.core.conflict import rev_of
from backend.core.store import SessionStore
from fitness.runtime.session_store import parse_session_doc_id


class SessionNotFound(LookupError):
    pass


class InvalidSession(ValueError):
    pass


class RevConflict(Exception):
    def __init__(self, current_rev: int):
        super().__init__(f"rev-Konflikt: gespeichert ist rev {current_rev}")
        self.current_rev = current_rev


class StoredSessionCorrupt(RuntimeError):
    pass


def parse_doc_id(doc_id: str) -> tuple[str, str | None]:
    try:
        return parse_session_doc_id(doc_id)
    except ValueError:
        raise InvalidSession(f"ungültige Session-ID: {doc_id!r} (erwartet YYYY-MM-DD oder YYYY-MM-DD__<id>)") from None


def _activity(data: dict[str, Any]) -> dict[str, Any] | None:
    """Kurzform der Cardio-/Aktivitätsdaten (44 von 80 Sessions haben nur `activity`, keine exercises)."""
    a = data.get("activity")
    if not isinstance(a, dict) or not a.get("type"):
        return None
    return {k: a[k] for k in ("type", "duration", "intensity", "distanceKm") if a.get(k) not in (None, "")}


def summarize(doc_id: str, data: dict[str, Any]) -> dict[str, Any]:
    day, sid = parse_doc_id(doc_id)
    return {
        "doc_id": doc_id,
        "date": data.get("date") or day,
        "session_id": sid,
        "session_mode": data.get("sessionMode"),
        "block": data.get("block") or None,
        "trainingsart": data.get("trainingsart") or None,
        "exercises": len(data.get("exercises") or []),
        "effort": data.get("effort"),
        "duration": data.get("duration") or None,
        "activity": _activity(data),
        "rev": rev_of(data),
        "saved_at": data.get("saved_at"),
    }


def list_sessions(
    store: SessionStore, uid: str, *, limit: int = 50, since: str | None = None, full: bool = False
) -> list[dict[str, Any]]:
    """Neueste zuerst. Defekte/nicht parsebare Dateien werden übersprungen (nicht fatal).
    full=True liefert die kompletten Sessions (plus doc_id) statt der Zusammenfassungen."""
    out = []
    for doc_id in store.list_ids(uid):
        data, err = store.read(uid, doc_id)
        if data is None:
            continue
        item = summarize(doc_id, data)
        if since and str(item["date"]) < since:
            continue
        out.append((item, data))
    out.sort(key=lambda p: (str(p[0]["date"]), str(p[0]["saved_at"] or "")), reverse=True)
    if full:
        return [{**data, "doc_id": item["doc_id"]} for item, data in out[:limit]]
    return [item for item, _ in out[:limit]]


def get_session(store: SessionStore, uid: str, doc_id: str) -> dict[str, Any]:
    parse_doc_id(doc_id)
    data, err = store.read(uid, doc_id)
    if err:
        raise StoredSessionCorrupt(f"{doc_id}: {err}")
    if data is None:
        raise SessionNotFound(doc_id)
    return data


def save_session(
    store: SessionStore, uid: str, doc_id: str, body: dict[str, Any], *, now: datetime | None = None
) -> dict[str, Any]:
    """Speichert eine Session.

    * `rev` im Body ist die Basis-Revision des Clients. Ist sie gesetzt und weicht von der
      gespeicherten ab → RevConflict (HTTP 409). Fehlt sie → letzter Schreiber gewinnt.
    * rev wird serverseitig hochgezählt, saved_at serverseitig gesetzt (echte Editierzeit).
    """
    day, sid = parse_doc_id(doc_id)
    if body.get("date") not in (None, "", day):
        raise InvalidSession(f"date {body.get('date')!r} passt nicht zur Session-ID {doc_id!r}")
    if "exercises" in body and not isinstance(body["exercises"], list):
        raise InvalidSession("exercises muss eine Liste sein")
    expected = body.get("rev")
    if expected is not None:
        try:
            expected = int(expected)
        except (TypeError, ValueError):
            raise InvalidSession("rev muss eine Zahl sein") from None

    now = now or datetime.now(timezone.utc)
    with store.write_lock():
        stored, err = store.read(uid, doc_id)
        if err:
            raise StoredSessionCorrupt(f"{doc_id}: {err}")
        tomb = tombstones.load(store.root, uid).get(doc_id)
        tomb_rev = int(tomb["rev"]) if tomb else 0
        stored_rev = rev_of(stored) if stored else 0
        if stored is None and tomb:
            # Neuanlage nach Löschen: Basis 0 oder die gelöschte rev sind beide ok
            if expected is not None and expected not in (0, tomb_rev):
                raise RevConflict(tomb_rev)
        elif expected is not None and expected != stored_rev:
            raise RevConflict(stored_rev)
        # rev läuft nach einem Löschen weiter, sonst würde der alte Firestore-Stand (höhere rev) gewinnen
        new = {**body, "date": day, "rev": max(stored_rev, tomb_rev) + 1, "saved_at": now.isoformat()}
        if sid and not new.get("session_id"):
            new["session_id"] = sid
        store.write(uid, doc_id, new)
        if tomb:
            tombstones.remove(store.root, uid, doc_id)
    return new


def delete_session(
    store: SessionStore, uid: str, doc_id: str, *, expected_rev: int | None = None, now: datetime | None = None
) -> dict[str, Any]:
    """Löscht lokal (Papierkorb, wiederherstellbar) und setzt einen Tombstone, damit der nächste
    Pull die Session nicht wiederherstellt. Firestore wird dabei NICHT angefasst."""
    parse_doc_id(doc_id)
    with store.write_lock():
        stored, err = store.read(uid, doc_id)
        if stored is None and not err:
            raise SessionNotFound(doc_id)
        rev = rev_of(stored) if stored else 0      # defekte Datei: Aufräumen erlaubt
        if expected_rev is not None and stored is not None and expected_rev != rev:
            raise RevConflict(rev)
        trash = store.trash(uid, doc_id)
        tombstones.add(store.root, uid, doc_id, rev, now)
    return {"deleted": doc_id, "rev": rev, "trash": str(trash)}
