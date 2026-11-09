"""browse commands — list_command, pick_command, show_command."""
import yaml
import typer
from rich.panel import Panel
from rich.table import Table
from rich import box

from anatomy_kb.commands._helpers import (
    console, init_loader, load_exercise, fzf_pick, _gum_log,
)
from anatomy_kb import loader
from anatomy_kb.models import Exercise
from anatomy_kb.commands.teach import _teach_exercise


def list_command():
    """
    [bold]Alle Übungen auflisten[/bold]

    Zeigt eine Tabelle aller verfügbaren Übungen mit ID, Kategorie,
    Bewegungsmuster und primären Muskeln.
    """
    init_loader()
    all_data = loader.load_all()
    if not all_data:
        _gum_log("warn", "Keine Übungen gefunden")
        raise typer.Exit(1)

    table = Table(
        show_header=True,
        header_style="bold cyan",
        box=box.ROUNDED,
        title="[bold]anatomy-kb — Übungen[/bold]",
        title_style="white",
    )
    table.add_column("ID", style="yellow", no_wrap=True)
    table.add_column("Name", style="bold white")
    table.add_column("Kategorie", style="cyan")
    table.add_column("Muster", style="dim")
    table.add_column("Primäre Muskeln", style="green")

    for data in all_data.values():
        ex = Exercise.from_dict(data)
        primary = ", ".join(ex.muscle_roles.primary[:3])
        table.add_row(
            ex.exercise_id,
            ex.name,
            ex.category,
            ex.movement_pattern,
            primary,
        )

    console.print()
    console.print(table)
    console.print()


def pick_command():
    """
    [bold]Interaktive Übungsauswahl via fzf[/bold]

    Öffnet fzf zur Auswahl einer Übung und zeigt dann
    automatisch das vollständige Anatomy-Teaching.
    """
    init_loader()
    ids = loader.list_ids()
    if not ids:
        _gum_log("error", "Keine Übungen gefunden")
        raise typer.Exit(1)

    chosen = fzf_pick(ids, "Übung wählen")
    if not chosen:
        console.print("[dim]Abgebrochen.[/dim]")
        raise typer.Exit(0)

    _teach_exercise(chosen)


def show_command(
    exercise_id: str = typer.Argument(..., help="Exercise-ID (z.B. bench_press, pull_up, squat)"),
):
    """
    [bold]Vollständige YAML-Rohdaten einer Übung[/bold]

    Gibt alle Felder exakt wie in der YAML-Datei aus —
    nützlich für Debugging, Editieren und Schema-Inspektion.

    \b
    Verfügbare IDs: bench_press, pull_up, squat, lunge, rdl
    """
    ex = load_exercise(exercise_id)
    console.print()
    console.print(Panel(
        yaml.dump(ex.raw, allow_unicode=True, default_flow_style=False, sort_keys=False),
        title=f"[bold yellow]{exercise_id}.yml[/bold yellow]",
        border_style="yellow",
    ))
