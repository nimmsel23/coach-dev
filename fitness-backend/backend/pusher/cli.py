"""fitness-push — Push-Nachrichten vom Laptop an Nutzer senden.

  fitness-push                 TUI öffnen
  fitness-push users           Empfänger und Status auflisten
  fitness-push send ...        Nachricht senden (ohne --apply nur Trockenlauf)
  fitness-push history         letzte Sendungen
"""
from __future__ import annotations

import sys
from typing import Optional

import typer
from loguru import logger
from rich.console import Console
from rich.table import Table

from backend.core.clients import load_clients
from backend.pusher import service
from backend.pusher.message import Message, MessageError
from backend.pusher.paths import log_path
from backend.pusher.recipients import load_recipients
from backend.pusher.source import FirebasePushSource
from backend.pusher.templates import load_templates

app = typer.Typer(add_completion=False, help="Fitness Push: Nachrichten an Nutzer senden (TUI + CLI)")
console = Console()


def _setup_logging() -> None:
    """Datei statt stderr — stderr würde die TUI überschreiben."""
    logger.remove()
    path = log_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    logger.add(path, rotation="1 MB", retention=5, level="INFO")


@app.callback(invoke_without_command=True)
def main_callback(ctx: typer.Context, dry_run: bool = typer.Option(False, "--dry-run", help="TUI im Trockenlauf starten")) -> None:
    if ctx.invoked_subcommand is not None:
        return
    _setup_logging()
    from backend.pusher.tui import PushApp

    PushApp(FirebasePushSource(), dry_run=dry_run).run()


@app.command()
def users() -> None:
    """Empfänger und ihren Push-Status anzeigen (nur lesen)."""
    _setup_logging()
    table = Table(show_header=True, header_style="bold")
    for column in ("Name", "UID", "Geräte", "Status"):
        table.add_column(column)
    for r in load_recipients(FirebasePushSource(), load_clients()):
        table.add_row(r.name + (" (ich)" if r.is_coach else ""), r.uid[:10] + "…", str(len(r.tokens)),
                      f"[green]{r.status}[/]" if r.eligible else f"[dim]{r.status}[/]")
    console.print(table)


@app.command()
def send(
    title: Optional[str] = typer.Option(None, "--title", "-t", help="Titel"),
    body: Optional[str] = typer.Option(None, "--body", "-b", help="Text"),
    link: str = typer.Option("/", "--link", "-l", help="Ziel: / oder https://… (nur eigene Apps)"),
    template: Optional[str] = typer.Option(None, "--template", help="Vorlage statt --title/--body"),
    uid: list[str] = typer.Option([], "--uid", "-u", help="UID oder Name; mehrfach möglich"),
    everyone: bool = typer.Option(False, "--all", help="an alle Bereiten"),
    me: bool = typer.Option(False, "--me", help="nur an dich selbst (Test)"),
    apply: bool = typer.Option(False, "--apply", help="wirklich senden (ohne: Trockenlauf)"),
) -> None:
    """Nachricht senden. Ohne --apply passiert nichts außer der Vorschau."""
    _setup_logging()
    if template:
        templates = load_templates()
        if template not in templates:
            console.print(f"[red]Vorlage unbekannt:[/] {template}  (vorhanden: {', '.join(templates)})")
            raise typer.Exit(2)
        base = templates[template]
        message = Message(title or base.title, body or base.body, link if link != "/" else base.link)
    else:
        message = Message(title or "", body or "", link)
    try:
        message = message.validate()
    except MessageError as exc:
        console.print(f"[red]Nachricht ungültig:[/] {exc}")
        raise typer.Exit(2)
    if sum([bool(uid), everyone, me]) != 1:
        console.print("[red]Genau eine Auswahl nötig:[/] --uid (mehrfach), --all oder --me")
        raise typer.Exit(2)

    source = FirebasePushSource()
    recipients = load_recipients(source, load_clients())
    if me:
        chosen = [r for r in recipients if r.is_coach]
    elif everyone:
        chosen = [r for r in recipients if r.eligible]
    else:
        wanted = {w.lower() for w in uid}
        chosen = [r for r in recipients if r.uid.lower() in wanted or r.name.lower() in wanted]
        unknown = wanted - {r.uid.lower() for r in chosen} - {r.name.lower() for r in chosen}
        if unknown:
            console.print(f"[red]Unbekannt:[/] {', '.join(sorted(unknown))}")
            raise typer.Exit(2)
    if not chosen:
        console.print("[yellow]Keine Empfänger.[/]")
        raise typer.Exit(1)

    report = service.send(source, chosen, message, dry_run=not apply)
    table = Table(title=("TROCKENLAUF" if report.dry_run else "GESENDET") + f" — {message.title}")
    for column in ("Name", "Geräte", "Gesendet", "Fehlgeschlagen", "Hinweis"):
        table.add_column(column)
    for row in report.rows:
        table.add_row(row.name, str(row.devices), str(row.sent), str(row.failed),
                      row.skipped or (f"{row.removed} tote Tokens entfernt" if row.removed else ""))
    console.print(table)
    if report.dry_run:
        console.print("[yellow]Nichts gesendet.[/] Mit --apply wirklich senden.")
    raise typer.Exit(0 if report.failed == 0 else 1)


@app.command()
def history(limit: int = typer.Option(15, "--limit", "-n")) -> None:
    """Letzte Sendungen anzeigen."""
    table = Table(show_header=True, header_style="bold")
    for column in ("Zeit", "Modus", "Titel", "Erreicht"):
        table.add_column(column)
    for e in service.read_history(limit=limit):
        rows = e.get("rows", [])
        reached = sum(1 for r in rows if not r.get("skipped") and r.get("sent", 0) > 0)
        table.add_row(str(e.get("at", ""))[:16].replace("T", " "), "Trocken" if e.get("dry_run") else "Echt",
                      str(e.get("title", ""))[:40], f"{reached}/{len(rows)}")
    console.print(table)


def main() -> None:
    app()


if __name__ == "__main__":
    sys.exit(main())
