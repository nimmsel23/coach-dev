"""Verdrahtet Watcher + Gap-Loop + Rich-Live-Rendering + Freigabe. Einstieg: run()."""
from __future__ import annotations

import queue as _queue
import sys
import threading as _threading
from contextlib import nullcontext

import typer
from loguru import logger

from ...data import load_client_registry
from ...render import c
from .approval import PendingDraft, handle_key
from .drafts import save_draft
from .events import event_line
from .gap_check import gap_check_loop
from .keys import cbreak_stdin, start_key_listener
from .watcher import SessionJournalHandler


def _analyze_session(
    events: "_queue.Queue[str]",
    review_queue: "_queue.Queue[PendingDraft]",
    uid: str,
    name: str,
    session: dict,
) -> None:
    from fitness.catalog.agent.coach_ai import draft_session_feedback

    def _run() -> None:
        try:
            feedback = draft_session_feedback(session)
        except Exception as exc:
            logger.exception(f"console Feedback-Entwurf fehlgeschlagen fuer '{name}' — Session-Watch laeuft weiter")
            events.put(event_line("red", "Fehler", name, f"Feedback-Entwurf: {exc}"))
            return
        if feedback:
            events.put(event_line("green", "KI-Feedback-Vorschlag", name, feedback))
            path = save_draft(uid, name, "feedback", feedback, session_block=session.get("block"), status="pending")
            review_queue.put(PendingDraft(path=path, name=name, text=feedback))

    _threading.Thread(target=_run, daemon=True).start()


def _setup_file_logging() -> None:
    # Rich's Live-Rendering nimmt exklusiv den Terminal-Stream in Beschlag.
    # loguru's Default-Sink schreibt auf stderr — landet ein Traceback dort
    # waehrend Live aktiv ist, zerreisst das die Panel-Neuzeichnung (Symptom:
    # doppelte/verschobene Boxen, sieht wie ein Haenger aus, ist aber nur ein
    # Rendering-Konflikt). Fix: waehrend der Konsolen-Session in eine Datei
    # loggen, nicht auf den Terminal-Stream.
    from ...catalog.core.paths import runtime_root

    log_dir = runtime_root() / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    logger.remove()
    logger.add(log_dir / "console.log", rotation="1 MB", retention=3, level="INFO")


def run(gap_check_interval: int) -> None:
    from watchdog.observers import Observer
    from rich.console import Console as RichConsole
    from rich.live import Live
    from rich.panel import Panel

    _setup_file_logging()

    registry = load_client_registry()
    if not registry:
        print(c("yellow", "  Keine Klienten in ~/Klienten/ registriert."))
        raise typer.Exit(1)

    from ...catalog.core.paths import runtime_root
    watch_root = runtime_root() / "users"

    events: "_queue.Queue[str]" = _queue.Queue()
    review_queue: "_queue.Queue[PendingDraft]" = _queue.Queue()

    handler = SessionJournalHandler(
        events,
        registry,
        on_session=lambda uid, name, session: _analyze_session(events, review_queue, uid, name, session),
    )

    observer = Observer()
    observer.schedule(handler, str(watch_root), recursive=True)
    observer.start()

    _threading.Thread(
        target=gap_check_loop,
        args=(registry, events, gap_check_interval),
        daemon=True,
    ).start()

    # Interaktive Freigabe braucht ein echtes Terminal (cbreak-Mode) — bei
    # Umleitung/Nicht-TTY (z.B. Tests, Piping) einfach ohne Tastatur-Handling
    # weiterlaufen, Drafts bleiben dann "pending" bis manuell/spaeter geprueft.
    interactive = sys.stdin.isatty()
    key_queue: "_queue.Queue[str]" = _queue.Queue()
    stop_keys = _threading.Event()
    if interactive:
        start_key_listener(key_queue, stop_keys)

    rich_console = RichConsole()
    lines: list[str] = [c("dim", "Live-Konsole gestartet — wartet auf neue Logs (Ctrl+C zum Beenden)")]
    if interactive:
        lines.append(c("dim", "Freigabe: [a] annehmen  [d] verwerfen  [s] spaeter"))
    current: "PendingDraft | None" = None

    def render() -> Panel:
        body = "\n".join(lines[-40:])
        if current:
            body += "\n\n" + c("yellow", f"── Zur Freigabe: {current.name} ──")
            body += "\n" + current.text
            body += "\n" + c("dim", "[a] annehmen  [d] verwerfen  [s] spaeter")
        return Panel(body, title="Fitness Console")

    stdin_ctx = cbreak_stdin() if interactive else nullcontext()

    try:
        with stdin_ctx:
            with Live(render(), console=rich_console, refresh_per_second=2) as live:
                while True:
                    updated = False
                    try:
                        lines.append(events.get(timeout=0.2))
                        del lines[:-200]
                        updated = True
                    except _queue.Empty:
                        pass

                    if current is None:
                        try:
                            current = review_queue.get_nowait()
                            updated = True
                        except _queue.Empty:
                            pass

                    if interactive:
                        try:
                            key = key_queue.get_nowait()
                            current = handle_key(key, current, review_queue, events)
                            updated = True
                        except _queue.Empty:
                            pass

                    if updated:
                        live.update(render())
    except KeyboardInterrupt:
        pass
    finally:
        stop_keys.set()
        observer.stop()
    observer.join()
