"""fitness-inbox — Workout-Inbox, Scratchpad, Waybar-Badge, Notification-Helfer."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import typer
from loguru import logger
from rich.console import Console
from rich.table import Table

from backend.notifier import popup as popup_mod
from backend.notifier import waybar as waybar_mod
from backend.notifier.config import ConfigError, NotifyConfig, load_config, write_default
from backend.notifier.hub import Hub
from backend.notifier.inbox import Inbox
from backend.notifier.paths import config_path, data_root, notifier_dir
from backend.notifier.popup import Popup
from backend.notifier.scratchpad import HyprError, Scratchpad

app = typer.Typer(no_args_is_help=True, add_completion=False,
                  help="Fitness Sync: Workout-Inbox, Scratchpad-TUI, Waybar-Badge")
console = Console()

RootOpt = typer.Option(None, "--root", help="Datenwurzel (Standard: FITNESS_DATA_ROOT oder ~/.aos/fitness)")


def _root(root: Optional[Path]) -> Path:
    return Path(root) if root else data_root()


def _config() -> NotifyConfig:
    try:
        return load_config() or NotifyConfig()
    except ConfigError as exc:
        console.print(f"[red]Config-Fehler:[/red] {exc}")
        raise typer.Exit(2)


def _inbox(root: Optional[Path]) -> Inbox:
    return Inbox(notifier_dir(_root(root)))


def _pad(root: Optional[Path]) -> Scratchpad:
    return Scratchpad(_config().scratchpad, root=_root(root))


# --- Oberfläche ---------------------------------------------------------------------
@app.command()
def tui(root: Optional[Path] = RootOpt,
        inbox_only: bool = typer.Option(False, "--inbox", help="Mit der Eingangs-Inbox statt der 5-Tage-Chronik starten"),
        scratchpad: bool = typer.Option(False, "--scratchpad", help="Escape blendet das Hyprland-Scratchpad aus")):
    """Workout-Inbox als TUI starten (im Terminal oder per Scratchpad)."""
    from backend.notifier.tui import InboxApp

    cfg = _config()
    pad = Scratchpad(cfg.scratchpad, root=_root(root)) if scratchpad else None
    InboxApp(_root(root), cfg, scratchpad=pad, view="inbox" if inbox_only else "chronicle").run()


def _run_pad(action: str, root: Optional[Path], focus: Optional[str] = None):
    pad = _pad(root)
    try:
        if action == "toggle":
            console.print(pad.toggle(focus))
        elif action == "show":
            pad.show(focus)
        else:
            pad.hide()
    except HyprError as exc:
        console.print(f"[red]{exc}[/red]")
        raise typer.Exit(1)


@app.command()
def toggle(root: Optional[Path] = RootOpt, focus: Optional[str] = typer.Option(None, help="Eintrag-ID uid/doc_id")):
    """Scratchpad ein-/ausblenden (startet die TUI bei Bedarf). → Keybind."""
    _run_pad("toggle", root, focus)


@app.command()
def show(root: Optional[Path] = RootOpt, focus: Optional[str] = typer.Option(None, help="Eintrag-ID uid/doc_id")):
    """Scratchpad zeigen (nie ausblenden)."""
    _run_pad("show", root, focus)


@app.command()
def hide(root: Optional[Path] = RootOpt):
    """Scratchpad ausblenden."""
    _run_pad("hide", root)


@app.command("waybar")
def waybar_cmd(root: Optional[Path] = RootOpt,
               follow: bool = typer.Option(False, "--follow", help="bei jeder Änderung eine neue JSON-Zeile")):
    """JSON für ein Waybar-Custom-Modul (Zähler ungesehener Workouts)."""
    cfg, inbox = _config().waybar, _inbox(root)
    if follow:
        try:
            waybar_mod.follow(inbox, cfg)
        except KeyboardInterrupt:
            pass
    else:
        waybar_mod.emit(inbox, cfg)


# --- Inbox-CLI -------------------------------------------------------------------------
@app.command("list")
def list_cmd(root: Optional[Path] = RootOpt, unseen: bool = typer.Option(False, "--unseen"),
             uid: Optional[str] = typer.Option(None, "--uid"), as_json: bool = typer.Option(False, "--json"),
             chronicle: bool = typer.Option(False, "--chronicle", help="Workout-Chronik der letzten fünf Kalendertage")):
    """Einträge der Inbox anzeigen."""
    if chronicle:
        from backend.notifier.chronicle import Chronicle
        entries = [] if unseen else Chronicle(_root(root)).entries(uid=uid)
    else:
        entries = _inbox(root).entries(unseen_only=unseen, uid=uid)
    if as_json:
        typer.echo(json.dumps([Inbox.as_dict(None, e) for e in entries], ensure_ascii=False, indent=2))
        return
    table = Table(box=None)
    for col in ("", "Datum", "Klient", "Workout", "ID"):
        table.add_column(col)
    for e in entries:
        info = (e.summary.splitlines()[0] if e.summary else "")
        table.add_row("●" if e.unseen else "", e.date, e.client, info, e.id)
    console.print(table if entries else "Keine Einträge.")


@app.command()
def seen(ids: list[str] = typer.Argument(None, help="Eintrag-IDs (uid/doc_id)"), root: Optional[Path] = RootOpt,
         all_: bool = typer.Option(False, "--all", help="alle als gesehen markieren"),
         uid: Optional[str] = typer.Option(None, "--uid")):
    """Einträge als gesehen markieren."""
    inbox = _inbox(root)
    n = inbox.mark_all_seen(uid=uid) if all_ else inbox.mark_seen(list(ids or []))
    console.print(f"{n} als gesehen markiert.")


# --- Einrichtung -----------------------------------------------------------------------
@app.command()
def init(force: bool = typer.Option(False, "--force", help="vorhandene Config überschreiben")):
    """Standard-Config schreiben — aktiviert Inbox, Actions und Co. beim Pull (--notify)."""
    try:
        path = write_default(force=force)
    except FileExistsError:
        console.print(f"[yellow]{config_path()} existiert schon[/yellow] (--force zum Überschreiben).")
        raise typer.Exit(1)
    console.print(f"Config geschrieben: {path}\nPrüfen mit: fitness-inbox doctor")


@app.command()
def doctor(root: Optional[Path] = RootOpt):
    """Prüft Umgebung und Config."""
    ok = True

    def line(good: bool, text: str, hard: bool = True):
        nonlocal ok
        if not good and hard:
            ok = False
        console.print(f"{'[green]✓[/green]' if good else ('[red]✗[/red]' if hard else '[yellow]–[/yellow]')} {text}")

    line(bool(shutil.which("notify-send")), "notify-send vorhanden")
    daemon = subprocess.run(["pgrep", "-x", "swaync"], capture_output=True).returncode == 0
    line(daemon, "swaync läuft", hard=False)
    cfg_file = config_path()
    try:
        cfg = load_config()
        line(cfg is not None, f"Config {cfg_file}" + ("" if cfg else "  → 'fitness-inbox init' aktiviert den reichen Modus"), hard=False)
    except ConfigError as exc:
        line(False, f"Config fehlerhaft: {exc}")
        cfg = None
    cfg = cfg or NotifyConfig()
    line(bool(shutil.which(cfg.scratchpad.terminal)), f"Terminal '{cfg.scratchpad.terminal}' vorhanden")
    hypr = shutil.which("hyprctl")
    line(bool(hypr), "hyprctl vorhanden", hard=False)
    if hypr:
        try:
            pad = Scratchpad(cfg.scratchpad, root=_root(root))
            pad.visible()
            line(True, f"Hyprland antwortet (Scratchpad: {pad.workspace})")
        except Exception as exc:
            line(False, f"Hyprland: {exc}", hard=False)
    inbox = _inbox(root)
    line(True, f"Inbox {inbox.path}: {len(inbox.entries())} Einträge, {inbox.unseen_count()} neu")
    raise typer.Exit(0 if ok else 1)


@app.command()
def demo(keep: bool = typer.Option(False, "--keep", help="Demo-Daten nicht löschen (Pfad wird ausgegeben)")):
    """Sendet eine als „Demo" beschriftete Meldung mit synthetischen Daten (echte Daten bleiben unberührt)."""
    from backend.core.clients import Client
    from backend.core.store import SessionStore
    from backend.sync.notify import notify_changes
    from backend.sync.pull import Change

    root = Path(tempfile.mkdtemp(prefix="fitness-inbox-demo-"))
    now = datetime.now(timezone.utc).isoformat()
    data = {"date": now[:10], "saved_at": now, "rev": 1, "sessionMode": "strength", "block": "Demo Push",
            "effort": 7, "duration": "55", "notes": "Das ist eine Demo — keine echten Daten.",
            "exercises": [{"name": "Bankdrücken", "setsArray": [{"reps": "8", "weight": "60"}, {"reps": "8", "weight": "60"}]},
                          {"name": "Schulterdrücken", "setsArray": [{"reps": "10", "weight": "20"}]}]}
    SessionStore(root).write("DEMO-UID", now[:10], data)
    hub = Hub(root, load_config() or NotifyConfig(),
              clients={"DEMO-UID": Client("DEMO-UID", "Demo-Klient", "demo", False)})
    notify_changes("Demo-Klient", "DEMO-UID", [Change("DEMO-UID", now[:10], "angelegt", data)],
                   send=lambda t, b: False, hub=hub)
    console.print(f"Demo gesendet. Daten: {root}\nTUI dazu: fitness-inbox tui --root {root}")
    if not keep:
        console.print("(Ordner bleibt liegen, solange die Meldung klickbar sein soll; Aufräumen: rm -r ihn danach.)")


# --- Interner Helfer -----------------------------------------------------------------------
@app.command("_wait-action", hidden=True)
def wait_action(payload: str = typer.Option(..., "--payload")):
    """Wartet auf den Klick einer Meldung mit Actions und führt ihn aus (abgekoppelt gestartet)."""
    raw = json.loads(payload)
    raw["actions"] = [tuple(a) for a in raw.get("actions", [])]
    p = Popup(**raw)
    root = Path(p.root) if p.root else data_root()
    logger.add(notifier_dir(root) / "actions.log", rotation="1 MB", retention=2, level="DEBUG")
    if p.tag:
        popup_mod.claim_waiter(notifier_dir(root), p.tag)
    action = popup_mod.wait_for_action(p)
    if p.tag:
        popup_mod.release_waiter(notifier_dir(root), p.tag)
    logger.info(f"Action '{action}' für {p.ids}")
    try:
        if action in ("default", "open"):
            Scratchpad(_config().scratchpad, root=root).show(focus=p.ids[0] if p.ids else None)
        elif action == "seen":
            Inbox(notifier_dir(root)).mark_seen(p.ids)
    except Exception as exc:
        logger.error(f"Action '{action}' fehlgeschlagen: {exc}")
        raise typer.Exit(1)


def main() -> None:
    app()
