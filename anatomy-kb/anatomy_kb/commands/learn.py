"""learn commands — errors_command + quiz_command."""
import typer
from rich.panel import Panel
from rich.table import Table
from rich import box
from rich.text import Text

from anatomy_kb.commands._helpers import console, load_exercise, _gum_log


def errors_command(
    exercise_id: str = typer.Argument(..., help="Exercise-ID"),
):
    """
    [bold]Fehlerbilder mit anatomischer Begründung[/bold]

    Für jedes Fehlerbild:

    \b
    - Beschreibung des Fehlers
    - Anatomischer Grund (welcher Muskel / welches Gelenk versagt)
    - Korrektur-Hinweis
    - Welche Anatomie-Konzepte es lehrt

    \b
    Beispiel: anatomy-agent errors squat
    """
    ex = load_exercise(exercise_id)
    common_errors = ex.raw.get("common_errors_explained")
    if not common_errors:
        _gum_log("warn", f"Keine Fehlerbilder für {exercise_id}")
        return

    console.print()
    console.print(Panel.fit(
        f"[bold white]{ex.name}[/bold white] — Fehlerbilder",
        border_style="red",
    ))
    console.print()

    for error_id, error in common_errors.items():
        table = Table(box=box.SIMPLE, show_header=False, padding=(0, 1))
        table.add_column("Label", style="bold red", no_wrap=True)
        table.add_column("Inhalt", style="white")

        table.add_row("Problem", error.get("description", ""))
        reason = error.get("anatomical_reason", "").strip().replace("\n", " ")
        table.add_row("Anatomie", reason)
        table.add_row("Korrektur", error.get("correction", ""))
        teaches = error.get("teaches", [])
        if teaches:
            table.add_row("Lehrt", ", ".join(teaches))

        console.print(Panel(table, title=f"[yellow]{error_id}[/yellow]", border_style="dim"))
        console.print()


def quiz_command(
    exercise_id: str = typer.Argument(..., help="Exercise-ID"),
    reveal: bool = typer.Option(False, "--reveal", "-r", help="Antworten sofort anzeigen"),
):
    """
    [bold]Quiz-Prompts mit Fragen und Antworten[/bold]

    Gibt alle Quiz-Fragen der Übung aus. Standardmäßig werden
    Antworten erst auf Tastendruck angezeigt.

    \b
    Optionen:
      --reveal / -r    Alle Antworten direkt einblenden

    \b
    Beispiel:
      anatomy-agent quiz rdl
      anatomy-agent quiz rdl --reveal
    """
    ex = load_exercise(exercise_id)
    prompts = ex.raw.get("quiz_prompts") or []
    if not prompts:
        _gum_log("warn", f"Keine Quiz-Prompts für {exercise_id}")
        return

    console.print()
    console.print(Panel.fit(
        f"[bold white]{ex.name}[/bold white] — Quiz  [dim]({len(prompts)} Fragen)[/dim]",
        border_style="magenta",
    ))
    console.print()

    for i, prompt in enumerate(prompts, 1):
        question = prompt.get("question", "").strip()
        answer = prompt.get("answer", "").strip().replace("\n", " ")

        console.print(Panel(
            f"[bold]{question}[/bold]",
            title=f"[magenta]Frage {i}[/magenta]",
            border_style="magenta",
        ))

        if reveal:
            console.print(Panel(
                answer,
                title=f"[green]Antwort {i}[/green]",
                border_style="green",
            ))
        else:
            typer.prompt("  → Enter für Antwort", default="", show_default=False, prompt_suffix="")
            console.print(Panel(
                answer,
                title=f"[green]Antwort {i}[/green]",
                border_style="green",
            ))

        console.print()
