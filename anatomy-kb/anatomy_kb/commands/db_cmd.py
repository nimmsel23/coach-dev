"""db command — anatomy.sqlite sync + Query."""
from __future__ import annotations

import json
from pathlib import Path

import typer
from rich import box
from rich.panel import Panel
from rich.table import Table

from ._helpers import console, _gum_log
from anatomy_kb import db as _db


def command(
    action: str = typer.Argument("status", help="sync | status | query | gap"),
    sql: str = typer.Option("", "--sql", "-q", help="SQL für query-Aktion"),
):
    """
    [bold]anatomy.sqlite — lokaler analytischer Layer[/bold]

    \b
    Aktionen:
      sync    Alle Quellen einlesen (muscles, exercises, teaching, scores)
      status  Tabellen-Zählstände
      gap     Muskeln mit niedrigem Score (weak_muscles View)
      query   Raw SQL (nur SELECT)

    \b
    Beispiele:
      anatomy-agent db sync
      anatomy-agent db status
      anatomy-agent db gap
      anatomy-agent db query --sql "SELECT muscle_id, score_rate FROM muscle_coverage ORDER BY score_rate"
    """
    if action == "sync":
        with console.status("[dim]Sync läuft...[/dim]"):
            counts = _db.sync_all()
        table = Table(box=box.SIMPLE, show_header=True, padding=(0, 2))
        table.add_column("Tabelle", style="cyan")
        table.add_column("Einträge", justify="right")
        for k, v in counts.items():
            table.add_row(k, str(v))
        console.print(Panel(table, title="[bold]DB Sync[/bold]", border_style="cyan"))
        _gum_log("info", f"DB: {_db.DB_PATH}")

    elif action == "status":
        try:
            conn = _db.connect()
            tables = ["muscles", "exercises", "exercise_muscles", "anatomy_teaching", "flashcard_scores", "training_sessions"]
            table = Table(box=box.SIMPLE, show_header=True, padding=(0, 2))
            table.add_column("Tabelle", style="cyan")
            table.add_column("Einträge", justify="right")
            for t in tables:
                count = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                table.add_row(t, str(count))
            console.print(Panel(table, title="[bold]DB Status[/bold]", border_style="green"))
            _gum_log("info", f"DB: {_db.DB_PATH}")
        except Exception as e:
            _gum_log("error", str(e))
            raise typer.Exit(1)

    elif action == "gap":
        rows = _db.query("SELECT muscle_id, latin, score_rate, last_flashcard, exercise_count FROM weak_muscles")
        if not rows:
            _gum_log("info", "Alle Muskeln über 60% — kein Nachholbedarf")
            return
        table = Table(box=box.SIMPLE, show_header=True, padding=(0, 2))
        table.add_column("Muskel", style="yellow")
        table.add_column("Latein", style="dim")
        table.add_column("Score", justify="right")
        table.add_column("Übungen", justify="right")
        table.add_column("Zuletzt", style="dim")
        for r in rows:
            rate = r["score_rate"]
            score_str = f"[red]{rate:.0%}[/red]" if rate < 0.4 else f"[yellow]{rate:.0%}[/yellow]"
            table.add_row(r["muscle_id"], r["latin"] or "", score_str,
                          str(r["exercise_count"]), r["last_flashcard"] or "—")
        console.print(Panel(table, title="[bold yellow]Schwache Muskeln[/bold yellow]", border_style="yellow"))

    elif action == "query":
        if not sql:
            _gum_log("error", "Kein SQL angegeben — nutze --sql")
            raise typer.Exit(1)
        if not sql.strip().upper().startswith("SELECT"):
            _gum_log("error", "Nur SELECT-Queries erlaubt")
            raise typer.Exit(1)
        try:
            rows = _db.query(sql)
            if not rows:
                console.print("[dim]  Keine Ergebnisse.[/dim]")
                return
            table = Table(box=box.SIMPLE, show_header=True, padding=(0, 1))
            for col in rows[0].keys():
                table.add_column(col, style="cyan")
            for r in rows:
                table.add_row(*[str(v) if v is not None else "—" for v in r.values()])
            console.print(table)
            console.print(f"[dim]  {len(rows)} Zeilen[/dim]")
        except Exception as e:
            _gum_log("error", str(e))
            raise typer.Exit(1)

    else:
        _gum_log("error", f"Unbekannte Aktion: {action}  (sync|status|gap|query)")
        raise typer.Exit(1)
