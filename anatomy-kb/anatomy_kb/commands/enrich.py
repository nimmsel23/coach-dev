"""enrich command — Ursprung & Ansatz via Gemini → muscles/*.yml"""
from pathlib import Path

import yaml
import typer
from rich.panel import Panel
from rich.rule import Rule

from anatomy_kb.commands._helpers import console, load_exercise, _gum_log, ANATOMY_TEACHING_DIR
from anatomy_kb import gemini as _gemini, display as _display, muscle_store as _store

_load_gemini_env = _gemini.load_env
_ENRICH_PROMPT = _gemini.ENRICH_PROMPT


def command(
    exercise_id: str = typer.Argument(..., help="Exercise-ID (z.B. bench_press, pull_up)"),
    dry_run: bool = typer.Option(False, "--dry-run", "-n", help="Nur anzeigen, nicht schreiben"),
    force: bool = typer.Option(False, "--force", "-f", help="Bestehende Muscle-Daten überschreiben"),
):
    """
    [bold]Ursprung & Ansatz via Gemini → muscles/*.yml[/bold]

    Ruft Gemini auf und schreibt für jeden beteiligten Muskel:
    Ursprung, Ansatz, Innervation, Funktion in diese Übung.
    Jeder Muskel bekommt eine eigene Datei (muscles/{muscle_id}.yml),
    gematcht gegen die wger Muscle-IDs im muscle-index.json.

    \b
    Beispiele:
      anatomy-agent enrich bench_press
      anatomy-agent enrich pull_up --dry-run
      anatomy-agent enrich squat --force
    """
    api_key, model = _load_gemini_env()
    if not api_key:
        _gum_log("error", "GEMINI_API_KEY nicht gefunden in ~/.env/gemini.env")
        raise typer.Exit(1)

    ex = load_exercise(exercise_id)
    raw = ex.raw

    existing = _store.muscles_for_exercise(exercise_id)
    if existing and not force:
        _gum_log("warn", f"Muskeln bereits vorhanden für {exercise_id}: {existing} — nutze --force")
        raise typer.Exit(0)

    def _flatten(val) -> list[str]:
        if isinstance(val, list):
            return [str(v) for v in val]
        if isinstance(val, dict):
            out = []
            for v in val.values():
                out.extend(_flatten(v))
            return out
        return [str(val)] if val else []

    roles = raw.get("muscle_roles", {})
    primary = _flatten(roles.get("primary", []))
    secondary = _flatten(roles.get("secondary", []))
    stabilizers = _flatten(roles.get("stabilizers", []))

    prompt = _ENRICH_PROMPT.format(
        name=ex.name,
        category=ex.category,
        movement_pattern=ex.movement_pattern,
        primary=", ".join(primary) or "—",
        secondary=", ".join(secondary) or "—",
        stabilizers=", ".join(stabilizers) or "—",
    )

    console.print()
    console.print(Panel.fit(
        f"[bold white]{ex.name}[/bold white]\n[dim]Gemini [{model}] generiert Ursprung & Ansatz...[/dim]",
        title="[cyan]anatomy enrich[/cyan]",
        border_style="cyan",
    ))
    console.print()

    with console.status("[dim]Gemini antwortet...[/dim]"):
        try:
            response_text = _gemini.call_with_fallback(
                prompt, api_key, model,
                on_fallback=lambda m: _gum_log("warn", f"Fallback auf {m}"),
            )
        except Exception as e:
            _gum_log("error", f"Gemini-Fehler: {type(e).__name__}: {str(e)[:120]}")
            raise typer.Exit(1)

    if response_text is None:
        _gum_log("error", "Alle Gemini-Modelle nicht verfügbar")
        raise typer.Exit(1)

    yaml_str = _gemini.extract_yaml_block(response_text)
    try:
        parsed = yaml.safe_load(yaml_str)
    except yaml.YAMLError as e:
        _gum_log("error", f"YAML-Parse-Fehler: {e}")
        console.print(Panel(yaml_str[:800], title="Rohantwort", border_style="red"))
        raise typer.Exit(1)

    muscle_anatomy = parsed.get("muscle_anatomy", {}) if isinstance(parsed, dict) else {}
    if not muscle_anatomy:
        _gum_log("error", "Kein muscle_anatomy-Block in der Antwort")
        console.print(Panel(yaml_str[:500], title="Rohantwort", border_style="red"))
        raise typer.Exit(1)

    _display.show_muscle_anatomy(muscle_anatomy)

    # Zeige welche Muscle-IDs gematcht werden
    index = _store.load_index()
    matched, unmatched = [], []
    for mid in muscle_anatomy:
        canonical = _store.canonical_id(mid)
        (matched if canonical else unmatched).append((mid, canonical))

    if unmatched:
        _gum_log("warn", f"Kein wger-Match für: {[m for m, _ in unmatched]}")
    console.print(f"  [dim]Gematchte Muskeln: {[c for _, c in matched if c]}[/dim]")

    if dry_run:
        console.print("[dim]  dry-run: nichts gespeichert.[/dim]")
        return

    console.print(Rule(style="dim"))
    confirmed = typer.confirm(f"  Anatomy für [{exercise_id}] in muscles/*.yml speichern?", default=False)
    if not confirmed:
        console.print("[dim]  Abgebrochen.[/dim]")
        raise typer.Exit(0)

    saved, skipped = [], []
    for raw_id, anatomy_data in muscle_anatomy.items():
        canonical = _store.canonical_id(raw_id)
        if canonical is None:
            skipped.append(raw_id)
            continue
        path, created = _store.update_muscle(canonical, anatomy_data, exercise_id, force=force)
        saved.append(canonical)
        verb = "angelegt" if created else "aktualisiert"
        _gum_log("info", f"muscles/{canonical}.yml {verb}")

    if skipped:
        _gum_log("warn", f"Übersprungen (kein wger-Match): {skipped}")
    _gum_log("info", f"{len(saved)} Muskeln gespeichert, {len(skipped)} übersprungen")

    # muscle_anatomy in anatomy_teaching einbetten
    teaching_file = _store.push_to_teaching(exercise_id, ANATOMY_TEACHING_DIR)
    if teaching_file:
        _gum_log("info", f"anatomy_teaching/{teaching_file.name} aktualisiert")
    
    _gum_log("info", "Sync-Tipp: 'anatomy-agent firestore sync' um Änderungen zu Firestore zu pushen.")
