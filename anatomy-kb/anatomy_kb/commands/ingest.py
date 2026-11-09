"""ingest command — Vault MD → Gemini → YAML."""
import re
from pathlib import Path

import yaml
import typer
from rich.panel import Panel
from rich.rule import Rule

from anatomy_kb.commands._helpers import (
    EXERCISES_DIR, ANATOMY_TEACHING_DIR, console, init_loader, _gum_log,
)
from anatomy_kb import loader, gemini as _gemini, vault as _vault
from anatomy_kb import display as _display, muscle_store as _store
from anatomy_kb.models import Exercise

_load_gemini_env = _gemini.load_env
_extract_yaml_block = _gemini.extract_yaml_block
_INGEST_PROMPT = _gemini.INGEST_PROMPT

VAULT_ROOT = _vault.VAULT_ROOT
_strip_wikilinks = _vault.strip_wikilinks
_extract_vault_tags = _vault.extract_tags
_find_vault_file = _vault.find_file


def command(
    vault_query: str = typer.Argument(..., help="Dateiname, Suchbegriff oder Pfad zur Vault-MD"),
    exercise_id: str = typer.Option("", "--exercise", "-e", help="Ziel-Exercise-ID (Standard: aus Dateiname)"),
    dry_run: bool = typer.Option(False, "--dry-run", "-n", help="Nur anzeigen, nicht schreiben"),
    force: bool = typer.Option(False, "--force", "-f", help="Bestehende Daten überschreiben"),
):
    """
    [bold]Vault-Notiz → YAML via Gemini[/bold]

    Liest eine Markdown-Notiz aus deinem Vitaltrainer-Vault,
    schickt sie an Gemini und extrahiert strukturierte Anatomiedaten:

    \b
    - muscle_anatomy (Ursprung, Ansatz, Innervation, Funktion)
    - common_errors_explained (anatomisch begründet)

    Deine eigenen Ausbildungsnotizen als Quelle — kein reines Halluzinieren.
    Du musst die Ausgabe bestätigen bevor sie gespeichert wird.

    \b
    Vault-Root: $ANATOMY_KB_VAULT oder ~/Dokumente/Vitaltrainer/.../Übungen/

    \b
    Beispiele:
      anatomy-agent ingest Klimmzug
      anatomy-agent ingest "Vorgebeugtes Rudern" --exercise barbell_row
      anatomy-agent ingest /absoluter/pfad/zur/datei.md
      anatomy-agent ingest "Romanian Deadlift" --dry-run
    """
    api_key, model = _load_gemini_env()
    if not api_key:
        _gum_log("error", "GEMINI_API_KEY nicht gefunden in ~/.env/gemini.env")
        raise typer.Exit(1)

    vault_path = Path(vault_query)
    if not vault_path.exists():
        vault_path = VAULT_ROOT / vault_query if (VAULT_ROOT / vault_query).exists() else None
    if vault_path is None or not vault_path.exists():
        vault_path = _find_vault_file(vault_query)
    if vault_path is None or not vault_path.exists():
        _gum_log("error", f"Vault-Datei nicht gefunden: {vault_query}")
        _gum_log("info", f"Vault-Root: {VAULT_ROOT}")
        raise typer.Exit(1)

    for _enc in ("utf-8", "latin-1", "cp1252"):
        try:
            raw_content = vault_path.read_text(encoding=_enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raw_content = vault_path.read_bytes().decode("utf-8", errors="replace")
    note_content = _strip_wikilinks(raw_content)
    note_name = vault_path.stem
    vault_tags = _extract_vault_tags(raw_content)

    if not exercise_id:
        exercise_id = note_name.lower().replace(" ", "_").replace("-", "_")
        exercise_id = re.sub(r"[^a-z0-9_]", "", exercise_id)

    init_loader()
    ex_data = loader.load_one(exercise_id)
    if ex_data is None:
        _gum_log("warn", f"Exercise '{exercise_id}' nicht im lokalen exercises/ Cache — Notiz wird trotzdem verarbeitet")
        ex_name = note_name
    else:
        ex = Exercise.from_dict(ex_data)
        ex_name = ex.name
        if ex_data.get("muscle_anatomy") and not force:
            _gum_log("warn", f"muscle_anatomy existiert bereits für {exercise_id} — nutze --force")
            raise typer.Exit(0)

    prompt = _INGEST_PROMPT.format(name=ex_name, note_content=note_content[:6000])

    console.print()
    console.print(Panel.fit(
        f"[bold white]{ex_name}[/bold white]  [dim]← {vault_path.name}[/dim]\n"
        f"[dim]Gemini [{model}] extrahiert Anatomiedaten...[/dim]",
        title="[cyan]anatomy ingest[/cyan]",
        border_style="cyan",
    ))
    console.print()

    with console.status("[dim]Gemini analysiert deine Notiz...[/dim]"):
        try:
            response_text = _gemini.call_with_fallback(
                prompt, api_key, model,
                on_fallback=lambda m: _gum_log("warn", f"Fallback auf {m}"),
            )
        except Exception as e:
            _gum_log("error", f"Gemini-Fehler: {type(e).__name__}: {str(e)[:120]}")
            raise typer.Exit(1)

    if response_text is None:
        _gum_log("error", "Alle Gemini-Modelle nicht verfügbar — später nochmal versuchen")
        raise typer.Exit(1)

    yaml_str = _extract_yaml_block(response_text)
    try:
        parsed = yaml.safe_load(yaml_str)
    except yaml.YAMLError as e:
        _gum_log("error", f"YAML-Parse-Fehler: {e}")
        console.print(Panel(yaml_str[:1000], title="Rohantwort", border_style="red"))
        raise typer.Exit(1)

    if not isinstance(parsed, dict):
        _gum_log("error", "Unerwartetes Antwortformat von Gemini")
        raise typer.Exit(1)

    muscle_anatomy = parsed.get("muscle_anatomy") or {}
    errors = parsed.get("common_errors_explained") or {}

    _display.show_muscle_anatomy(muscle_anatomy)
    _display.show_common_errors(errors)
    _display.show_vault_tags(vault_tags)

    if not muscle_anatomy and not errors:
        _gum_log("warn", "Gemini hat keine verwertbaren Daten extrahiert")
        console.print(Panel(yaml_str[:500], title="Rohantwort", border_style="yellow"))
        raise typer.Exit(1)

    if dry_run:
        console.print("[dim]  dry-run: nichts gespeichert.[/dim]")
        return

    console.print(Rule(style="dim"))
    confirmed = typer.confirm(
        f"  Anatomy für [{exercise_id}] speichern?",
        default=False,
    )
    if not confirmed:
        console.print("[dim]  Abgebrochen.[/dim]")
        raise typer.Exit(0)

    saved_fields = []

    # muscle_anatomy → muscles/*.yml (gematcht gegen wger muscle-index)
    if muscle_anatomy:
        saved_muscles, skipped_muscles = [], []
        for raw_id, anatomy_data in muscle_anatomy.items():
            canonical = _store.canonical_id(raw_id)
            if canonical is None:
                skipped_muscles.append(raw_id)
                continue
            _store.update_muscle(canonical, anatomy_data, exercise_id, force=force)
            saved_muscles.append(canonical)
        _gum_log("info", f"muscles/: {len(saved_muscles)} gespeichert{f', {len(skipped_muscles)} übersprungen: {skipped_muscles}' if skipped_muscles else ''}")
        saved_fields.append("muscle_anatomy")

    # muscle_anatomy in anatomy_teaching einbetten + common_errors als extra
    extra: dict = {}
    if errors:
        extra["common_errors_explained"] = errors
        saved_fields.append("common_errors_explained")
    if vault_tags:
        extra["vault_tags"] = vault_tags

    teaching_file = _store.push_to_teaching(exercise_id, ANATOMY_TEACHING_DIR, extra=extra or None)
    if teaching_file:
        _gum_log("info", f"anatomy_teaching/{teaching_file.name} aktualisiert")

    if vault_tags:
        saved_fields.append("vault_tags")

    try:
        _vault.update_frontmatter(vault_path, exercise_id, saved_fields)
        _gum_log("info", f"Frontmatter aktualisiert → {vault_path.name}")
    except Exception as e:
        _gum_log("warn", f"Frontmatter-Update fehlgeschlagen: {e}")

    _gum_log("info", "Sync-Tipp: 'anatomy-agent firestore sync' um Änderungen zu Firestore zu pushen.")
