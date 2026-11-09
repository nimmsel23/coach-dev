"""Firestore-Quelle (dünn, ohne Logik): fitness/<uid>/sessions."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Iterator

from backend.sync.pull import RemoteDoc

CRED_PATH = Path(os.environ.get("FITNESS_FIREBASE_CREDENTIALS", Path.home() / ".env" / "firebase-fitness.json"))
PROJECT = os.environ.get("FIREBASE_FITNESS_PROJECT", "fitness-aos")


def _client():
    import firebase_admin
    from firebase_admin import credentials, firestore

    if not CRED_PATH.exists():
        raise FileNotFoundError(f"Service-Account fehlt: {CRED_PATH}")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(str(CRED_PATH)), {"projectId": PROJECT})
    return firestore.client()


def firestore_sessions(uid: str) -> Iterator[RemoteDoc]:
    db = _client()
    for doc in db.collection("fitness").document(uid).collection("sessions").stream():
        yield RemoteDoc(doc.id, doc.to_dict() or {})


class _WatchHandle:
    def __init__(self, watches: list):
        self._watches = watches

    def alive(self) -> bool:
        # Watch.is_active ist False, sobald der RPC unwiederbringlich beendet wurde
        return all(getattr(w, "is_active", False) and not getattr(w, "_closed", False) for w in self._watches)

    def stop(self) -> None:
        for w in self._watches:
            try:
                w.unsubscribe()
            except Exception:
                pass


class FirestoreListener:
    """on_snapshot auf fitness/<uid>/sessions je UID (pfadgebunden — kein collection_group,
    daher kein Fremd-Pillar-Mitschnitt und die UID steht fest)."""

    def start(self, uids: list[str], emit) -> _WatchHandle:
        from backend.sync.events import RemoteEvent

        db = _client()
        watches = []

        def make_callback(uid: str):
            def callback(col_snapshot, changes, read_time):
                for ch in changes:
                    kind = ch.type.name.lower()           # added | modified | removed
                    doc = None if kind == "removed" else RemoteDoc(ch.document.id, ch.document.to_dict() or {})
                    emit(RemoteEvent(uid, kind, ch.document.id, doc))
            return callback

        try:
            for uid in uids:
                col = db.collection("fitness").document(uid).collection("sessions")
                watches.append(col.on_snapshot(make_callback(uid)))
        except Exception:
            _WatchHandle(watches).stop()
            raise
        return _WatchHandle(watches)


class FirestoreTarget:
    """Schreibziel für den Push: fitness/<uid>/sessions/<doc_id>."""

    def _col(self, uid: str):
        return _client().collection("fitness").document(uid).collection("sessions")

    def fetch_all(self, uid: str) -> dict:
        return {d.id: d.to_dict() or {} for d in self._col(uid).stream()}

    def write(self, uid: str, doc_id: str, data: dict) -> None:
        self._col(uid).document(doc_id).set(data)
