"""Die dünne Außenschicht: Firestore (Einstellungen/Tokens) und FCM (Senden).

Die Fachlogik (recipients/service) kennt nur das Protokoll `PushSource` — Tests laufen
mit einer Fake-Quelle, nie gegen echte Nutzer.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from backend.sync.source import _client as _firestore_client  # gleiche Credentials/Projekt wie der Sync

DEAD_CODES = {"messaging/registration-token-not-registered", "messaging/invalid-registration-token",
              "registration-token-not-registered", "invalid-registration-token", "UNREGISTERED"}


@dataclass(frozen=True)
class TokenResult:
    ok: bool
    error: str = ""

    @property
    def dead(self) -> bool:
        return not self.ok and any(code in self.error for code in DEAD_CODES)


class PushSource(Protocol):
    def list_uids(self) -> list[str]: ...
    def settings(self, uid: str) -> dict: ...
    def display_name(self, uid: str) -> str: ...
    def send(self, tokens: list[str], data: dict[str, str]) -> list[TokenResult]: ...
    def remove_tokens(self, uid: str, tokens: list[str]) -> None: ...


class FirebasePushSource:
    """Echte Quelle: fitness/<uid>/settings/push + FCM über das Admin-SDK."""

    def __init__(self):
        self._db = None

    def _firestore(self):
        if self._db is None:
            self._db = _firestore_client()
        return self._db

    def list_uids(self) -> list[str]:
        refs = self._firestore().collection("fitness").list_documents()
        return sorted(ref.id for ref in refs if ref.id != "kb")

    def settings(self, uid: str) -> dict:
        snap = self._firestore().document(f"fitness/{uid}/settings/push").get()
        return snap.to_dict() or {}

    def display_name(self, uid: str) -> str:
        from firebase_admin import auth

        self._firestore()
        try:
            return auth.get_user(uid).display_name or ""
        except Exception:
            return ""

    def send(self, tokens: list[str], data: dict[str, str]) -> list[TokenResult]:
        from firebase_admin import messaging

        if not tokens:
            return []
        self._firestore()
        message = messaging.MulticastMessage(
            data=data, tokens=tokens,
            webpush=messaging.WebpushConfig(headers={"Urgency": "normal", "TTL": "86400"}),
        )
        response = messaging.send_each_for_multicast(message)
        results: list[TokenResult] = []
        for item in response.responses:
            if item.success:
                results.append(TokenResult(True))
            else:
                exc = item.exception
                results.append(TokenResult(False, f"{getattr(exc, 'code', '')} {exc}".strip()))
        return results

    def remove_tokens(self, uid: str, tokens: list[str]) -> None:
        from google.cloud import firestore

        if not tokens:
            return
        ref = self._firestore().document(f"fitness/{uid}/settings/push")
        current = ref.get().to_dict() or {}
        update: dict = {"tokens": firestore.ArrayRemove(tokens)}
        if current.get("token") in tokens:
            update["token"] = firestore.DELETE_FIELD
        if isinstance(current.get("devices"), list):
            update["devices"] = [d for d in current["devices"] if d.get("token") not in tokens]
        ref.set(update, merge=True)
