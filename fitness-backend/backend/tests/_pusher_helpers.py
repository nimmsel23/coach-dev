"""Fake-Quelle für die Pusher-Tests — kein Firestore, kein FCM."""
from __future__ import annotations

from backend.core.clients import Client
from backend.pusher.source import TokenResult

COACH, MATTHIAS, JAKOB, SIMON = "UC", "UM", "UJ", "US"

REGISTRY = {
    COACH: Client(COACH, "Daniel", "daniel", True),
    MATTHIAS: Client(MATTHIAS, "Matthias", "matthias", False),
    JAKOB: Client(JAKOB, "Jakob", "jakob", False),
    SIMON: Client(SIMON, "Simon", "simon", False),
}


class FakeSource:
    def __init__(self, settings: dict[str, dict], extra_uids=(), dead=(), fail_uids=()):
        self._settings = settings
        self._extra = list(extra_uids)
        self.dead = set(dead)             # Tokens, die FCM als tot meldet
        self.fail_uids = set(fail_uids)   # Empfänger, bei denen send() wirft
        self.sent: list[tuple[list[str], dict]] = []
        self.removed: list[tuple[str, list[str]]] = []

    def list_uids(self):
        return sorted({*self._settings, *self._extra})

    def settings(self, uid):
        return self._settings.get(uid, {})

    def display_name(self, uid):
        return ""

    def send(self, tokens, data):
        if any(t.startswith("boom") for t in tokens):
            raise RuntimeError("Netzwerk weg")
        self.sent.append((list(tokens), dict(data)))
        return [TokenResult(False, "messaging/registration-token-not-registered") if t in self.dead else TokenResult(True)
                for t in tokens]

    def remove_tokens(self, uid, tokens):
        self.removed.append((uid, list(tokens)))


def default_settings():
    return {
        COACH: {"enabled": True, "tokens": ["tc1"]},
        MATTHIAS: {"enabled": True, "tokens": ["tm1", "tm2"], "token": "tm1"},
        JAKOB: {"enabled": False, "tokens": ["tj1"]},
        SIMON: {"enabled": True, "tokens": [], "types": {"coachMessage": True}},
    }
