from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from typing_extensions import Annotated

from fitness.coach.client_session import log_workout as run_log_client_workout
from fitness.catalog.core.resolver import resolve_query as run_resolve_query, build_exercise_index

app = typer.Typer(help="Klienten-Workouts loggen (~/Klienten/<id>/)")
console = Console()


def _prompt_exercises_interactive() -> list[dict]:
    """Fragt Übungen/Sätze interaktiv ab, matcht jede gegen den Katalog (inkl. unreviewed wger-Einträge)."""
    records = build_exercise_index()
    exercises: list[dict] = []
    console.print("[bold]Übungen eingeben — leerer Name = fertig[/bold]")
    while True:
        name = typer.prompt("Übung", default="", show_default=False).strip()
        if not name:
            break

        result = run_resolve_query(name, records)
        exercise_id: Optional[str] = None
        display_name = name
        primary: list[str] = []
        secondary: list[str] = []
        extra: dict = {}

        if result.matched:
            console.print(
                f"  → Katalog-Match: [bold]{result.display_name}[/bold] "
                f"(id={result.canonical_id}, quelle={result.source}, confidence={result.confidence})"
            )
            if typer.confirm("  Übernehmen?", default=True):
                exercise_id = result.canonical_id
                display_name = result.display_name or name
                record = next((r for r in records if r.exercise_id == exercise_id), None)
                if record:
                    primary = record.primary_muscles or []
                    secondary = record.secondary_muscles or []
                if exercise_id and (exercise_id.startswith("wger_") or exercise_id.startswith("yuhonas_")):
                    extra = {"inferred": True, "review_state": "unreviewed"}
        else:
            console.print(f"  [yellow]Kein Katalog-Match für '{name}'[/yellow]")
            if result.suggestions:
                sugg = ", ".join(s.get("display_name", "") for s in result.suggestions[:3] if s.get("display_name"))
                if sugg:
                    console.print(f"  Vorschläge: {sugg}")

        sets: list[dict] = []
        set_no = 1
        while True:
            reps = typer.prompt(f"    Satz {set_no} — Reps (leer = fertig)", default="", show_default=False).strip()
            if not reps:
                break
            weight = typer.prompt(f"    Satz {set_no} — Gewicht", default="", show_default=False).strip()
            sets.append({"reps": reps, "weight": weight})
            set_no += 1

        note = typer.prompt("  Notiz (optional)", default="", show_default=False).strip()

        exercises.append({
            "name": display_name,
            "id": exercise_id,
            "primaryMuscles": primary,
            "secondaryMuscles": secondary,
            "setsArray": sets,
            "source": "manual",
            "note": note,
            **extra,
        })
        console.print("")
    return exercises


@app.command(name="log-client-workout")
def log_client_workout(
    client: Annotated[str, typer.Option(help="Klienten-Slug, z.B. jakob-stadler (~/Klienten/<slug>/)")],
    exercises_file: Annotated[Optional[Path], typer.Option("--exercises-file", help="JSON-Datei mit Übungsliste. Ohne Angabe: interaktiver Prompt")] = None,
    date: Annotated[Optional[str], typer.Option(help="ISO-Datum, Default heute")] = None,
    block: Annotated[str, typer.Option(help="Trainingsblock, z.B. Push/Pull/Full Body")] = "",
    duration: Annotated[str, typer.Option(help="Dauer in Minuten")] = "",
    location: Annotated[str, typer.Option(help="Ort, z.B. Fitnessstudio-Name")] = "",
):
    """Workout für einen Klienten loggen (POST an fitness-api :9150 falls firebase_uid vorhanden, sonst lokal staged)."""
    if exercises_file:
        import json as _json
        exercises = _json.loads(exercises_file.read_text())
    else:
        exercises = _prompt_exercises_interactive()
        if not exercises:
            console.print("[red]FAIL:[/red] Keine Übungen eingegeben, abgebrochen.")
            raise typer.Exit(code=1)
    try:
        result = run_log_client_workout(
            client, exercises, day=date, block=block, duration=duration, location=location
        )
    except FileNotFoundError as exc:
        console.print(f"[red]FAIL:[/red] {exc}")
        raise typer.Exit(code=1)
    except Exception as exc:
        console.print(f"[red]FAIL:[/red] {exc}")
        raise typer.Exit(code=1)

    if result["mode"] == "api":
        console.print(f"[green]OK:[/green] Session gespeichert via API (uid={result['uid']})")
    else:
        console.print(f"[yellow]STAGED:[/yellow] Kein firebase_uid für '{client}' — lokal abgelegt: {result['path']}")
        console.print("  Noch NICHT in der App sichtbar. Nach Firebase-User-Anlage erneut mit gesetztem firebase_uid loggen (oder migrieren).")


def main() -> None:
    app()


if __name__ == "__main__":
    main()
