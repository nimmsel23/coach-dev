"""Eine Instanz: schreibende Läufe teilen sich ein flock-Lockfile."""
from __future__ import annotations

import fcntl
import os
from contextlib import contextmanager
from pathlib import Path


class AlreadyRunning(RuntimeError):
    pass


@contextmanager
def single_instance(lock_path: Path):
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    fh = open(lock_path, "w")
    try:
        try:
            fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise AlreadyRunning(str(lock_path)) from None
        fh.write(str(os.getpid()))
        fh.flush()
        yield
    finally:
        fh.close()  # schließt auch das flock
