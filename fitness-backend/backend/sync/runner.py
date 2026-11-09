"""Pull-Lauf über mehrere UIDs (gemeinsam genutzt von CLI und API)."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from loguru import logger

from backend.core.clients import Client
from backend.core.store import SessionStore
from backend.sync.lock import single_instance
from backend.sync.pull import Report, pull_sessions


@dataclass
class PullOutcome:
    reports: list[Report] = field(default_factory=list)
    errors: int = 0


def resolve_targets(uids: list[str], include_clients: bool, registry: dict[str, Client]) -> list[str]:
    """Explizite UIDs + (optional) alle Klienten ohne Coach; ohne Duplikate, Reihenfolge stabil."""
    targets = list(uids)
    if include_clients:
        targets += [u for u, c in registry.items() if not c.is_coach]
    return list(dict.fromkeys(targets))


def run_pull(
    *, root: Path, uids: list[str], registry: dict[str, Client], notify_: bool = False, dry_run: bool = False
) -> PullOutcome:
    """Zieht Sessions für alle `uids`. Wirft AlreadyRunning, wenn schon ein schreibender Lauf aktiv ist."""
    from backend.sync import notify, source  # Modul-Attribute zur Laufzeit lesen (Tests patchen sie)

    store = SessionStore(root)
    # Reicher Modus (Inbox, Actions, Ruhezeiten …) nur mit ~/.config/fitness-sync/notify.yaml, s. backend/notifier
    from backend.notifier.hub import from_config as notifier_hub
    hub = notifier_hub(root) if notify_ else None

    def run_all() -> PullOutcome:
        outcome = PullOutcome()
        for u in uids:
            report = pull_sessions(u, source.firestore_sessions(u), store, dry_run=dry_run)
            outcome.reports.append(report)
            outcome.errors += report.errors
            client = registry.get(u)
            if notify_ and client and client.is_coach:
                logger.debug(f"notify {u[:8]}: Coach-UID, eigene Workouts werden nicht gemeldet")
            elif notify_:
                try:  # eine Meldung darf das Pullen der übrigen Klienten nie verhindern
                    notify.notify_changes(client.name if client else u[:8], u, report.changes,
                                          send=notify.send_desktop, dry_run=dry_run, hub=hub)
                except Exception as exc:
                    outcome.errors += 1
                    logger.error(f"notify {u[:8]} fehlgeschlagen: {type(exc).__name__}: {exc}")
        return outcome

    if dry_run:  # schreibt nichts -> kein Lock nötig
        return run_all()
    with single_instance(root / ".fitsync" / "fitsync.lock"):
        return run_all()
