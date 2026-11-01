"""coach-sync — Coach-Seite des Firestore-Syncs, ohne API-Server (`coach-sync.service`).

Die gehostete Coach-App (vos-coach.web.app, ~/dev/coach-dev) schreibt Aktionen als
`coachCommands/*` (Status `queued`) und liest `coachInbox/*` + `coachState/*`. Bisher
verarbeitete das ein Thread im :9150-API-Prozess (`fitness/firestore/coach_bridge.py`),
der per HTTP seine eigenen Routen aufrief. Läuft dieser Prozess nicht, bleiben Befehle
liegen; startet er, feuert der Thread vor dem ersten Socket-Accept → `Connection refused`
→ Befehl endgültig `error`.

Dieser Worker ersetzt die Coach-Teile des API-Lifespans:

  * Befehle: transaktional übernehmen (queued → processing mit Lease), die Inbox-Routen
    IN-PROCESS ausführen (Starlette-TestClient, kein Port, kein Startrennen), Ergebnis
    zurückschreiben. Verwaiste `processing`-Befehle werden ehrlich als Fehler markiert
    (Freigeben/Löschen/Zusammenführen sind nicht idempotent → nie blind wiederholen).
  * Veraltete `queued`-Befehle (älter als --max-age-hours) werden nicht angefasst, nur
    gezählt; `coach-sync drain --include-stale` arbeitet sie bewusst ab.
  * Heartbeat `coachState/bridge`: die Coach-App sieht, ob der Worker lebt und wie viele
    Befehle warten.
  * Katalog-Listener (Firestore-Inbox → lokale YAMLs, freigegebene Übungen zurück) und der
    Gemini-Enrichment-Watcher — vorher ebenfalls im API-Lifespan.

Nicht enthalten: User-Data-Sync (Sessions → `fitness-sync.service`, Journal/Habits/Fuel →
`vos-firestore`), Session-/Muskel-Dateiwatcher der API.
"""
from __future__ import annotations

import http.client  # noqa: F401  — VOR fitness.*: fitness/http.py überschattet sonst das stdlib-`http`
import fcntl
import hashlib
import os
import socket
import subprocess
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import typer
from loguru import logger

UNIT = "coach-sync.service"
COMMANDS, INBOX, STATE = "coachCommands", "coachInbox", "coachState"
LEASE_S = 300           # Approve/Reenrich dürfen bis ~180 s laufen
INBOX_REPUBLISH_S = 300  # Inbox-Snapshot spätestens alle 5 min, sonst nur bei Änderung
VERSION = 1

app = typer.Typer(add_completion=False, no_args_is_help=True, help=__doc__)


def external_worker_active() -> bool:
    """Für fitness/api/main.py: läuft coach-sync.service, überspringt die API ihre Coach-Teile."""
    try:
        r = subprocess.run(["systemctl", "--user", "is-active", UNIT], capture_output=True, text=True, timeout=3)
        return r.stdout.strip() == "active"
    except Exception:
        return False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_dt(v) -> datetime | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except Exception:
        return None


class Executor:
    """Führt Coach-Befehle gegen die Inbox-Routen aus — im Prozess, ohne Server."""

    def __init__(self) -> None:
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from fitness.api.routers import exercises_inbox

        api = FastAPI()
        api.include_router(exercises_inbox.router)
        self.client = TestClient(api, raise_server_exceptions=True)

    def run(self, command: dict) -> dict:
        from fitness.firestore.coach_bridge import _execute_command

        return _execute_command(command, client=self.client)


class CoachWorker:
    def __init__(self, *, max_age_hours: float, include_stale: bool = False, dry_run: bool = False) -> None:
        from firebase_admin import firestore as fb

        from fitness.firestore._db import get_db

        self.fb = fb
        self.db = get_db()
        self.max_age = timedelta(hours=max_age_hours)
        self.include_stale = include_stale
        self.dry_run = dry_run
        self.worker = f"{socket.gethostname()}:{os.getpid()}"
        self.started_at = _now()
        self.executor: Executor | None = None
        self._sig: str | None = None
        self._last_publish = 0.0
        self.stats = {"done": 0, "error": 0}
        self.last_error: dict | None = None

    # ── Befehle ───────────────────────────────────────────────────────────────

    def _claim(self, ref) -> dict | None:
        fb = self.fb

        @fb.transactional
        def _tx(tx):
            snap = ref.get(transaction=tx)
            data = snap.to_dict() or {}
            if data.get("status") != "queued":
                return None
            tx.update(ref, {"status": "processing", "worker": self.worker, "started_at": _now(),
                            "lease_until": _now() + timedelta(seconds=LEASE_S)})
            return data

        return _tx(self.db.transaction())

    def recover(self) -> None:
        """Verwaiste processing-Befehle (Worker beendet/abgestürzt) als Fehler markieren — nie wiederholen."""
        for doc in self.db.collection(COMMANDS).where("status", "==", "processing").stream():
            c = doc.to_dict() or {}
            lease = _as_dt(c.get("lease_until"))
            started = _as_dt(c.get("started_at"))
            expired = (lease and lease < _now()) or (lease is None and started and _now() - started > timedelta(seconds=LEASE_S))
            if not expired or c.get("worker") == self.worker:
                continue
            logger.warning(f"{doc.id}: verwaist (Worker {c.get('worker', '?')}) → error")
            if not self.dry_run:
                doc.reference.update({
                    "status": "error", "finished_at": _now(),
                    "error": "Worker beendet während der Ausführung — Ergebnis unbekannt, bitte Stand prüfen und ggf. erneut auslösen",
                })

    def process(self) -> tuple[int, int]:
        """Arbeitet fällige queued-Befehle ab. Rückgabe: (verarbeitet, veraltet übersprungen)."""
        done = stale = 0
        docs = sorted(self.db.collection(COMMANDS).where("status", "==", "queued").stream(),
                      key=lambda d: str(_as_dt((d.to_dict() or {}).get("created_at"))))
        for doc in docs:
            c = doc.to_dict() or {}
            created = _as_dt(c.get("created_at"))
            if not self.include_stale and created and _now() - created > self.max_age:
                stale += 1
                continue
            label = f"{doc.id} {c.get('action')} {c.get('item_id')}"
            if self.dry_run:
                logger.info(f"(dry-run) würde ausführen: {label}")
                done += 1
                continue
            if self._claim(doc.reference) is None:
                continue  # ein anderer Worker war schneller
            logger.info(f"→ {label}")
            try:
                if self.executor is None:
                    self.executor = Executor()
                result = self.executor.run(c)
                doc.reference.update({"status": "done", "result": result, "finished_at": _now(), "lease_until": None})
                self.stats["done"] += 1
                logger.success(f"✓ {label}")
                if c.get("action") != "duplicates" and (c.get("payload") or {}).get("operation") not in {"search", "inspect"}:
                    self.publish(force=True)
            except Exception as exc:
                self.stats["error"] += 1
                self.last_error = {"command_id": doc.id, "action": c.get("action"),
                                   "item_id": c.get("item_id"), "message": str(exc)[:500], "at": _now()}
                logger.exception(f"✗ {label}: {exc}")
                doc.reference.update({"status": "error", "error": str(exc)[:500], "finished_at": _now(), "lease_until": None})
            done += 1
        return done, stale

    # ── Inbox-Snapshot & Heartbeat ────────────────────────────────────────────

    def _inbox_signature(self) -> str:
        from fitness.api.config import INBOX_DIR

        h = hashlib.md5()
        if INBOX_DIR.exists():
            for f in sorted(INBOX_DIR.glob("inbox_*.yml")):
                st = f.stat()
                h.update(f"{f.name}:{st.st_mtime_ns}:{st.st_size};".encode())
        return h.hexdigest()

    def publish(self, force: bool = False) -> None:
        if self.dry_run:
            return
        sig = self._inbox_signature()
        if not force and sig == self._sig and time.monotonic() - self._last_publish < INBOX_REPUBLISH_S:
            return
        from fitness.firestore.coach_bridge import publish_inbox

        publish_inbox(self.db)
        self._sig, self._last_publish = sig, time.monotonic()

    def heartbeat(self, stale: int = 0) -> None:
        if self.dry_run:
            return
        counts = {"queued": 0, "processing": 0}
        for doc in self.db.collection(COMMANDS).where("status", "in", ["queued", "processing"]).stream():
            counts[(doc.to_dict() or {}).get("status")] = counts.get((doc.to_dict() or {}).get("status"), 0) + 1
        self.db.collection(STATE).document("bridge").set({
            "last_seen": self.fb.SERVER_TIMESTAMP, "worker": self.worker, "started_at": self.started_at,
            "version": VERSION, "queued": counts["queued"], "processing": counts["processing"], "stale": stale,
            "done_since_start": self.stats["done"], "errors_since_start": self.stats["error"],
            "last_error": self.last_error,
        })


def _lock(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    fh = open(path, "w")
    try:
        fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        logger.error(f"läuft bereits (Lock {path}) — abgebrochen")
        raise typer.Exit(2)
    return fh


@app.command()
def run(
    max_age_hours: float = typer.Option(6.0, "--max-age-hours", help="Ältere queued-Befehle werden nicht angefasst (nur gezählt)"),
    poll: float = typer.Option(15.0, "--poll", help="Sekunden zwischen Heartbeat-/Aufräum-Zyklen (Befehle wecken den Worker sofort)"),
    catalog: bool = typer.Option(True, "--catalog/--no-catalog", help="Inbox-/KB-Listener + Gemini-Enrichment mitlaufen lassen"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Nur loggen, nichts ausführen/schreiben"),
) -> None:
    """Dauerlauf (systemd: coach-sync.service)."""
    from fitness.catalog.core.paths import runtime_root

    lock = _lock(runtime_root() / ".coach-sync.lock")  # noqa: F841 — bis Prozessende halten
    worker = CoachWorker(max_age_hours=max_age_hours, dry_run=dry_run)
    stop = threading.Event()
    wake = threading.Event()
    import signal

    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: (stop.set(), wake.set()))

    listeners: list = []
    extras: list = []
    if catalog and not dry_run:
        try:
            from fitness.firestore.mirror import start_catalog_watchers

            listeners += start_catalog_watchers()
        except Exception as exc:
            logger.warning(f"Katalog-Listener nicht gestartet: {exc}")
        try:
            from fitness.catalog.api.watcher import start_enrichment_watcher

            extras.append(start_enrichment_watcher())
        except Exception as exc:
            logger.warning(f"Enrichment-Watcher nicht gestartet: {exc}")
    listeners.append(
        worker.db.collection(COMMANDS).where("status", "==", "queued").on_snapshot(lambda *_: wake.set())
    )
    logger.info(f"coach-sync läuft ({worker.worker}) max_age={max_age_hours}h poll={poll}s catalog={catalog} dry_run={dry_run}")

    try:
        while not stop.is_set():
            stale = 0
            try:
                worker.recover()
                _, stale = worker.process()
                worker.publish()
                worker.heartbeat(stale)
                if stale:
                    logger.warning(f"{stale} veraltete Befehle warten (coach-sync drain --include-stale)")
            except Exception as exc:
                logger.warning(f"Zyklus fehlgeschlagen: {type(exc).__name__}: {exc}")
            wake.wait(timeout=poll)
            wake.clear()
    finally:
        for lst in listeners:
            try:
                lst.unsubscribe()
            except Exception:
                pass
        for obs, thread, ev in extras:
            ev.set()
            obs.stop()
            obs.join(timeout=5)
        logger.info("coach-sync beendet")


@app.command()
def drain(
    include_stale: bool = typer.Option(False, "--include-stale", help="Auch Befehle jeden Alters ausführen"),
    dry_run: bool = typer.Option(False, "--dry-run"),
) -> None:
    """Alle wartenden Befehle einmal abarbeiten und beenden."""
    worker = CoachWorker(max_age_hours=6.0, include_stale=include_stale, dry_run=dry_run)
    worker.recover()
    done, stale = worker.process()
    worker.publish(force=True)
    worker.heartbeat(stale)
    logger.info(f"drain: {done} verarbeitet ({worker.stats['done']} ok, {worker.stats['error']} Fehler), {stale} veraltet übersprungen")
    raise typer.Exit(1 if worker.stats["error"] else 0)


@app.command()
def status() -> None:
    """Heartbeat und Befehlsstand (nur lesend)."""
    from fitness.firestore._db import get_db

    db = get_db()
    hb = db.collection(STATE).document("bridge").get()
    if hb.exists:
        d = hb.to_dict()
        age = (_now() - _as_dt(d.get("last_seen"))).total_seconds() if d.get("last_seen") else None
        logger.info(f"Heartbeat: {d.get('worker')} vor {int(age) if age is not None else '?'} s "
                    f"(queued={d.get('queued')} processing={d.get('processing')} stale={d.get('stale')})")
    else:
        logger.warning("Kein Heartbeat — Worker lief noch nie")
    from collections import Counter

    counts = Counter((d.to_dict() or {}).get("status") for d in db.collection(COMMANDS).stream())
    logger.info(f"coachCommands: {dict(counts)}")


if __name__ == "__main__":
    app()
