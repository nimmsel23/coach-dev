"""Nicht-blockierendes Einzeltasten-Lesen fuer die Live-TUI (cbreak-Mode).

POSIX-only (termios/tty, stdlib) — kein neuer Dependency. Setzt das Terminal
waehrend der Console-Session in cbreak-Mode (kein Enter noetig, kein Echo),
stellt es beim Beenden zuverlaessig wieder her.
"""
from __future__ import annotations

import queue as _queue
import select
import sys
import termios
import threading
import tty
from contextlib import contextmanager


@contextmanager
def cbreak_stdin():
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    try:
        tty.setcbreak(fd)
        yield
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)


def start_key_listener(keys: "_queue.Queue[str]", stop_event: threading.Event) -> threading.Thread:
    def _run() -> None:
        fd = sys.stdin.fileno()
        while not stop_event.is_set():
            ready, _, _ = select.select([fd], [], [], 0.2)
            if ready:
                ch = sys.stdin.read(1)
                if ch:
                    keys.put(ch)

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return t
