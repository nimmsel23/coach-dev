"""Empfänger: Klienten-Registry + Push-Einstellungen aus Firestore."""
from __future__ import annotations

from dataclasses import dataclass, field

from backend.core.clients import Client, load_clients
from backend.pusher.source import PushSource


@dataclass
class Recipient:
    uid: str
    name: str
    is_coach: bool = False
    enabled: bool = False
    tokens: list[str] = field(default_factory=list)
    paused: int = 0                   # Geräte, die im Panel pausiert sind (bekommen nichts)
    messages_off: bool = False        # types.coachMessage == False im Panel des Empfängers

    @property
    def status(self) -> str:
        if not self.enabled:
            return "Push aus"
        if not self.tokens:
            return "Geräte pausiert" if self.paused else "keine Geräte"
        if self.messages_off:
            return "Nachrichten aus"
        return "bereit"

    @property
    def eligible(self) -> bool:
        return self.status == "bereit"


def paused_tokens(data: dict) -> set[str]:
    """Tokens von Geräten, die im Panel pausiert wurden (devices[].paused) — gleiche Regel wie die Cloud Function."""
    devices = data.get("devices") if isinstance(data.get("devices"), list) else []
    return {d["token"] for d in devices if isinstance(d, dict) and d.get("paused") is True and d.get("token")}


def normalize_tokens(data: dict, include_paused: bool = False) -> list[str]:
    paused = set() if include_paused else paused_tokens(data)
    seen: dict[str, None] = {}
    for token in [*(data.get("tokens") or []), data.get("token")]:
        if isinstance(token, str) and token and token not in paused:
            seen.setdefault(token, None)
    return list(seen)


def recipient_from_settings(uid: str, name: str, is_coach: bool, data: dict) -> Recipient:
    types = data.get("types") if isinstance(data.get("types"), dict) else {}
    return Recipient(
        uid=uid, name=name, is_coach=is_coach,
        enabled=bool(data.get("enabled")),
        tokens=normalize_tokens(data),
        paused=len(normalize_tokens(data, include_paused=True)) - len(normalize_tokens(data)),
        messages_off=types.get("coachMessage") is False,
    )


def load_recipients(source: PushSource, registry: dict[str, Client] | None = None, discover: bool = True,
                    show_inactive_unknown: bool = False) -> list[Recipient]:
    """Registry-Klienten immer, dazu (discover) jede weitere Firestore-UID mit aktivem Push.
    Unbekannte UIDs ohne Push (Test-/Smoke-Konten) werden ausgeblendet, außer show_inactive_unknown.
    Sortierung: bereit zuerst, dann Name."""
    registry = load_clients() if registry is None else registry
    uids = list(registry)
    if discover:
        uids += [uid for uid in source.list_uids() if uid not in registry]
    result: list[Recipient] = []
    for uid in dict.fromkeys(uids):
        client = registry.get(uid)
        data = source.settings(uid)
        if client is None and not show_inactive_unknown and not (data.get("enabled") and normalize_tokens(data)):
            continue
        name = client.name if client else (source.display_name(uid) or f"{uid[:8]}…")
        result.append(recipient_from_settings(uid, name, bool(client and client.is_coach), data))
    result.sort(key=lambda r: (not r.eligible, r.name.lower()))
    return result
