"""Popup über notify-send (swaync): Urgency, Actions, Ersetzen pro Tag, Ton, Markup.

Mit Actions blockiert notify-send, bis geklickt/geschlossen wird. Damit der
Pull dadurch nicht hängt, läuft das Warten in einem abgekoppelten Hilfsprozess
(`python -m backend.notifier _wait-action`), der die gewählte Action ausführt.
"""
from __future__ import annotations

import html
import json
import os
import re
import signal
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable

from loguru import logger

from backend.sync.notify import APP_NAME, LOGO

CATEGORY = "fitness.workout"
WAIT_TIMEOUT_S = 600


def escape_markup(text: str) -> str:
    """Kliententexte dürfen das Pango-Markup der Meldung nicht verändern."""
    return html.escape(str(text), quote=False)


@dataclass
class Popup:
    title: str
    body: str
    urgency: str = "normal"
    tag: str | None = None                       # gleicher Tag ersetzt die vorige Meldung
    actions: list[tuple[str, str]] = field(default_factory=list)   # (name, Beschriftung)
    timeout_ms: int | None = None
    sound: str | None = None
    silent: bool = False
    # Kontext für den Action-Handler (Hilfsprozess)
    root: str | None = None
    ids: list[str] = field(default_factory=list)


def build_argv(p: Popup) -> list[str]:
    argv = ["notify-send", f"--app-name={APP_NAME}", f"--icon={LOGO}", f"--urgency={p.urgency}",
            f"--category={CATEGORY}"]
    if p.timeout_ms is not None:
        argv.append(f"--expire-time={p.timeout_ms}")
    if p.tag:
        argv.append(f"--hint=string:x-canonical-private-synchronous:{p.tag}")
    if p.sound and not p.silent:
        argv.append(f"--hint=string:sound-file:{p.sound}")
    if p.silent:
        argv.append("--hint=boolean:suppress-sound:true")
    for name, label in p.actions:
        argv.append(f"--action={name}={label}")
    argv += [p.title, p.body]
    return argv


def _env() -> dict:
    env = {**os.environ}
    env.setdefault("DBUS_SESSION_BUS_ADDRESS", f"unix:path=/run/user/{os.getuid()}/bus")
    return env


Runner = Callable[..., object]


def show(p: Popup, *, run: Runner = subprocess.run, popen: Runner = subprocess.Popen) -> bool:
    """True, wenn die Meldung abgesetzt (bzw. der Wartehelfer gestartet) wurde."""
    try:
        if p.actions:
            payload = json.dumps(asdict(p), ensure_ascii=False)
            popen([sys.executable, "-m", "backend.notifier", "_wait-action", "--payload", payload],
                  env=_env(), cwd=str(Path(__file__).resolve().parents[2]), start_new_session=True,
                  stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            run(build_argv(p), env=_env(), timeout=3, check=True)
        return True
    except Exception as exc:
        logger.warning(f"Popup fehlgeschlagen: {exc}")
        return False


def wait_for_action(p: Popup, *, run: Runner = subprocess.run) -> str:
    """Zeigt die Meldung, wartet auf den Klick und gibt den Action-Namen zurück ("" = keiner)."""
    try:
        res = run(build_argv(p), env=_env(), capture_output=True, text=True, timeout=WAIT_TIMEOUT_S)
    except Exception as exc:
        logger.warning(f"notify-send --wait fehlgeschlagen: {exc}")
        return ""
    return (getattr(res, "stdout", "") or "").strip()


# --- Ein Wartehelfer pro Meldungs-Tag ---------------------------------------------------------
def _waiter_file(directory: Path, tag: str) -> Path:
    return directory / "waiters" / (re.sub(r"[^A-Za-z0-9_.-]", "_", tag) + ".pid")


def _is_waiter(pid: int) -> bool:
    try:
        return b"_wait-action" in Path(f"/proc/{pid}/cmdline").read_bytes()
    except OSError:
        return False


def claim_waiter(directory: Path, tag: str) -> None:
    """Beendet einen älteren Wartehelfer desselben Tags (die Meldung wurde ersetzt) und trägt sich ein.

    Ohne das blieben ersetzte Meldungen bis zum Timeout ein Prozess hängen, und ein Klick würde
    die Action doppelt ausführen. Geprüft wird die Kommandozeile, damit eine wiederverwendete
    PID nie einen fremden Prozess trifft.
    """
    pidfile = _waiter_file(directory, tag)
    try:
        old = int(pidfile.read_text().strip())
    except (OSError, ValueError):
        old = 0
    if old and old != os.getpid() and _is_waiter(old):
        try:
            os.killpg(old, signal.SIGTERM)       # Helfer + sein notify-send-Kind (eigene Session)
        except (ProcessLookupError, PermissionError):
            pass
    pidfile.parent.mkdir(parents=True, exist_ok=True)
    pidfile.write_text(str(os.getpid()))


def release_waiter(directory: Path, tag: str) -> None:
    pidfile = _waiter_file(directory, tag)
    try:
        if pidfile.read_text().strip() == str(os.getpid()):
            pidfile.unlink()
    except OSError:
        pass
