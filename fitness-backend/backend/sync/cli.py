"""fitsync CLI."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import typer
from loguru import logger

from backend.sync import logsetup
from backend.core.clients import load_clients
from backend.sync.lock import AlreadyRunning
from backend.sync.lock import single_instance
from backend.sync.runner import resolve_targets, run_pull

sync_app = typer.Typer(no_args_is_help=True, help="Firestore ↔ lokal (Fitness Sync)")
pull_app = typer.Typer(no_args_is_help=True, help="Daten aus Firestore holen")
sync_app.add_typer(pull_app, name="pull")
push_app = typer.Typer(no_args_is_help=True, help="Lokale Daten nach Firestore schreiben (Standard: Dry-Run)")
sync_app.add_typer(push_app, name="push")

DEFAULT_ROOT = Path(os.environ.get("FITNESS_DATA_ROOT", Path.home() / ".aos" / "fitness"))


def resolve_uid(explicit: str | None) -> str:
    """--uid > FITNESS_UID > ~/.aos/users/.active-uid. Kein stiller Hardcode-Fallback."""
    candidates = [explicit, os.environ.get("FITNESS_UID")]
    uid_file = Path.home() / ".aos" / "users" / ".active-uid"
    if uid_file.exists():
        candidates.append(uid_file.read_text().strip())
    for c in candidates:
        if c and c.strip() and c.strip() != "default":
            return c.strip()
    raise typer.BadParameter("keine UID: --uid angeben oder FITNESS_UID setzen")


@pull_app.command("sessions")
def pull_sessions_cmd(
    uid: list[str] = typer.Option([], "--uid", help="Firebase-UID, mehrfach möglich (sonst FITNESS_UID/.active-uid)"),
    clients: bool = typer.Option(False, "--clients", help="alle Klienten aus ~/Klienten (ohne Coach)"),
    notify_: bool = typer.Option(False, "--notify", help="Desktop-Meldung für eingehende Klienten-Workouts"),
    dry_run: bool = typer.Option(False, "--dry-run", help="nur entscheiden und loggen, nichts schreiben/melden"),
    root: Path = typer.Option(DEFAULT_ROOT, "--root", help="Datenwurzel (enthält users/<uid>/sessions)"),
    log_dir: Optional[Path] = typer.Option(None, "--log-dir", help="Standard: <root>/logs"),
    verbose: bool = typer.Option(False, "-v", "--verbose", help="auch übersprungene Dokumente auf der Konsole"),
):
    """Sessions aus Firestore nach <root>/users/<uid>/sessions holen."""
    registry = load_clients()
    uids = resolve_targets(list(uid), clients, registry) or [resolve_uid(None)]

    jsonl = logsetup.setup(log_dir or root / "logs", verbose)
    logger.info(f"pull sessions uids={len(uids)} root={root} dry_run={dry_run} notify={notify_} log={jsonl}")
    try:
        outcome = run_pull(root=root, uids=uids, registry=registry, notify_=notify_, dry_run=dry_run)
    except AlreadyRunning as exc:
        logger.error(f"läuft bereits (Lock {exc}) — abgebrochen")
        raise typer.Exit(2)
    errors = outcome.errors
    raise typer.Exit(1 if errors else 0)


@sync_app.command("run")
def run_cmd(
    uid: list[str] = typer.Option([], "--uid", help="zusätzliche Firebase-UID, mehrfach möglich"),
    clients: bool = typer.Option(True, "--clients/--no-clients", help="alle Klienten aus ~/Klienten (Standard: an)"),
    include_coach: bool = typer.Option(False, "--include-coach", help="auch die Coach-UID(s) synchronisieren"),
    notify_: bool = typer.Option(False, "--notify", help="Desktop-Meldung für eingehende Klienten-Workouts"),
    dry_run: bool = typer.Option(False, "--dry-run", help="nur entscheiden und loggen, nichts schreiben/melden"),
    duration: float = typer.Option(0.0, "--duration", help="nach N Sekunden beenden (0 = bis SIGTERM/Ctrl+C)"),
    root: Path = typer.Option(DEFAULT_ROOT, "--root", help="Datenwurzel"),
    log_dir: Optional[Path] = typer.Option(None, "--log-dir", help="Standard: <root>/logs"),
    verbose: bool = typer.Option(False, "-v", "--verbose"),
):
    """Daemon: Firestore-Änderungen an Sessions live nach lokal übernehmen (mit Reconnect)."""
    import signal
    import threading

    from backend.sync.daemon import SyncDaemon
    from backend.sync.source import FirestoreListener

    registry = load_clients()
    targets = resolve_targets(list(uid), clients, registry)
    if include_coach:
        targets = list(dict.fromkeys(targets + [u for u, c in registry.items() if c.is_coach]))
    if not targets:
        raise typer.BadParameter("keine UIDs: --uid angeben oder Klienten in ~/Klienten pflegen")

    jsonl = logsetup.setup(log_dir or root / "logs", verbose)
    logger.info(f"sync run uids={len(targets)} root={root} dry_run={dry_run} notify={notify_} log={jsonl}")
    stop = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    if duration > 0:
        threading.Timer(duration, stop.set).start()

    daemon = SyncDaemon(root=root, registry=registry, listener=FirestoreListener(), notify_=notify_, dry_run=dry_run)
    try:
        if dry_run:
            daemon.run(targets, stop)
        else:
            with single_instance(root / ".fitsync" / "fitsync.lock"):
                daemon.run(targets, stop)
    except AlreadyRunning as exc:
        logger.error(f"läuft bereits (Lock {exc}) — abgebrochen")
        raise typer.Exit(2)


@push_app.command("sessions")
def push_sessions_cmd(
    uid: str = typer.Option(None, "--uid", help="Firebase-UID (für --apply Pflicht, kein Standardwert)"),
    apply: bool = typer.Option(False, "--apply", help="WIRKLICH nach Firestore schreiben (ohne: nur Dry-Run)"),
    only: list[str] = typer.Option([], "--only", help="nur diese Session-ID(s), z.B. 2026-09-08"),
    root: Path = typer.Option(DEFAULT_ROOT, "--root", help="Datenwurzel"),
    log_dir: Optional[Path] = typer.Option(None, "--log-dir", help="Standard: <root>/logs"),
    verbose: bool = typer.Option(False, "-v", "--verbose", help="auch übersprungene Dokumente auf der Konsole"),
):
    """Sessions nach fitness/<uid>/sessions schreiben. Ohne --apply wird nur entschieden und geloggt."""
    from backend.core.store import SessionStore
    from backend.sync.lock import single_instance
    from backend.sync.push import push_sessions
    from backend.sync.source import FirestoreTarget

    if apply and not uid:
        raise typer.BadParameter("--apply verlangt eine ausdrückliche --uid (kein stiller Standardwert beim Schreiben)")
    uid = resolve_uid(uid)
    jsonl = logsetup.setup(log_dir or root / "logs", verbose)
    logger.info(f"push sessions uid={uid} root={root} apply={apply} log={jsonl}")
    store, target = SessionStore(root), FirestoreTarget()
    try:
        if apply:
            with single_instance(root / ".fitsync" / "fitsync.lock"):
                report = push_sessions(uid, store, target, dry_run=False, only=set(only) or None)
        else:
            report = push_sessions(uid, store, target, dry_run=True, only=set(only) or None)
    except AlreadyRunning as exc:
        logger.error(f"läuft bereits (Lock {exc}) — abgebrochen")
        raise typer.Exit(2)
    raise typer.Exit(1 if report.errors else 0)
