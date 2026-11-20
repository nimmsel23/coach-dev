"""
fitness.log.cli — Typer CLI App (fitness-log / coach log / coach clients).

Direkter Dateizugriff auf Session-JSONs — kein Server nötig.
Modular aufgebaut:
  - clients/: Klienten-Logs, Timeline, Journal, Stats & Filter
  - sessions: Persönliche Einheiten (ls, show, week, history, stats)
  - sync:     Firestore ↔ lokal Sync-Status & Registry
  - console:  Live-TUI & Zwei-KI-Analyse
  - drafts:   Persistierte KI-Entwürfe
  - strength: add & wizard zum Erfassen von Kraft-Einheiten
"""
from __future__ import annotations

from typing import Optional

import typer

from .clients import (
    cmd_clients,
    cmd_clients_journal,
    cmd_clients_list,
    cmd_clients_stats,
)
from .drafts import cmd_drafts
from .sessions import cmd_history, cmd_ls, cmd_show, cmd_stats, cmd_week
from .strength import add_exercise, run_wizard
from .sync import cmd_sync_status

app = typer.Typer(
    name="fitness-log",
    help=__doc__,
    no_args_is_help=True,
    add_completion=False,
)

# ── Persönliche Sessions ──────────────────────────────────────────────────────
app.command(name="ls", help="Sessions der letzten N Tage auflisten")(cmd_ls)
app.command(name="show", help="Detail-Ansicht einer Session")(cmd_show)
app.command(name="week", help="Wochenübersicht letzte 7 Tage")(cmd_week)
app.command(name="history", help="Übungs-Verlauf aus SQLite")(cmd_history)
app.command(name="stats", help="Aggregate-Statistiken (Split, Cardio, Coverage)")(cmd_stats)

# ── Sync & Health ─────────────────────────────────────────────────────────────
app.command(name="sync-status", help="Firestore ↔ lokal Sync-Status + Klienten-Registry")(cmd_sync_status)

# ── Klienten ──────────────────────────────────────────────────────────────────
app.command(name="clients", help="Alle Klienten-Sessions chronologisch auflisten und filtern")(cmd_clients)
app.command(name="clients-list", help="Tabelle aller registrierten Klienten anzeigen")(cmd_clients_list)
app.command(name="clients-stats", help="Coaching-Statistiken für Klienten anzeigen")(cmd_clients_stats)
app.command(name="clients-journal", help="Journal-Notizen von Klienten einsehen")(cmd_clients_journal)

# ── Konsole & Drafts ──────────────────────────────────────────────────────────
@app.command(name="console", help="Live-TUI: Klienten-Logs in Echtzeit + Zwei-KI-Analyse (Trainingslücken, Auto-Feedback)")
def cmd_console(
    gap_check_interval: int = typer.Option(1800, "--gap-interval", help="Sekunden zwischen Trainingslücken-Checks"),
    daemon: bool = typer.Option(True, "--daemon/--no-daemon", help="fitness-firestore-daemon mit der Console verwalten"),
    classic: bool = typer.Option(False, "--classic", help="Alte Ein-Panel-Console (Rich) statt Textual"),
) -> None:
    from .console.daemon import firestore_daemon
    with firestore_daemon(daemon):
        if classic:
            from .console import run
            run(gap_check_interval)
        else:
            from .console.tui import run_tui
            run_tui(gap_check_interval)


app.command(name="drafts", help="Persistierte KI-Entwürfe aus der Live-Console anzeigen (Gap-Erklärungen, Feedback)")(cmd_drafts)

# ── Kraft-Session Logging ─────────────────────────────────────────────────────
@app.command(name="add", help="Übung zur Kraft-Session des Tages hinzufügen (merged)")
def cmd_add(
    exercise: str = typer.Argument(..., help="Übungsname (Fuzzy-Match gegen Katalog)"),
    sets: int = typer.Option(1, "--sets", "-s", min=1, help="Anzahl Sätze"),
    reps: str = typer.Option("", "--reps", "-r", help="Wiederholungen (Zahl oder kommagetrennt)"),
    weight: str = typer.Option("", "--weight", "-w", help="Gewicht in kg"),
    block: Optional[str] = typer.Option(None, "--block", "-b", help="Trainingsblock (Push/Pull/Legs)"),
    notes: Optional[str] = typer.Option(None, "--notes", "-n", help="Notiz"),
    effort: Optional[int] = typer.Option(None, "--effort", "--rpe", "-e", help="RPE (1-10)"),
    location: Optional[str] = typer.Option(None, "--location", "-l", help="Trainingsort"),
    duration: Optional[int] = typer.Option(None, "--duration", help="Dauer in Minuten"),
    day: Optional[str] = typer.Option(None, "--date", help="YYYY-MM-DD (Standard: heute)"),
    session_id: Optional[str] = typer.Option(None, "--session-id", help="An bestehende Session anhängen"),
    uid_override: Optional[str] = typer.Option(None, "--uid"),
    dry_run: bool = typer.Option(False, "--dry-run"),
) -> None:
    add_exercise(
        exercise, sets=sets, reps=reps, weight=weight, block=block, notes=notes,
        effort=effort, location=location, duration=duration,
        day=day, session_id=session_id, uid_override=uid_override, dry_run=dry_run,
    )


@app.command(name="wizard", help="Interaktiver Dialog: Block wählen, Übungen + Sätze erfassen")
def cmd_wizard(
    day: Optional[str] = typer.Option(None, "--date", help="YYYY-MM-DD (Standard: heute)"),
    uid_override: Optional[str] = typer.Option(None, "--uid"),
) -> None:
    run_wizard(day=day, uid_override=uid_override)


# ── Entry-Point ───────────────────────────────────────────────────────────────

def main() -> None:
    app()


if __name__ == "__main__":
    main()
