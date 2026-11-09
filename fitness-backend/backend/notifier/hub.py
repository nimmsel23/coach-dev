"""Hub: entscheidet pro eingehendem Workout, was passiert.

Reihenfolge: ignore → Inbox → (enabled, mute, Ruhezeiten) → Popup.
Die Inbox bekommt jeden *kürzlichen* Workout (außer bei ignore), auch wenn
kein Popup erscheint — Badge und TUI bleiben dadurch vollständig.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable

from loguru import logger

from backend.core.clients import Client, load_clients
from backend.notifier import popup as popup_mod
from backend.notifier.config import NotifyConfig, load_config
from backend.notifier.inbox import Inbox
from backend.notifier.paths import data_root, notifier_dir
from backend.notifier.popup import Popup


def _under_pytest() -> bool:
    import os
    return "PYTEST_CURRENT_TEST" in os.environ


@dataclass
class Delivery:
    sent: bool
    reason: str          # "gesendet" | "stumm" | "ruhezeit" | "deaktiviert" | "fehlgeschlagen" | "dry-run"


class Hub:
    def __init__(self, root: Path, config: NotifyConfig, *, inbox: Inbox | None = None,
                 sender: Callable[[Popup], bool] | None = None,
                 clients: dict[str, Client] | None = None,
                 clock: Callable[[], datetime] | None = None):
        self.root = Path(root)
        self.config = config
        self.inbox = inbox or Inbox(notifier_dir(self.root))
        self._sender = sender or popup_mod.show
        self._clients = clients
        self._clock = clock or (lambda: datetime.now().astimezone())

    # --- Klienten-Regel ----------------------------------------------------
    def _client(self, uid: str) -> Client | None:
        if self._clients is None:
            self._clients = load_clients()
        return self._clients.get(uid)

    def rule(self, name: str, uid: str):
        c = self._client(uid)
        return self.config.rule_for(c.slug if c else None, name, uid)

    # --- Inbox ---------------------------------------------------------------
    def ignored(self, name: str, uid: str) -> bool:
        return self.rule(name, uid).ignore

    def record(self, name: str, uid: str, change, *, summary: str) -> bool:
        return self.inbox.record(uid=uid, client=name, doc_id=change.doc_id, data=change.data,
                                 action=change.action, summary=summary, now=self._clock())

    # --- Popup -----------------------------------------------------------------
    def popup(self, name: str, uid: str, *, title: str, body: str, doc_id: str | None,
              changes: list, dry_run: bool = False) -> Delivery:
        cfg, rule = self.config, self.rule(name, uid)
        if dry_run:
            return Delivery(False, "dry-run")
        if not cfg.enabled:
            return Delivery(False, "deaktiviert")
        if rule.mute:
            return Delivery(False, "stumm")

        silent = False
        qh = cfg.quiet_hours
        if qh and qh.contains(self._clock().timetz().replace(tzinfo=None)):
            if qh.mode == "suppress":
                return Delivery(False, "ruhezeit")
            silent = True

        urgency = rule.urgency or cfg.urgency
        if cfg.urgent_effort is not None and any(_effort(c.data) >= cfg.urgent_effort for c in changes):
            urgency = "critical"
        if silent:
            urgency = "low"

        ids = [f"{uid}/{c.doc_id}" for c in changes]
        actions = [("default", "Öffnen"), ("open", "Öffnen"), ("seen", "Gesehen")] if cfg.actions else []
        p = Popup(title=title, body=body, urgency=urgency,
                  tag=f"fitness-sync-{uid}-{doc_id or 'summary'}",
                  actions=actions, timeout_ms=cfg.timeout_ms, sound=cfg.sound, silent=silent,
                  root=str(self.root), ids=ids)
        ok = self._sender(p)
        return Delivery(ok, "gesendet" if ok else "fehlgeschlagen")


def _effort(data: dict) -> int:
    try:
        return int(data.get("effort") or 0)
    except (TypeError, ValueError):
        return 0


def from_config(root: Path | None = None) -> Hub | None:
    """Hub nur, wenn eine Config existiert. Unter pytest nie (kein echter Popup in Tests,
    selbst wenn auf diesem Rechner eine notify.yaml liegt)."""
    if _under_pytest():
        return None
    cfg = load_config()
    if cfg is None:
        logger.debug("keine notify.yaml → einfacher Modus (fitness-inbox init aktiviert den reichen)")
        return None
    return Hub(root or data_root(), cfg)
