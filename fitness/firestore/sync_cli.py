"""CLI-Einstieg: python -m firestore.sync pull|push|sync|watch"""

import sys
import time
from pathlib import Path

from loguru import logger

from . import pull, push
from .fuel import pull_fuel, push_fuel, FUEL_DATA_DIR

logger.remove()
logger.add(sys.stderr, format="<green>{time:HH:mm:ss}</green> | <level>{message}</level>", level="INFO")


def _do_pull() -> None:
    r = pull()
    rf = pull_fuel()
    logger.success(
        f"pull — fitness: sessions {r['sessions']} · journal {r['journal']} · inbox {r['inbox']} "
        f"| fuel: nutrition {rf['nutrition']} · supplements {rf['supplements']}"
    )


def _do_push() -> None:
    r = push()
    logger.success(f"push — fitness sessions {r['sessions']}")


def _do_push_fuel(uid: str | None = None) -> None:
    from ._db import UID
    rf = push_fuel(uid or UID)
    logger.success(f"push fuel — {rf.get('written', 0)} writes · {rf.get('skipped', 0)} skipped")
    if rf.get("error"):
        logger.warning(f"push fuel error: {rf['error']}")


def _watch_fuel(uid: str | None = None) -> None:
    """Watchdog: lokale Fuel-Daten → Firestore bei File-Änderung."""
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler, FileModifiedEvent, FileCreatedEvent

    watch_dirs = [
        FUEL_DATA_DIR / "nutrition",
        FUEL_DATA_DIR / "supplements" / "logs",
    ]

    class FuelHandler(FileSystemEventHandler):
        _debounce: float = 0.0

        def on_any_event(self, event):
            if not isinstance(event, (FileModifiedEvent, FileCreatedEvent)):
                return
            if not str(event.src_path).endswith(".json"):
                return
            now = time.monotonic()
            if now - FuelHandler._debounce < 3.0:
                return
            FuelHandler._debounce = now
            logger.info(f"Änderung erkannt: {Path(event.src_path).name} → push fuel")
            _do_push_fuel(uid)

    observer = Observer()
    handler = FuelHandler()
    active = []
    for d in watch_dirs:
        if d.exists():
            observer.schedule(handler, str(d), recursive=False)
            active.append(str(d))

    if not active:
        logger.warning(f"Keine Watch-Verzeichnisse gefunden unter {FUEL_DATA_DIR}")
        return

    observer.start()
    logger.info(f"Watchdog aktiv — beobachte: {', '.join(active)}")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "sync"
    uid = next((a for a in sys.argv[2:] if not a.startswith("--")), None)

    if cmd == "pull":
        logger.info("Pulling from Firestore...")
        _do_pull()
    elif cmd == "push":
        logger.info("Pushing to Firestore...")
        _do_push()
        _do_push_fuel(uid)
    elif cmd == "sync":
        logger.info("Syncing Firestore...")
        _do_pull()
        _do_push()
        _do_push_fuel(uid)
    elif cmd == "watch":
        _watch_fuel(uid)
    else:
        logger.error(f"Unbekannter Befehl: {cmd}  (pull|push|sync|watch)")
        sys.exit(1)


if __name__ == "__main__":
    main()
