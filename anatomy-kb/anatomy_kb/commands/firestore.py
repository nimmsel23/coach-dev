"""firestore command — Sync local YAML knowledge to Firestore."""
from __future__ import annotations

import typer
from rich.table import Table
from rich import box
from rich.panel import Panel

from ._helpers import console, _gum_log
from anatomy_kb import firestore_handler as _fs

def command(
    action: str = typer.Argument("sync", help="sync | status"),
    dry_run: bool = typer.Option(False, "--dry-run", "-n", help="Dry-run (keine Änderungen)"),
    scope: str = typer.Option("all", "--scope", "-s", help="all | muscles | anatomy | index"),
):
    """
    [bold]Firestore Sync — anatomy-kb → fitness-aos[/bold]

    Puscht die lokalen YAML-Daten in die Firestore-Collections der fitness-aos PWA.
    Stellt sicher, dass die biomechanischen Details (Ursprung, Ansatz, etc.)
    für das Frontend verfügbar sind.

    \b
    Aktionen:
      sync    Lokale Daten nach Firestore pushen
      status  Letzten Sync-Status abrufen

    \b
    Beispiele:
      anatomy-agent firestore sync
      anatomy-agent firestore sync --scope muscles --dry-run
      anatomy-agent firestore status
    """
    if action == "status":
        # Hier müssten wir den Status aus firestore_handler._last holen, 
        # aber da dieser nur im Server-Prozess lebt, ist er hier leer.
        # Eventuell später persistieren.
        _gum_log("info", "Status-Abfrage aktuell nur via API möglich.")
        return

    if action == "sync":
        with console.status(f"[dim]Firestore Sync ({scope})...[/dim]"):
            try:
                db = _fs._get_db()
                if scope == "all":
                    results = _fs._run_sync(dry_run=dry_run)
                elif scope == "muscles":
                    results = {"muscles": _fs._sync_muscles(db, dry_run=dry_run)}
                elif scope == "exercises":
                    # Exercises-Sync liegt bewusst nicht im anatomy-kb-Handler (siehe firestore_handler.py).
                    _gum_log("error", "Scope 'exercises' gehört zu catalog/firestore_push.py, nicht zu anatomy-kb.")
                    raise typer.Exit(1)
                elif scope == "anatomy":
                    results = {"anatomy": _fs._sync_anatomy(db, dry_run=dry_run)}
                elif scope == "index":
                    results = {"index": _fs._sync_index(db, dry_run=dry_run)}
                else:
                    _gum_log("error", f"Unbekannter Scope: {scope}")
                    raise typer.Exit(1)
                
                table = Table(box=box.SIMPLE, show_header=True, padding=(0, 2))
                table.add_column("Collection", style="cyan")
                table.add_column("OK", justify="right", style="green")
                table.add_column("Skip", justify="right", style="yellow")
                table.add_column("Error", justify="right", style="red")

                for coll, counts in results.items():
                    # batch_write liefert "unchanged", die älteren Syncs "skip"
                    skipped = counts.get("unchanged", counts.get("skip", 0))
                    table.add_row(coll, str(counts.get("ok", 0)), str(skipped), str(counts.get("error", 0)))
                
                title = "[bold]Firestore Sync" + (" [yellow](DRY)[/yellow]" if dry_run else "") + "[/bold]"
                console.print(Panel(table, title=title, border_style="cyan"))
                
                if not dry_run:
                    _gum_log("info", "Sync erfolgreich abgeschlossen.")
                
            except typer.Exit:
                raise
            except Exception as e:
                _gum_log("error", f"Firestore-Fehler: {e}")
                raise typer.Exit(1)
    else:
        _gum_log("error", f"Unbekannte Aktion: {action} (sync|status)")
        raise typer.Exit(1)
