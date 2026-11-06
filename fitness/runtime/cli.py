from __future__ import annotations

from typing import Optional

import typer
import yaml
from rich.console import Console
from typing_extensions import Annotated

from fitness.runtime.sqlite_history import (
    apply_history_patches,
    delete_history_row,
    find_history_backfill_patches,
    update_history_row,
)
from fitness.runtime.user_data import (
    dataclass_payload,
    iter_session_signals,
    list_runtime_users,
    merge_day_activities,
)
from fitness.runtime.note_backfill import (
    fix_sessions,
    find_suspect_default_effort,
)
from fitness.runtime.journal_migrate import app as journal_migrate_app
app = typer.Typer(help="Runtime user-data CRUD: Sessions/History prüfen und gezielt patchen")
app.add_typer(journal_migrate_app, name="migrate-journal")
console = Console()


@app.command(name="users")
def users():
    """Listet Runtime-User mit Session/Inbox/Journaling-Counts."""
    console.print(yaml.safe_dump({"users": dataclass_payload(list_runtime_users())}, sort_keys=False, allow_unicode=True).rstrip())


@app.command(name="session-signals")
def session_signals(
    uid: Annotated[Optional[str], typer.Option(help="Runtime user id / Firebase uid")] = None,
    exercise_id: Annotated[Optional[list[str]], typer.Option("--exercise-id", "-e", help="Exercise ID filter; repeatable")] = None,
    date_from: Annotated[Optional[str], typer.Option(help="ISO date lower bound")] = None,
    date_to: Annotated[Optional[str], typer.Option(help="ISO date upper bound")] = None,
):
    """Zeigt aus Session-JSONs erkannte Trainingssignale inkl. geparster Werte."""
    signals = iter_session_signals(
        user_id=uid,
        exercise_ids=set(exercise_id or []) or None,
        date_from=date_from,
        date_to=date_to,
    )
    console.print(yaml.safe_dump({"signals": dataclass_payload(signals)}, sort_keys=False, allow_unicode=True).rstrip())


@app.command(name="backfill-history")
def backfill_history(
    uid: Annotated[str, typer.Option(help="Runtime user id / Firebase uid")],
    exercise_id: Annotated[Optional[list[str]], typer.Option("--exercise-id", "-e", help="Exercise ID filter; repeatable")] = None,
    date_from: Annotated[Optional[str], typer.Option(help="ISO date lower bound")] = None,
    date_to: Annotated[Optional[str], typer.Option(help="ISO date upper bound")] = None,
    apply: Annotated[bool, typer.Option("--apply", help="Write patches to SQLite. Default is dry-run.")] = False,
    allow_nonzero: Annotated[bool, typer.Option(help="Also patch non-empty rows. Dangerous; default only patches all-zero rows.")] = False,
):
    """Backfillt History-Werte aus Session-JSONs. Dry-run ohne --apply."""
    patches = find_history_backfill_patches(
        user_id=uid,
        exercise_ids=set(exercise_id or []) or None,
        date_from=date_from,
        date_to=date_to,
        only_zero_rows=not allow_nonzero,
    )
    payload = {
        "dry_run": not apply,
        "patch_count": len(patches),
        "patches": dataclass_payload(patches),
    }
    if apply:
        payload["applied"] = apply_history_patches(patches)
    console.print(yaml.safe_dump(payload, sort_keys=False, allow_unicode=True).rstrip())


@app.command(name="merge-day-activities")
def merge_day_activities_cmd(
    uid: Annotated[Optional[str], typer.Option(help="Runtime user id / Firebase uid")] = None,
    date_from: Annotated[Optional[str], typer.Option(help="ISO date lower bound")] = None,
    date_to: Annotated[Optional[str], typer.Option(help="ISO date upper bound")] = None,
    apply: Annotated[bool, typer.Option("--apply", help="Write canonical day JSONs and delete activity-only sidecars. Default is dry-run.")] = False,
):
    """Fasst Cardio-Sidecars desselben Datums in ein Tagesdokument zusammen."""
    plans = merge_day_activities(
        user_id=uid,
        date_from=date_from,
        date_to=date_to,
        apply=apply,
    )
    console.print(yaml.safe_dump({
        "dry_run": not apply,
        "merge_count": len(plans),
        "plans": dataclass_payload(plans),
    }, sort_keys=False, allow_unicode=True).rstrip())


@app.command(name="fix-notes")
def fix_notes(
    uid: Annotated[Optional[str], typer.Option(help="Runtime user id / Firebase uid; alle User wenn leer")] = None,
    apply: Annotated[bool, typer.Option("--apply", help="Write patches to session JSON. Default is dry-run.")] = False,
):
    """Laesst Haiku Session-Dateien mit leeren reps/weight oder fehlendem `block` direkt lesen
    (+ im --apply-Fall editieren) und aus den geloggten Fakten der Session selbst vervollstaendigen.
    Flaggt zusaetzlich Sessions mit vermutlich nie gesetztem RPE-Default (kein Auto-Fix, nur Hinweis)."""
    results = fix_sessions(user_id=uid, apply=apply)
    suspects = find_suspect_default_effort(user_id=uid)
    payload = {
        "dry_run": not apply,
        "session_count": len(results),
        "sessions": dataclass_payload(results),
        "suspect_default_effort": suspects,
    }
    console.print(yaml.safe_dump(payload, sort_keys=False, allow_unicode=True).rstrip())


@app.command(name="history-update")
def history_update(
    row_id: Annotated[int, typer.Argument(help="training_history row id")],
    sets: Annotated[Optional[int], typer.Option(help="New sets")] = None,
    reps: Annotated[Optional[int], typer.Option(help="New reps")] = None,
    weight: Annotated[Optional[float], typer.Option(help="New weight")] = None,
    rpe: Annotated[Optional[int], typer.Option(help="New RPE")] = None,
    notes: Annotated[Optional[str], typer.Option(help="New notes")] = None,
    pain: Annotated[Optional[str], typer.Option(help="New pain note")] = None,
    completion_status: Annotated[Optional[str], typer.Option(help="New completion status")] = None,
    done: Annotated[Optional[int], typer.Option(help="New done value, 0/1")] = None,
    apply: Annotated[bool, typer.Option("--apply", help="Write update. Default is dry-run.")] = False,
):
    """Patcht eine einzelne History-Zeile. Ohne --apply nur Vorschau."""
    fields = {
        "sets": sets,
        "reps": reps,
        "weight": weight,
        "rpe": rpe,
        "notes": notes,
        "pain": pain,
        "completion_status": completion_status,
        "done": done,
    }
    if not apply:
        console.print(yaml.safe_dump({"dry_run": True, "row_id": row_id, "fields": {k: v for k, v in fields.items() if v is not None}}, sort_keys=False, allow_unicode=True).rstrip())
        return
    try:
        result = update_history_row(row_id, fields)
    except ValueError as exc:
        console.print(f"[red]FAIL:[/red] {exc}")
        raise typer.Exit(code=1)
    console.print(yaml.safe_dump({"dry_run": False, **result}, sort_keys=False, allow_unicode=True).rstrip())


@app.command(name="history-delete")
def history_delete(
    row_ids: Annotated[list[int], typer.Argument(help="training_history row id(s)")],
    apply: Annotated[bool, typer.Option("--apply", help="Delete row. Default is dry-run.")] = False,
):
    """Löscht eine oder mehrere History-Zeilen. Ohne --apply nur Vorschau."""
    if not apply:
        console.print(yaml.safe_dump({"dry_run": True, "row_ids": row_ids, "would_delete": True}, sort_keys=False, allow_unicode=True).rstrip())
        return
    deleted_rows = []
    try:
        for row_id in row_ids:
            deleted_rows.append(delete_history_row(row_id))
    except ValueError as exc:
        console.print(f"[red]FAIL:[/red] {exc}")
        raise typer.Exit(code=1)
    console.print(yaml.safe_dump({"dry_run": False, "deleted": deleted_rows}, sort_keys=False, allow_unicode=True).rstrip())

