from __future__ import annotations

import sys
from typing import Optional
from pathlib import Path

import yaml
import typer
from rich.panel import Panel
from typing_extensions import Annotated

from fitness.catalog.core.paths import DATA_DIR
from fitness.catalog.bootstrap import bootstrap as run_bootstrap
from fitness.catalog.core.audit import (
    run_anatomy_audit,
    run_coverage_audit,
    run_aliases_audit,
    audit_exercises,
    run_all_audits,
    status_for_exercises,
    run_demand_audit,
    run_source_consistency_audit,
)
from fitness.catalog.coach_sheet import build_coach_sheet, render_coach_sheet_markdown
from fitness.catalog.coverage import calculate_coverage as run_calculate_coverage
from fitness.catalog.core.doctor import run_doctor
from fitness.catalog.history import ensure_history_db, log_training_entry as run_log_training_entry, progress_hint, read_history
from fitness.catalog.agent.obsidian import (
    export_coach_sheet_note,
    export_coverage_note,
    export_exercise_note,
    export_plan_note,
    export_teach_note,
    export_weekly_report_note,
)
from fitness.catalog.preview import preview_file, render_markdown
from fitness.catalog.planner import build_plan
from fitness.catalog.agent.teaching import teach_exercise
from fitness.catalog.core.wger import build_plan_wger_payload, map_wger as run_map_wger, wger_check
from fitness.catalog.core.wger_index import export_wger_index as run_export_wger_index
from fitness.catalog.core.resolver import resolve_query
from fitness.catalog.weekly import build_weekly_coverage
from fitness.catalog.tui import run_tui
from fitness.catalog.api.watcher import run_watcher
from fitness.catalog.importer import import_external_exercises, reimport_exercise
from fitness.catalog.api.firestore_push import run_kb_sync, push_changed_exercises, sync_muscles
from fitness.firestore.kb import get_db
from fitness.catalog.core.resolver import resolve_query as run_resolve_query, build_exercise_index
from fitness.catalog.core.rich_utils import (
    console,
    print_audit_report,
    print_bootstrap_report,
    print_doctor_report,
    print_exercise_audit,
    print_demand_audit,
    print_source_consistency_audit,
)

app = typer.Typer(help="AlphaOS Fitness Agent CLI", add_completion=False)


@app.command()
def bootstrap(
    force: Annotated[bool, typer.Option(help="Overwrite existing files")] = False,
):
    """Initialize ~/.aos/fitness"""
    report = run_bootstrap(force=force)
    print_bootstrap_report(report)


@app.command()
def doctor():
    """Check the local runtime layout"""
    report = run_doctor()
    print_doctor_report(report)
    if report.has_failures:
        raise typer.Exit(code=1)


@app.command()
def audit(
    topic: Annotated[
        str, typer.Argument(help="Audit topic")
    ] = "all", # Defaulting to all for ease of use
    enrich: Annotated[
        int, typer.Option(help="Nur bei topic=demand: Top-N Kandidaten direkt an Gemini schicken (Inbox-Draft erzeugen)")
    ] = 0,
):
    """Run deterministic audits"""
    if topic == "anatomy":
        report = run_anatomy_audit()
        print_audit_report(
            "Fitness Agent Anatomy Audit",
            report,
            "ANATOMY_LAYER_USABLE",
            "ANATOMY_LAYER_BROKEN",
        )
        if report.has_failures:
            raise typer.Exit(code=1)
    elif topic == "coverage":
        report = run_coverage_audit()
        print_audit_report(
            "Fitness Agent Coverage Audit",
            report,
            "COVERAGE_LAYER_USABLE",
            "COVERAGE_LAYER_BROKEN",
        )
        if report.has_failures:
            raise typer.Exit(code=1)
    elif topic == "aliases":
        report = run_aliases_audit()
        print_audit_report(
            "Fitness Agent Aliases Audit",
            report,
            "ALIASES_LAYER_USABLE",
            "ALIASES_LAYER_BROKEN",
        )
        if report.has_failures:
            raise typer.Exit(code=1)
    elif topic == "exercises":
        result = audit_exercises()
        status = status_for_exercises(result)
        print_exercise_audit(result, status)
        if status == "FAIL":
            raise typer.Exit(code=1)
    elif topic == "demand":
        result = run_demand_audit()
        print_demand_audit(result)
        if result.error:
            raise typer.Exit(code=1)
        if enrich > 0 and result.entries:
            from fitness.catalog.agent.gemini import load_gemini_key
            from fitness.catalog.api.watcher import process_inbox_file_virtual

            api_key = load_gemini_key()
            if not api_key:
                console.print("[fail]FAIL:[/fail] Kein Gemini-API-Key gefunden (~/.env/gemini.env)")
                raise typer.Exit(code=1)

            for entry in result.entries[:enrich]:
                console.print(f"[dim]Enriche {entry.exercise_id} ({entry.display_name})...[/dim]")
                try:
                    process_inbox_file_virtual(entry.exercise_id, entry.display_name, api_key)
                except Exception as exc:
                    console.print(f"[fail]FAIL[/fail] {entry.exercise_id}: {exc}")
            console.print(Panel(f"[ok]{min(enrich, len(result.entries))} Kandidaten an Gemini geschickt — Inbox prüfen.[/ok]", expand=False))
    elif topic == "source-consistency":
        result = run_source_consistency_audit()
        print_source_consistency_audit(result)
        if result.flags:
            raise typer.Exit(code=1)
    elif topic == "all":
        sys.exit(run_all_audits())
    else:
        console.print(f"[fail]Unknown audit topic:[/fail] {topic}")
        raise typer.Exit(code=1)


@app.command()
def resolve(query: str):
    """Resolve an exercise query"""
    result = resolve_query(query)
    if result.matched:
        console.print(
            yaml.safe_dump(result.__dict__, sort_keys=False, allow_unicode=True).rstrip()
        )
    else:
        console.print(f"[fail]Query not resolved:[/fail] {query}")
        raise typer.Exit(code=1)


@app.command()
def coverage(
    exercise: Annotated[Optional[str], typer.Option(help="Exercise ID or query")] = None,
    week: Annotated[Optional[str], typer.Option(help="Week selector (e.g. 2024-W10)")] = None,
    sets: Annotated[Optional[int], typer.Option(help="Number of sets")] = None,
    rpe: Annotated[Optional[int], typer.Option(help="RPE value")] = None,
):
    """Calculate muscle coverage"""
    if week:
        try:
            result = build_weekly_coverage(week)
            console.print(yaml.safe_dump({"weekly_coverage": result}, sort_keys=False, allow_unicode=True).rstrip())
        except ValueError as exc:
            console.print(f"[fail]FAIL:[/fail] {exc}")
            raise typer.Exit(code=1)
    elif exercise:
        if sets is None or rpe is None:
            console.print("[fail]FAIL:[/fail] --exercise requires --sets and --rpe")
            raise typer.Exit(code=1)
        try:
            result = run_calculate_coverage(exercise, sets, rpe)
            console.print(yaml.safe_dump(result, sort_keys=False, allow_unicode=True).rstrip())
        except ValueError as exc:
            console.print(f"[fail]FAIL:[/fail] {exc}")
            raise typer.Exit(code=1)
    else:
        console.print("[fail]FAIL:[/fail] Provide either --exercise or --week")
        raise typer.Exit(code=1)



@app.command()
def log(
    exercise: Annotated[str, typer.Option(help="Exercise ID or query")],
    sets: Annotated[int, typer.Option(help="Number of sets")],
    reps: Annotated[int, typer.Option(help="Reps")],
    weight: Annotated[float, typer.Option(help="Weight")],
    rpe: Annotated[int, typer.Option(help="RPE value")],
    workout_id: Annotated[Optional[str], typer.Option(help="Workout identifier")] = None,
    date: Annotated[Optional[str], typer.Option(help="ISO date")] = None,
    notes: Annotated[str, typer.Option(help="Notes")] = "",
    pain: Annotated[str, typer.Option(help="Pain notes")] = "",
    completion_status: Annotated[str, typer.Option(help="Completion status")] = "completed",
):
    """Log a training set"""
    try:
        result = run_log_training_entry(
            exercise,
            sets=sets,
            reps=reps,
            weight=weight,
            rpe=rpe,
            workout_id=workout_id,
            date=date,
            notes=notes,
            pain=pain,
            completion_status=completion_status,
        )
        console.print(
            yaml.safe_dump(
                {
                    "exercise_id": result.exercise_id,
                    "display_name": result.display_name,
                    "workout_id": result.workout_id,
                    "row_id": result.row_id,
                    "db_path": str(ensure_history_db()),
                },
                sort_keys=False,
                allow_unicode=True,
            ).rstrip()
        )
    except ValueError as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)


@app.command()
def history(
    exercise: Annotated[str, typer.Option(help="Exercise ID or query")],
    limit: Annotated[int, typer.Option(help="Number of recent entries")] = 10,
):
    """Show recent training history"""
    try:
        entries = read_history(exercise, limit=limit)
        console.print(
            yaml.safe_dump(
                {"exercise": exercise, "entries": entries},
                sort_keys=False,
                allow_unicode=True,
            ).rstrip()
        )
    except ValueError as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)


@app.command()
def progress(
    exercise: Annotated[str, typer.Option(help="Exercise ID or query")],
):
    """Show a simple progression hint"""
    try:
        hint = progress_hint(exercise)
        console.print(yaml.safe_dump(hint, sort_keys=False, allow_unicode=True).rstrip())
    except ValueError as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)


@app.command()
def report(
    week: Annotated[str, typer.Option(help="Week selector")] = "current",
    export: Annotated[Optional[str], typer.Option(help="Optional export target")] = None,
    force: Annotated[bool, typer.Option(help="Overwrite the target file")] = False,
):
    """Build a weekly coverage report"""
    try:
        if export == "obsidian":
            weekly_coverage, export_result = export_weekly_report_note(week, force=force)
            payload = {
                "weekly_coverage": weekly_coverage,
                "export": {
                    "format": "obsidian",
                    "path": str(export_result.path),
                    "overwritten": export_result.overwritten,
                    "used_fallback_name": export_result.used_fallback_name,
                }
            }
            if export_result.warning:
                console.print(f"[warn]WARN:[/warn] {export_result.warning}")
        else:
            weekly_coverage = build_weekly_coverage(week)
            payload = {"weekly_coverage": weekly_coverage}
        
        console.print(yaml.safe_dump(payload, sort_keys=False, allow_unicode=True).rstrip())
    except ValueError as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)


@app.command()
def plan(
    template: Annotated[Optional[str], typer.Option(help="Plan template name")] = None,
    split: Annotated[Optional[str], typer.Option(help="Split name")] = None,
    day: Annotated[Optional[str], typer.Option(help="Training day")] = None,
    goal: Annotated[Optional[str], typer.Option(help="Training goal")] = None,
    export: Annotated[Optional[str], typer.Option(help="Optional export target")] = None,
    force: Annotated[bool, typer.Option(help="Overwrite the target file")] = False,
):
    """Build a rule-based workout plan"""
    try:
        result = build_plan(template=template, split=split, day=day, goal=goal)
        if export == "obsidian":
            export_result = export_plan_note(result, force=force)
            if export_result.warning:
                console.print(f"[warn]WARN:[/warn] {export_result.warning}")
            console.print(
                yaml.safe_dump(
                    {
                        "format": "obsidian",
                        "path": str(export_result.path),
                        "overwritten": export_result.overwritten,
                        "used_fallback_name": export_result.used_fallback_name,
                    },
                    sort_keys=False,
                    allow_unicode=True,
                ).rstrip()
            )
        elif export in {"wger-json", "wger"}:
            payload = build_plan_wger_payload(result, export_format=export)
            warnings = payload.get("warnings", [])
            if isinstance(warnings, list):
                for warning in warnings:
                    if isinstance(warning, str) and warning.strip():
                        console.print(f"[warn]WARN:[/warn] {warning}")
            console.print(yaml.safe_dump(payload, sort_keys=False, allow_unicode=True).rstrip())
        else:
            console.print(yaml.safe_dump(result.__dict__, sort_keys=False, allow_unicode=True).rstrip())
    except ValueError as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)


@app.command()
def teach(
    exercise_id: str,
    mode: Annotated[str, typer.Option(help="Teaching mode")] = "trainer",
    export: Annotated[Optional[str], typer.Option(help="Optional export target")] = None,
    force: Annotated[bool, typer.Option(help="Overwrite the target file")] = False,
):
    """Render a structured anatomy lesson"""
    try:
        if export == "obsidian":
            export_result = export_teach_note(exercise_id, mode=mode, force=force)
            if export_result.warning:
                console.print(f"[warn]WARN:[/warn] {export_result.warning}")
            console.print(
                yaml.safe_dump(
                    {
                        "format": "obsidian",
                        "path": str(export_result.path),
                        "overwritten": export_result.overwritten,
                        "used_fallback_name": export_result.used_fallback_name,
                    },
                    sort_keys=False,
                    allow_unicode=True,
                ).rstrip()
            )
        else:
            output = teach_exercise(exercise_id, mode=mode)
            render_markdown(output)
    except ValueError as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)


@app.command()
def coach_sheet(
    exercise: Annotated[str, typer.Option(help="Exercise ID or query")],
    export: Annotated[Optional[str], typer.Option(help="Optional export target")] = None,
    force: Annotated[bool, typer.Option(help="Overwrite the target file")] = False,
):
    """Render a coach sheet"""
    try:
        if export == "obsidian":
            export_result = export_coach_sheet_note(exercise, force=force)
            if export_result.warning:
                console.print(f"[warn]WARN:[/warn] {export_result.warning}")
        else:
            sheet = build_coach_sheet(exercise)
            output = render_coach_sheet_markdown(sheet)
            render_markdown(output)
    except ValueError as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)


@app.command(name="add-exercise")
def add_exercise(
    name: Annotated[str, typer.Argument(help="Exercise Name (z.B. 'Kabel-Crossover' oder ID)")],
    force: Annotated[bool, typer.Option(help="Overwrite existing inbox draft")] = False,
):
    """Fügt ein neues Exercise über die Gemini AI-Pipeline hinzu (bewahrt Original-Beschreibungen)"""
    from fitness.catalog.agent.gemini import load_gemini_key
    from fitness.catalog.api.watcher import process_inbox_file_virtual

    api_key = load_gemini_key()
    if not api_key:
        console.print("[fail]FAIL:[/fail] GEMINI_API_KEY nicht gefunden in Environment oder ~/.env/fitness.env")
        raise typer.Exit(code=1)

    safe_id = name.lower().replace(" ", "_")
    console.print(f"[info]Gemini-Pipeline:[/info] Erstelle/enricher Katalog-Datei für '{name}'...")
    process_inbox_file_virtual(safe_id, name, api_key, force=force)
    console.print(f"[ok]OK:[/ok] Inbox-Draft für '{name}' erfolgreich erstellt (Original & KI-Notes verknüpft).")


@app.command(name="find-source")
def find_source(query: str):
    """Durchsucht IMMER BEIDE Rohquellen (unreviewed_wger.yml UND
    unreviewed_yuhonas.yml) fuer eine Uebung und zeigt Treffer + unsichere
    Kandidaten getrennt an.

    Existiert, weil manuelles grep/Nachschlagen gegen nur EINE der beiden
    Dateien wiederholt zu falschen "gibt's nicht"-Aussagen gefuehrt hat,
    obwohl die Uebung in der jeweils anderen Quelle die ganze Zeit vorhanden
    war (z.B. "Bent Over Barbell Row" — nur in yuhonas, nicht in wger).
    `find_source_entries()` selbst durchsucht seit jeher beide Dateien
    zuverlaessig — dieser Command macht das jetzt auch fuer reine Recherche
    (nicht nur intern beim Draft-Erstellen) zum verbindlichen ersten Schritt,
    statt dass jede Session/jeder Aufruf ad-hoc neu (und potenziell nur
    einseitig) grept."""
    from fitness.catalog.core.source_merge import find_source_entries

    found = find_source_entries(query, None)
    any_hit = False
    for source_key, label in (("wger", "wger"), ("yuhonas", "yuhonas")):
        entry = found.get(source_key)
        candidate = found.get(f"{source_key}_candidate")
        score = found.get(f"{source_key}_candidate_score")
        if entry:
            any_hit = True
            id_value = entry.get(f"{source_key}_id")
            console.print(f"[ok]{label}:[/ok] '{entry.get('display_name')}' ({source_key}_id={id_value})")
        elif candidate:
            id_value = candidate.get(f"{source_key}_id") or candidate.get("exercise_id")
            console.print(f"[warn]{label} (unsicher, Score {score:.0f}):[/warn] '{candidate.get('display_name')}' ({source_key}_id={id_value}) — nicht automatisch verlinkt, manuell pruefen")
        else:
            console.print(f"[dim]{label}:[/dim] kein Treffer")
    if not any_hit:
        console.print(f"[warn]WARN:[/warn] '{query}' in KEINER der beiden Quellen mit sicherem Score gefunden.")


@app.command(name="new-draft")
def new_draft(
    name: Annotated[str, typer.Argument(help="Exercise Name (z.B. 'Vorgebeugtes Langhantelrudern (stehend)')")],
    exercise_id: Annotated[Optional[str], typer.Option("--id", help="Custom exercise_id (default: aus Name abgeleitet)")] = None,
    wger_id: Annotated[Optional[str], typer.Option(help="wger_id als Basis-Referenz verlinken (kein Auto-Match noetig/gewuenscht)")] = None,
    yuhonas_id: Annotated[Optional[str], typer.Option(help="yuhonas_id als Basis-Referenz verlinken")] = None,
    force: Annotated[bool, typer.Option(help="Bestehenden Draft ueberschreiben")] = False,
):
    """Legt einen neuen Inbox-Draft an — Basis ist NUR die ID-Referenz zu
    wger/yuhonas (kein Content-Dump). Ohne --wger-id/--yuhonas-id wird per
    Name-Fuzzy-Match versucht zu verlinken (nur bei sicherem Treffer). Für
    Varianten, die es bei wger/yuhonas so nicht gibt (z.B. eine spezifische
    Rudern-Variante), --wger-id/--yuhonas-id der naechstliegenden Basisübung
    manuell angeben — die neue Datei bekommt dann NUR deren ID als Referenz,
    keinen kopierten Inhalt. Danach z.B. mit `enrich <id>` (Gemini) oder von
    Hand inhaltlich fuellen."""
    from fitness.catalog.agent.inbox_actions import create_inbox_draft

    try:
        target = create_inbox_draft(
            name,
            exercise_id=exercise_id,
            wger_id=wger_id,
            yuhonas_id=yuhonas_id,
            force=force,
        )
    except FileExistsError as exc:
        console.print(f"[fail]FAIL:[/fail] {exc} (mit --force ueberschreiben)")
        raise typer.Exit(code=1)
    console.print(f"[ok]OK:[/ok] {target}")


@app.command(name="enrich")
def enrich_exercise(
    exercise_id: Annotated[str, typer.Argument(help="Exercise ID (z.B. '022' oder 'wger_31')")],
    force: Annotated[bool, typer.Option(help="Force re-enrichment")] = True,
):
    """Enriched eine bestehende Übung mit der Gemini AI Pipeline"""
    from fitness.catalog.agent.gemini import load_gemini_key
    from fitness.catalog.api.watcher import process_inbox_file_virtual
    from fitness.catalog.core.resolver import find_by_id, build_exercise_index

    api_key = load_gemini_key()
    if not api_key:
        console.print("[fail]FAIL:[/fail] GEMINI_API_KEY nicht gefunden")
        raise typer.Exit(code=1)

    records = build_exercise_index()
    record = find_by_id(exercise_id, records)
    if not record:
        console.print(f"[fail]FAIL:[/fail] Exercise '{exercise_id}' nicht im Index gefunden.")
        raise typer.Exit(code=1)

    console.print(f"[info]Gemini-Pipeline:[/info] Re-Enriching '{record.display_name}' ({exercise_id})...")
    process_inbox_file_virtual(exercise_id, record.display_name, api_key, force=force)
    console.print(f"[ok]OK:[/ok] Draft für '{record.display_name}' in fitness/catalog/kb/inbox/ generiert.")


@app.command()
def tui(
    screen: Annotated[str, typer.Option(help="Initial screen")] = "dashboard",
    graveyard: Annotated[bool, typer.Option("--graveyard", "-g", help="Direkt im Inbox-Graveyard starten")] = False,
):
    """Launch the Vitaltrainer TUI"""
    if graveyard:
        screen = "graveyard"
    run_tui(initial_screen=screen)


graveyard_app = typer.Typer(help="Inbox-Graveyard ohne TUI")
app.add_typer(graveyard_app, name="graveyard")


def _print_graveyard_entries() -> None:
    from fitness.catalog.agent.inbox_actions import list_inbox_tombstones

    entries = list_inbox_tombstones()
    if not entries:
        console.print("[ok]Graveyard leer.[/ok]")
        return
    for entry in entries:
        console.print(
            f"  {str(entry.get('id') or ''):35}  "
            f"{entry.get('display_name') or entry.get('exercise_id') or ''}  "
            f"[dim]{entry.get('created_at') or ''}[/dim]"
        )


@graveyard_app.command(name="list")
def graveyard_list_cmd():
    """Listet verworfene Inbox-Drafts (Tombstones)"""
    _print_graveyard_entries()


@graveyard_app.command(name="restore")
def graveyard_restore_cmd(
    tombstone_id: Annotated[str, typer.Argument(help="z.B. inbox_wger_206")],
):
    """Stellt einen Graveyard-Eintrag als Inbox-Draft wieder her"""
    from fitness.catalog.agent.inbox_actions import restore_inbox_tombstone

    try:
        restored = restore_inbox_tombstone(tombstone_id)
    except (FileNotFoundError, FileExistsError, ValueError) as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)
    console.print(f"[ok]✓ Restored -> {restored.name}[/ok]")


@graveyard_app.command(name="tui")
def graveyard_tui_cmd():
    """Startet die TUI direkt im Inbox-Graveyard"""
    run_tui(initial_screen="graveyard")


@app.command(name="wger-check")
def command_wger_check():
    """Check wger connectivity and config"""
    report = wger_check()
    print_doctor_report(report)
    if report.has_failures:
        raise typer.Exit(code=1)


@app.command()
def map_wger(
    exercise: Annotated[str, typer.Option(help="Exercise ID or query")],
    write: Annotated[bool, typer.Option(help="Write the best match to wger_mapping.yml")] = False,
):
    """Find or write a wger mapping"""
    try:
        result = run_map_wger(exercise, write=write)
        payload = {
            "exercise_id": result.exercise_id,
            "display_name": result.display_name,
            "wger_enabled": result.wger_enabled,
            "base_url": result.base_url,
            "token_present": result.token_present,
            "matches": [
                {
                    "wger_id": match.wger_id,
                    "name": match.name,
                    "confidence": match.confidence,
                    "matched_on": match.matched_on,
                }
                for match in result.matches
            ],
            "selected_match": (
                {
                    "wger_id": result.selected_match.wger_id,
                    "name": result.selected_match.name,
                    "confidence": result.selected_match.confidence,
                    "matched_on": result.selected_match.matched_on,
                }
                if result.selected_match
                else None
            ),
            "written": result.written,
            "mapping_path": result.mapping_path,
            "warning": result.warning,
        }
        console.print(yaml.safe_dump(payload, sort_keys=False, allow_unicode=True).rstrip())
    except ValueError as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)


@app.command()
def export_exercise(
    exercise: Annotated[str, typer.Option(help="Exercise ID or query")],
    format: Annotated[str, typer.Option(help="Export format")] = "obsidian",
    force: Annotated[bool, typer.Option(help="Overwrite the target file")] = False,
):
    """Export an exercise note to Obsidian"""
    try:
        result = export_exercise_note(exercise, force=force)
        if result.warning:
            console.print(f"[warn]WARN:[/warn] {result.warning}")
        console.print(
            yaml.safe_dump(
                {
                    "format": format,
                    "path": str(result.path),
                    "overwritten": result.overwritten,
                    "used_fallback_name": result.used_fallback_name,
                },
                sort_keys=False,
                allow_unicode=True,
            ).rstrip()
        )
    except ValueError as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)


@app.command()
def export_coverage(
    exercise: Annotated[str, typer.Option(help="Exercise ID or query")],
    sets: Annotated[int, typer.Option(help="Number of sets")],
    rpe: Annotated[int, typer.Option(help="RPE value")],
    format: Annotated[str, typer.Option(help="Export format")] = "obsidian",
    force: Annotated[bool, typer.Option(help="Overwrite the target file")] = False,
):
    """Export a coverage note to Obsidian"""
    try:
        result = export_coverage_note(exercise, sets, rpe, force=force)
        if result.warning:
            console.print(f"[warn]WARN:[/warn] {result.warning}")
        console.print(
            yaml.safe_dump(
                {
                    "format": format,
                    "path": str(result.path),
                    "overwritten": result.overwritten,
                    "used_fallback_name": result.used_fallback_name,
                },
                sort_keys=False,
                allow_unicode=True,
            ).rstrip()
        )
    except ValueError as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)


@app.command()
def preview(
    file: Annotated[str, typer.Option(help="Markdown file to preview")],
):
    """Preview a markdown file"""
    path = Path(file).expanduser()
    if not path.exists():
        console.print(f"[fail]FAIL:[/fail] file not found: {path}")
        raise typer.Exit(code=1)
    result = preview_file(path)
    if result.used_glow:
        console.print(result.message)
    else:
        console.print(path.read_text(encoding="utf-8"), end="")


@app.command(name="export-wger-index")
def export_wger_index(
    show_unmapped: Annotated[bool, typer.Option(help="Show unmapped wger IDs")] = False,
):
    """Build wger_id → catalog_id index (kb/registry/wger_catalog_index.yml)"""
    try:
        index, unmapped = run_export_wger_index()
        console.print(f"[ok]OK[/ok] Wrote wger_catalog_index.yml — {len(index)} mapped exercises")
        if show_unmapped:
            console.print(f"\n[warn]Unmapped wger IDs:[/warn] {len(unmapped)} (in registry, not in catalog)")
            for entry in unmapped[:20]:
                console.print(f"  {entry['wger_id']:>5}  {entry['wger_name']}")
            if len(unmapped) > 20:
                console.print(f"  ... and {len(unmapped) - 20} more")
        else:
            console.print(f"[warn]Unmapped:[/warn] {len(unmapped)} wger IDs without catalog entry (use --show-unmapped to list)")
    except Exception as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)


@app.command()
def watch():
    """Start the AI enricher watcher daemon"""
    try:
        run_watcher()
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)


@app.command(name="import")
def command_import():
    """Bulk import exercises from external sources (wger, yuhonas)"""
    try:
        import_external_exercises()
    except Exception as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)


@app.command(name="reimport")
def command_reimport(
    query: Annotated[str, typer.Argument(help="Name/Query der Uebung, z.B. 'Incline Bench Press'")],
    source: Annotated[str, typer.Option(help="wger | yuhonas | both")] = "both",
):
    """Gezielter Einzel-Reimport einer Uebung aus wger/yuhonas -> kb/inbox/,
    ohne den kompletten Bulk-Import (`import`) zu wiederholen."""
    try:
        written = reimport_exercise(query, source=source)
        if not written:
            console.print(f"[warn]Kein Treffer/nichts geschrieben fuer '{query}'.[/warn]")
            raise typer.Exit(code=1)
        for path in written:
            console.print(f"[ok]OK:[/ok] {path}")
    except Exception as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)


@app.command(name="push")
def firestore_push(
    dry_run: Annotated[bool, typer.Option(help="Do not write to Firestore")] = False,
    force: Annotated[bool, typer.Option(help="Push outside prod context (FITNESS_ENV=prod) anyway")] = False,
):
    """Push local catalog KB → Firestore (default: prod context only, FITNESS_ENV=prod)"""
    try:
        run_kb_sync(dry_run=dry_run, force=force)
    except Exception as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)


@app.command(name="push-changed")
def firestore_push_changed(
    since: Annotated[str, typer.Option(help="Git-Ref (default: HEAD~1)")] = "HEAD~1",
    until: Annotated[str, typer.Option(help="Git-Ref (default: HEAD)")] = "HEAD",
    dry_run: Annotated[bool, typer.Option(help="Do not write to Firestore")] = False,
):
    """Pusht nur die in einem Git-Range geänderten Exercises + Muskel-Taxonomie.

    Quota-schonende Alternative zu `push` für kleine Catalog-Patches. Kein
    FITNESS_ENV=prod-Gate noetig (im Unterschied zu `push`) — beide
    zugrundeliegenden Funktionen sind auf den Git-Diff-Range beschraenkt,
    kein Risiko einen frischeren Firestore-Stand vollstaendig zu ueberschreiben.
    Default: letzter Commit (HEAD~1..HEAD).
    """
    try:
        exercises_result = push_changed_exercises(since_ref=since, until_ref=until, dry_run=dry_run)
        console.print(f"[ok]✓[/ok] exercises: {exercises_result}")
        if not dry_run:
            db = get_db()
            muscles_result = sync_muscles(db, dry_run=dry_run, since_ref=since, until_ref=until)
            console.print(f"[ok]✓[/ok] muscles: {muscles_result}")
    except Exception as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)


@app.command(name="alias-add")
def alias_add(
    exercise_id: Annotated[str, typer.Argument(help="Exercise ID (z.B. 301)")],
    aliases: Annotated[Optional[list[str]], typer.Argument(help="Aliases (optional, sonst Gemini/manuell)")] = None,
):
    """Alias(e) in Exercise-YAML schreiben — Gemini-Vorschlag oder manuelle Eingabe"""
    from fitness.catalog.api.watcher import load_gemini_key

    yml_path = DATA_DIR / "exercises" / f"{exercise_id}.yml"
    if not yml_path.exists():
        console.print(f"[fail]FAIL:[/fail] {yml_path} nicht gefunden")
        raise typer.Exit(code=1)

    data = yaml.safe_load(yml_path.read_text())
    exercises = data.get("exercises") or []
    if not exercises:
        console.print(f"[fail]FAIL:[/fail] Keine exercises-Liste in {yml_path.name}")
        raise typer.Exit(code=1)
    ex = exercises[0]
    existing = ex.get("aliases") or []

    if aliases:
        proposed = aliases
    else:
        from fitness.catalog.agent.gemini import load_gemini_key, suggest_aliases, suggest_aliases_cli
        name = ex.get("german") or exercise_id
        api_key = load_gemini_key()
        proposed = None
        if api_key:
            console.print(f"[info]Gemini:[/info] Schlage Aliases vor für '{name}'...")
            proposed = suggest_aliases(ex, api_key)
        if proposed is None:
            console.print(f"[info]CLI:[/info] Gemini nicht verfügbar — versuche Claude/Codex...")
            proposed = suggest_aliases_cli(ex)
        if proposed:
            console.print(f"  Vorschläge: {proposed}")
            raw = typer.prompt("Übernehmen? [Enter=ja, neue Liste kommagetrennt, 's'=skip]", default="")
            if raw.strip().lower() == "s":
                console.print("Skip.")
                return
            if raw.strip():
                proposed = [a.strip() for a in raw.split(",") if a.strip()]
        else:
            console.print("[warn]WARN:[/warn] Kein AI-Vorschlag verfügbar — manuelle Eingabe")
            proposed = None

        if proposed is None:
            raw = typer.prompt("Aliases (kommagetrennt, 's'=skip)")
            if raw.strip().lower() == "s":
                console.print("Skip.")
                return
            proposed = [a.strip() for a in raw.split(",") if a.strip()]

    backup = yml_path.with_suffix(".yml.bak")
    backup.write_text(yml_path.read_text())

    added = [a for a in proposed if a not in existing]
    ex["aliases"] = existing + added
    yml_path.write_text(yaml.dump(data, allow_unicode=True, sort_keys=False, default_flow_style=False))
    console.print(f"[ok]OK:[/ok] {exercise_id} — aliases: {ex['aliases']}")
    if added:
        console.print(f"  Neu: {added}")



# ─── Inbox (nicht-interaktiv, gleiche Logik wie `tui.py` Inbox-Screen) ──────

inbox_app = typer.Typer(help="Inbox-Review ohne TUI — für Skripte/CI/Automation")
app.add_typer(inbox_app, name="inbox")


@inbox_app.command(name="list")
def inbox_list():
    """Listet alle unreviewten Inbox-Drafts (kb/exercises/inbox_*.yml)"""
    from fitness.catalog.agent.inbox_actions import list_inbox_files

    files = list_inbox_files()
    if not files:
        console.print("[ok]Inbox leer.[/ok]")
        return
    for f in files:
        try:
            doc = yaml.safe_load(f.read_text())
            ex = (doc.get("exercises") or [{}])[0]
            name = ex.get("display_name") or ex.get("german") or ex.get("name") or ""
        except Exception:
            name = "[fail]Ladefehler[/fail]"
        console.print(f"  {f.stem:35}  {name}")


@inbox_app.command(name="show")
def inbox_show(
    file_id: Annotated[str, typer.Argument(help="z.B. inbox_wger_851")],
):
    """Zeigt einen Inbox-Draft vollständig (YAML) an"""
    from fitness.catalog.agent.inbox_actions import load_inbox_entry

    try:
        f, ex = load_inbox_entry(file_id)
    except (FileNotFoundError, ValueError) as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)
    console.print(yaml.dump(ex, allow_unicode=True, sort_keys=False))


@inbox_app.command(name="approve")
def inbox_approve_cmd(
    file_id: Annotated[str, typer.Argument(help="z.B. inbox_wger_851")],
):
    """Approved einen Inbox-Draft -> Expert-Tier ({exercise_id}.yml)"""
    from fitness.catalog.agent.inbox_actions import load_inbox_entry, approve_inbox_entry

    try:
        f, ex = load_inbox_entry(file_id)
        ex_id = approve_inbox_entry(f, ex)
    except (FileNotFoundError, ValueError) as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)
    console.print(f"[ok]✓ Approved -> {ex_id}.yml[/ok]")


@inbox_app.command(name="demote")
def inbox_demote_cmd(
    exercise_id: Annotated[str, typer.Argument(help="z.B. 020 oder wger_1507 (Dateiname ohne .yml)")],
):
    """Schickt eine vermeintliche Expert-Datei (kb/exercises/{id}.yml) zurück
    in die Inbox zum (erneuten) Review. Gegenstück zu `approve` — für Fälle,
    in denen eine Datei nur wegen ihres Speicherorts als 'expert' galt, ohne
    je wirklich approved worden zu sein."""
    from fitness.catalog.agent.inbox_actions import demote_expert_entry

    try:
        inbox_path = demote_expert_entry(exercise_id)
    except FileNotFoundError as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)
    console.print(f"[ok]✓ Demoted -> {inbox_path.name}[/ok]")


@inbox_app.command(name="reenrich")
def inbox_reenrich_cmd(
    file_id: Annotated[str, typer.Argument(help="z.B. inbox_wger_851")],
    feedback: Annotated[Optional[str], typer.Option("--feedback", "-f", help='Freitext-Kritik, z.B. "bequem und Polster passen nicht"')] = None,
    no_haiku: Annotated[bool, typer.Option("--no-haiku", help="Haiku-Gegenpruefung ueberspringen")] = False,
    provider: Annotated[str, typer.Option("--provider", help="gemini|codex|haiku")] = "gemini",
):
    """Jagt einen Inbox-Draft frisch durch Gemini (+ optional Haiku-Review)"""
    from fitness.catalog.agent.inbox_actions import load_inbox_entry, display_name_of, reenrich_inbox_entry

    try:
        f, ex = load_inbox_entry(file_id)
    except (FileNotFoundError, ValueError) as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)

    name = display_name_of(ex, file_id)
    console.print(f"[info]Frage Gemini an fuer '{name}'...[/info]")
    try:
        result = reenrich_inbox_entry(f, ex, name, feedback=feedback, use_haiku_review=not no_haiku, provider=provider)
    except RuntimeError as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)

    if not no_haiku:
        review_provider = result.get("review_provider")
        if review_provider:
            console.print(f"[ok]✓ {str(review_provider).capitalize()}-Review angewendet[/ok]")
        else:
            console.print("[warn]Haiku/Codex-Review nicht verfuegbar — Gemini-Ergebnis behalten[/warn]")
    console.print(f"[ok]✓ Neu angereichert:[/ok] {f.name}")


@inbox_app.command(name="attach-sources")
def inbox_attach_sources_cmd(
    file_id: Annotated[Optional[str], typer.Argument(help="z.B. inbox_wger_206 (leer = alle Drafts)")] = None,
    apply: Annotated[bool, typer.Option("--apply", help="Tatsaechlich schreiben (Default: nur anzeigen)")] = False,
):
    """Sucht zu jedem Inbox-Draft den jeweils fehlenden wger-/yuhonas-Rohdatensatz,
    verlinkt bei einem sicheren Treffer wger_id/yuhonas_id/external_ids auf
    oberster Ebene und legt den Rohdatensatz UNVERAENDERT unter
    origin.wger/origin.yuhonas ab — keine Feld-Verschmelzung
    (primary_muscles/coaching_notes etc. bleiben unangetastet). Unsichere
    Treffer (Score zwischen CANDIDATE_MIN_SCORE und AUTO_MATCH_MIN_SCORE)
    werden NIE automatisch verlinkt, nur als Kandidat angezeigt. Dry-run per
    Default, --apply zum tatsaechlichen Schreiben."""
    from fitness.catalog.agent.inbox_actions import list_inbox_files, load_inbox_entry, display_name_of, attach_source_snapshot

    targets = [file_id] if file_id else [f.stem for f in list_inbox_files()]
    if not targets:
        console.print("[ok]Inbox leer.[/ok]")
        return

    any_found = False
    for target in targets:
        try:
            f, ex = load_inbox_entry(target)
        except (FileNotFoundError, ValueError) as exc:
            console.print(f"[fail]FAIL:[/fail] {target}: {exc}")
            continue
        name = display_name_of(ex, target)
        result = attach_source_snapshot(f, ex, apply=apply)
        found = result["found"]
        newly = [k for k, v in found.items() if v]
        if newly:
            any_found = True
            if apply and result["changed"]:
                verb = "geschrieben"
            elif apply:
                verb = "bereits vorhanden"
            else:
                verb = "gefunden (dry-run)"
            console.print(f"[ok]✓ {f.stem}[/ok] ({name}): {', '.join(newly)} {verb}")
        else:
            console.print(f"[dim]– {f.stem}[/dim] ({name}): keine zusätzliche Quelle gefunden")

        for source_key, cand in result.get("candidates", {}).items():
            if cand:
                console.print(
                    f"    [warn]? Kandidat ({source_key}): {cand['id']} — Score {cand['score']:.0f}, "
                    f"zu unsicher fuer Automatik, manuell pruefen[/warn]"
                )

    if not any_found:
        console.print("[ok]Keine zusätzlichen Quellen-Treffer.[/ok]")
    elif not apply:
        console.print("[info]Dry-run — mit --apply tatsächlich schreiben.[/info]")


@inbox_app.command(name="dedupe")
def inbox_dedupe_cmd(
    yes: Annotated[bool, typer.Option("--yes", "-y", help="Alle Gruppen ohne Rückfrage zusammenführen")] = False,
):
    """Findet doppelte Firestore-Inbox-Drafts (gleicher Übungsname, mehrere
    Docs) und fragt pro Gruppe 'Zusammenführen?' — wie beim Kontakte-Merge
    am Smartphone. Behält den vollständigsten Draft, mergt Listen-Felder
    (coaching_notes/instructions/...) aus den anderen rein, markiert die
    übrigen als 'merged_duplicate' (kein Hard-Delete, reversibel)."""
    from fitness.catalog.agent.inbox_dedup import find_duplicate_groups, plan_merge, apply_merge

    groups = find_duplicate_groups()
    if not groups:
        console.print("[ok]Keine Duplikate gefunden.[/ok]")
        return

    console.print(f"[info]{len(groups)} Duplikat-Gruppe(n) gefunden.[/info]\n")
    merged_count = 0
    for group in groups:
        plan = plan_merge(group)
        survivor = plan["survivor"]
        losers = plan["losers"]
        name = survivor.get("display_name") or survivor.get("name") or "?"

        console.print(f"[bold]{name}[/bold] ({len(group)}x)")
        console.print(f"  behalten:  {survivor['_uid']}/{survivor['_doc_id']}  status={survivor.get('status')}")
        for loser in losers:
            console.print(f"  mergen:    {loser['_uid']}/{loser['_doc_id']}  status={loser.get('status')}")

        if yes or typer.confirm("  Zusammenführen?", default=True):
            apply_merge(plan)
            merged_count += 1
            console.print("  [ok]✓ zusammengeführt[/ok]\n")
        else:
            console.print("  [dim]übersprungen[/dim]\n")

    console.print(f"[ok]Fertig: {merged_count}/{len(groups)} Gruppen zusammengeführt.[/ok]")


@app.command(name="batch-reenrich")
def batch_reenrich_cmd(
    scope: Annotated[str, typer.Option("--scope", help="inbox|approved|both")] = "both",
    provider: Annotated[str, typer.Option("--provider", help="gemini|codex|haiku")] = "codex",
    review_mode: Annotated[str, typer.Option("--review-mode", help="none|haiku|codex|auto")] = "codex",
    feedback: Annotated[Optional[str], typer.Option("--feedback", "-f", help="Optionales globales Coach-Feedback")] = None,
):
    """Batch-Re-Enrichment fuer Inbox-Drafts und/oder freigegebene Detaildateien."""
    from fitness.catalog.agent.inbox_actions import (
        list_inbox_files,
        load_inbox_entry,
        display_name_of,
        reenrich_inbox_entry,
        list_approved_exercise_files,
        reenrich_approved_entry,
    )

    selected_scope = str(scope or "both").strip().lower()
    todo_inbox = selected_scope in {"inbox", "both"}
    todo_approved = selected_scope in {"approved", "both"}
    if not (todo_inbox or todo_approved):
        console.print(f"[fail]FAIL:[/fail] Ungueltiger scope: {scope}")
        raise typer.Exit(code=1)

    failures: list[str] = []
    changed = 0

    if todo_inbox:
        files = list_inbox_files()
        console.print(f"[info]Inbox-Drafts:[/info] {len(files)}")
        for f in files:
            try:
                _f, ex = load_inbox_entry(f.stem)
                name = display_name_of(ex, f.stem)
                reenrich_inbox_entry(_f, ex, name, feedback=feedback, use_haiku_review=(review_mode == "auto"), provider=provider)
                changed += 1
                console.print(f"[ok]Inbox reenriched:[/ok] {f.name}")
            except Exception as exc:
                failures.append(f"{f.name}: {exc}")
                console.print(f"[fail]Inbox failed:[/fail] {f.name} -> {exc}")

    if todo_approved:
        files = list_approved_exercise_files()
        console.print(f"[info]Approved detail files:[/info] {len(files)}")
        for f in files:
            try:
                doc = yaml.safe_load(f.read_text()) or {}
                ex = (doc.get("exercises") or [{}])[0]
                name = display_name_of(ex, f.stem)
                reenrich_approved_entry(f, ex, name, feedback=feedback, provider=provider, review_mode=review_mode)
                changed += 1
                console.print(f"[ok]Approved reenriched:[/ok] {f.name}")
            except Exception as exc:
                failures.append(f"{f.name}: {exc}")
                console.print(f"[fail]Approved failed:[/fail] {f.name} -> {exc}")

    try:
        from fitness.catalog.agent.inbox_actions import _rebuild_runtime_catalog
        _rebuild_runtime_catalog()
    except Exception as exc:
        failures.append(f"catalog rebuild: {exc}")

    if failures:
        console.print(Panel("\n".join(failures[:20]), title=f"Batch-Reenrich mit Fehlern ({len(failures)})", border_style="red"))
        raise typer.Exit(code=1)

    console.print(f"[ok]✓ Batch-Reenrich abgeschlossen:[/ok] {changed} Dateien")


@inbox_app.command(name="delete")
def inbox_delete_cmd(
    file_id: Annotated[str, typer.Argument(help="z.B. inbox_wger_851")],
    yes: Annotated[bool, typer.Option("--yes", "-y", help="Ohne Rückfrage löschen")] = False,
):
    """Löscht einen Inbox-Draft"""
    from fitness.catalog.agent.inbox_actions import load_inbox_entry, delete_inbox_entry

    try:
        f, ex = load_inbox_entry(file_id)
    except (FileNotFoundError, ValueError) as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)

    if not yes and not typer.confirm(f"Wirklich löschen: {f.name}?"):
        console.print("Abgebrochen.")
        return
    delete_inbox_entry(f, ex)
    console.print(f"[ok]✓ Gelöscht:[/ok] {f.name}")


@inbox_app.command(name="graveyard")
def inbox_graveyard_cmd():
    """Listet verworfene Inbox-Drafts (Tombstones)"""
    _print_graveyard_entries()


@inbox_app.command(name="restore")
def inbox_restore_cmd(
    tombstone_id: Annotated[str, typer.Argument(help="z.B. inbox_wger_206")],
):
    """Stellt einen Graveyard-Eintrag als Inbox-Draft wieder her"""
    from fitness.catalog.agent.inbox_actions import restore_inbox_tombstone

    try:
        restored = restore_inbox_tombstone(tombstone_id)
    except (FileNotFoundError, FileExistsError, ValueError) as exc:
        console.print(f"[fail]FAIL:[/fail] {exc}")
        raise typer.Exit(code=1)
    console.print(f"[ok]✓ Restored -> {restored.name}[/ok]")


def main():
    app()


if __name__ == "__main__":
    main()
