"""Sync-Daemon: Firestore-Änderungen live nach lokal (Sessions).

Lehren aus dem alten Mirror (fitness/firestore/mirror.py) — hier eingebaut und per Test belegt:

* ADDED-Flut beim Start: Firestore meldet beim ersten Listener-Start ALLE Bestandsdokumente als
  ADDED. Jedes Event läuft deshalb durch dieselbe `decide()`-Prüfung wie der Pull; lokal neuere
  oder gleiche Stände werden nie überschrieben (Datenverlust Matthias, 2026-08-23).
* Kein Echo: der Daemon schreibt nur lokal und pusht nicht zurück; `sync push` entscheidet
  symmetrisch (gleicher Stand → übersprungen), ein Rückschreiben wäre also ohnehin wirkungslos.
* REMOVED wird nur geloggt, nie lokal gelöscht (Löschen bleibt eine bewusste Handlung).
* Ein Fehler in einem Event stoppt weder Listener noch Daemon.
"""
from __future__ import annotations

import json
import os
import threading
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from loguru import logger

from backend.core.clients import Client
from backend.core.store import SessionStore
from backend.sync.events import Listener, RemoteEvent
from backend.sync.pull import Change, Report, _emit, pull_one_checked

DEFAULT_BACKOFF = (1, 2, 4, 8, 16, 30, 60)


def _daemon_event(action: str, msg: str, level: str = "INFO", **fields) -> None:
    logger.bind(event="daemon", direction="live", action=action, **fields).log(level, f"daemon: {msg}")


class SyncDaemon:
    def __init__(
        self,
        *,
        root: Path,
        registry: dict[str, Client],
        listener: Listener,
        notify_: bool = False,
        dry_run: bool = False,
        batch_window: float = 1.5,
        poll: float = 1.0,
        backoff: tuple[float, ...] = DEFAULT_BACKOFF,
        stable_after: float = 60.0,
        hub=None,
    ):
        self.root, self.registry, self.listener = Path(root), registry, listener
        self.notify_, self.dry_run = notify_, dry_run
        self.batch_window, self.poll, self.backoff, self.stable_after = batch_window, poll, backoff, stable_after
        self.store = SessionStore(self.root)
        self.stats: Counter = Counter()
        self.started_at: str | None = None
        self.last_event_at: str | None = None
        self.uids: list[str] = []
        self._pending: dict[str, list[Change]] = defaultdict(list)
        self._pending_lock = threading.Lock()
        self._timer: threading.Timer | None = None
        self._hub = hub or None          # hub=False: bewusst keiner (Tests)
        if notify_ and hub is None:
            try:  # reicher Modus (Inbox, Actions, Ruhezeiten) nur, wenn der Notifier vorhanden/konfiguriert ist
                from backend.notifier.hub import from_config
                self._hub = from_config(self.root)
            except Exception as exc:  # Notifier ist optional
                logger.debug(f"daemon: kein Notifier-Hub ({type(exc).__name__}: {exc})")

    # ---- Ereignisse -------------------------------------------------------------------
    def handle(self, ev: RemoteEvent) -> None:
        self.stats["events"] += 1
        self.last_event_at = datetime.now(timezone.utc).isoformat()
        if ev.kind == "removed":
            self.stats["remote_gelöscht"] += 1
            _emit("WARNING", ev.uid, ev.doc_id, "remote_gelöscht",
                  "in Firestore gelöscht — lokale Datei bleibt (Löschen wird nicht gespiegelt)",
                  reason="remote_gelöscht", dry_run=self.dry_run, direction="live")
            return
        if ev.doc is None:
            return
        report = Report(uid=ev.uid, dry_run=self.dry_run)
        pull_one_checked(ev.uid, ev.doc, self.store, report, dry_run=self.dry_run, direction="live")
        self.stats.update(report.counts)
        if report.changes and self.notify_:
            self._queue(ev.uid, report.changes)

    def handle_safe(self, ev: RemoteEvent) -> None:
        """Einstieg für den Listener-Thread: nichts darf ihn beenden."""
        try:
            self.handle(ev)
        except Exception as exc:
            self.stats["fehler"] += 1
            _daemon_event("fehler", f"Event {ev.uid[:8]}/{ev.doc_id} fehlgeschlagen: {type(exc).__name__}: {exc}", "ERROR")

    # ---- Benachrichtigung (gebündelt: die Start-Flut soll nicht Dauerfeuer auslösen) ---------
    def _queue(self, uid: str, changes: list[Change]) -> None:
        with self._pending_lock:
            self._pending[uid].extend(changes)
            if self.batch_window > 0 and self._timer is None:
                self._timer = threading.Timer(self.batch_window, self.flush)
                self._timer.daemon = True
                self._timer.start()
        if self.batch_window <= 0:
            self.flush()

    def flush(self) -> None:
        from backend.sync import notify

        with self._pending_lock:
            pending, self._pending = self._pending, defaultdict(list)
            self._timer = None
        for uid, changes in pending.items():
            client = self.registry.get(uid)
            if client and client.is_coach:
                logger.debug(f"notify {uid[:8]}: Coach-UID, eigene Workouts werden nicht gemeldet")
                continue
            try:
                extra = {"hub": self._hub} if self._hub is not None else {}
                notify.notify_changes(client.name if client else uid[:8], uid, changes,
                                      send=notify.send_desktop, dry_run=self.dry_run, **extra)
            except Exception as exc:
                self.stats["fehler"] += 1
                _daemon_event("fehler", f"notify {uid[:8]} fehlgeschlagen: {type(exc).__name__}: {exc}", "ERROR")

    # ---- Status -----------------------------------------------------------------------
    def _status_path(self) -> Path:
        return self.root / ".fitsync" / "daemon-status.json"

    def write_status(self, running: bool) -> None:
        if self.dry_run:
            return
        path = self._status_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + ".tmp")
        tmp.write_text(json.dumps({
            "running": running, "pid": os.getpid(), "started_at": self.started_at,
            "last_event_at": self.last_event_at, "uids": self.uids, "notify": self.notify_,
            "counts": dict(self.stats), "updated_at": datetime.now(timezone.utc).isoformat(),
        }, ensure_ascii=False, indent=2))
        os.replace(tmp, path)

    # ---- Hauptschleife mit Reconnect --------------------------------------------------------
    def run(self, uids: list[str], stop: threading.Event) -> None:
        self.uids = list(uids)
        self.started_at = datetime.now(timezone.utc).isoformat()
        _daemon_event("start", f"startet für {len(uids)} UID(s), dry_run={self.dry_run}, notify={self.notify_}",
                      uids=len(uids), dry_run=self.dry_run)
        self.write_status(True)
        attempt = 0
        while not stop.is_set():
            try:
                handle = self.listener.start(self.uids, self.handle_safe)
            except Exception as exc:
                delay = self.backoff[min(attempt, len(self.backoff) - 1)]
                self.stats["neustarts"] += 1
                _daemon_event("reconnect", f"Listener-Start fehlgeschlagen ({type(exc).__name__}: {exc}) — neuer Versuch in {delay}s",
                              "ERROR", delay=delay)
                attempt += 1
                stop.wait(delay)
                continue
            started = time.monotonic()
            _daemon_event("verbunden", "Listener aktiv")
            beat = started
            while not stop.wait(self.poll):
                if not handle.alive():
                    break
                if time.monotonic() - beat >= 30:
                    beat = time.monotonic()
                    self.write_status(True)
            try:
                handle.stop()
            except Exception as exc:
                logger.debug(f"daemon: Listener-Stop: {exc}")
            if stop.is_set():
                break
            if time.monotonic() - started >= self.stable_after:
                attempt = 0
            delay = self.backoff[min(attempt, len(self.backoff) - 1)]
            self.stats["neustarts"] += 1
            _daemon_event("reconnect", f"Listener beendet — neuer Versuch in {delay}s", "WARNING", delay=delay)
            attempt += 1
            stop.wait(delay)
        if self._timer is not None:
            self._timer.cancel()
        self.flush()
        self.write_status(False)
        _daemon_event("stop", f"beendet ({dict(self.stats)})")
