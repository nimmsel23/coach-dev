"""audit command — runs catalog audit."""
import subprocess
import sys

import typer
from rich.panel import Panel
from rich.rule import Rule
from rich.table import Table
from rich import box
from rich.text import Text

from anatomy_kb.commands._helpers import FITNESS_DEV, console, _gum_log


def command(
    topic: str = typer.Argument("all", help="anatomy | exercises | all"),
    fail_fast: bool = typer.Option(False, "--fail-fast", "-f", help="Exit 1 bei erstem FAIL"),
):
    """
    [bold]Katalog-Integrität prüfen[/bold]

    Führt den catalog Audit für Anatomy-Teaching und Exercise-Definitionen aus.
    Gibt eine strukturierte Übersicht mit OK / WARN / FAIL.

    \b
    Topics:
      anatomy    Anatomy-Teaching-Layer (Lessons, Duplikate, Referenzen)
      exercises  Exercise-Definitionen (Pflichtfelder, Muskelreferenzen)
      demand     Meistgenutzte unreviewed Übungen (Veredelungs-Bedarf)
      all        Beide Topics (Standard)

    \b
    Beispiele:
      anatomy-agent audit
      anatomy-agent audit demand
      anatomy-agent audit exercises --fail-fast
    """
    if topic == "demand":
        from anatomy_kb import db as _db
        try:
            conn = _db.connect()
            sql = """
                SELECT e.exercise_id, e.name, COUNT(*) as usage_count
                FROM training_sessions ts
                JOIN exercises e ON ts.exercise_id = e.exercise_id
                WHERE e.unreviewed = 1
                GROUP BY e.exercise_id
                ORDER BY usage_count DESC
                LIMIT 10
            """
            rows = _db.query(sql)
            if not rows:
                _gum_log("info", "Kein dringender Veredelungs-Bedarf (unreviewed + Sessions) gefunden.")
                return

            table = Table(box=box.SIMPLE, show_header=True, padding=(0, 2))
            table.add_column("Übung", style="cyan")
            table.add_column("ID", style="dim")
            table.add_column("Sessions", justify="right", style="yellow")
            
            for r in rows:
                table.add_row(r["name"] or r["exercise_id"], r["exercise_id"], str(r["usage_count"]))
            
            console.print(Panel(table, title="[bold yellow]Veredelungs-Bedarf (Demand)[/bold yellow]", border_style="yellow"))
            _gum_log("info", "Tipp: Nutze 'anatomy approve <id>' zur Veredelung.")
            return
        except Exception as e:
            _gum_log("error", f"Demand-Audit fehlgeschlagen: {e}")
            raise typer.Exit(1)

    if not FITNESS_DEV.exists():
        _gum_log("error", f"fitness-dev nicht gefunden: {FITNESS_DEV}")
        raise typer.Exit(1)

    topics_to_run = ["anatomy", "exercises"] if topic == "all" else [topic]
    valid_topics = {"anatomy", "exercises"}
    for t in topics_to_run:
        if t not in valid_topics:
            _gum_log("error", f"Unbekanntes Topic: {t}  (anatomy | exercises | all)")
            raise typer.Exit(1)

    overall_fail = 0

    for t in topics_to_run:
        console.print()
        console.print(Rule(f"[bold cyan]audit: {t}[/bold cyan]", style="dim"))

        result = subprocess.run(
            [sys.executable, "-m", "catalog.catalog", "audit", t],
            capture_output=True, text=True, cwd=str(FITNESS_DEV),
        )
        raw_output = result.stdout + result.stderr

        table = Table(box=box.SIMPLE, show_header=False, padding=(0, 1))
        table.add_column("Status", no_wrap=True, width=6)
        table.add_column("Meldung")

        ok_count = warn_count = fail_count = 0
        status_line = ""

        for line in raw_output.splitlines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("[OK]"):
                ok_count += 1
                table.add_row(Text("OK", style="bold green"), line[4:].strip())
            elif line.startswith("[WARN]"):
                warn_count += 1
                table.add_row(Text("WARN", style="bold yellow"), line[6:].strip())
            elif line.startswith("[FAIL]"):
                fail_count += 1
                table.add_row(Text("FAIL", style="bold red"), line[6:].strip())
            elif line.startswith("Status:") or line.startswith("OK:") or line.startswith("FAIL:") or line.startswith("WARN:") or line.startswith("Lessons"):
                status_line += f"  {line}\n"

        console.print(table)

        border = "green" if fail_count == 0 else "red"
        summary = (
            f"[bold green]OK {ok_count}[/bold green]  "
            f"[yellow]WARN {warn_count}[/yellow]  "
            f"[{'bold red' if fail_count else 'dim'}]FAIL {fail_count}[/{'bold red' if fail_count else 'dim'}]"
        )
        if status_line.strip():
            summary += f"\n[dim]{status_line.strip()}[/dim]"
        console.print(Panel.fit(summary, title=f"[{'green' if fail_count == 0 else 'red'}]{t}[/{'green' if fail_count == 0 else 'red'}]", border_style=border))

        overall_fail += fail_count
        if fail_fast and fail_count > 0:
            raise typer.Exit(1)

    console.print()
    if overall_fail > 0:
        _gum_log("error", f"Audit abgeschlossen — {overall_fail} FAIL(s)")
        raise typer.Exit(1)
    else:
        _gum_log("info", "Audit abgeschlossen — alles OK")
