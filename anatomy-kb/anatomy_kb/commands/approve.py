"""approve command — Hebe eine Übung von Bulk/Inbox in den Expert-Tier."""
from __future__ import annotations

from pathlib import Path
import yaml
import typer
from rich.panel import Panel

from ._helpers import console, _gum_log, CATALOG_EXERCISES

def command(
    exercise_id: str = typer.Argument(..., help="ID der zu veredelnden Übung"),
    notes: str = typer.Option("", "--notes", "-m", help="Coaching Notes hinzufügen"),
):
    """
    [bold]Veredelungs-Workflow — Bulk/Inbox → Expert[/bold]

    Hebt eine Übung aus dem Wiki-Layer (unreviewed) oder der Inbox in den Expert-Tier.
    Dabei wird das 'unreviewed'-Tag entfernt und die Übung in das passende
    Kategorie-File (z.B. chest.yml) verschoben.

    \b
    Schritte:
    1. Suche Übung in unreviewed_*.yml oder inbox_*.yml
    2. Entferne 'unreviewed: true'
    3. Füge Coaching Notes hinzu
    4. Verschiebe in Expert-YAML (arms, back, chest, core, legs, shoulders)
    """
    
    # 1. Übung finden
    source_file = None
    exercise_data = None
    
    all_ymls = list(CATALOG_EXERCISES.glob("*.yml"))
    bulk_inbox = [f for f in all_ymls if f.name.startswith(("unreviewed_", "inbox_"))]
    
    for yml in bulk_inbox:
        try:
            doc = yaml.safe_load(yml.read_text(encoding="utf-8"))
            if not isinstance(doc, dict) or "exercises" not in doc:
                continue
            
            for i, ex in enumerate(doc["exercises"]):
                if ex.get("exercise_id") == exercise_id or ex.get("id") == exercise_id:
                    exercise_data = ex
                    source_file = yml
                    # Aus Liste entfernen
                    doc["exercises"].pop(i)
                    # Zurückschreiben wird erst am Ende gemacht
                    temp_doc = doc
                    break
            if exercise_data:
                break
        except Exception as e:
            _gum_log("error", f"Fehler beim Lesen von {yml.name}: {e}")
            continue

    if not exercise_data:
        _gum_log("error", f"Übung '{exercise_id}' nicht in Bulk oder Inbox gefunden.")
        raise typer.Exit(1)

    # 2. Veredeln
    if "unreviewed" in exercise_data:
        del exercise_data["unreviewed"]
    
    if notes:
        existing_notes = exercise_data.get("coaching_notes") or []
        if isinstance(existing_notes, str):
            existing_notes = [existing_notes]
        if notes not in existing_notes:
            existing_notes.append(notes)
        exercise_data["coaching_notes"] = existing_notes

    # 3. Ziel-File bestimmen
    category = exercise_data.get("category", "other")
    target_file = CATALOG_EXERCISES / f"{category}.yml"
    
    # Spezialmapping für bekannte Expert-Files
    expert_mapping = {
        "arms": "arms.yml",
        "back": "back.yml",
        "chest": "chest.yml",
        "core": "core.yml",
        "legs": "legs.yml",
        "shoulders": "shoulders.yml"
    }
    if category in expert_mapping:
        target_file = CATALOG_EXERCISES / expert_mapping[category]

    # 4. In Expert-Tier einfügen
    try:
        if target_file.exists():
            target_doc = yaml.safe_load(target_file.read_text(encoding="utf-8"))
            if not isinstance(target_doc, dict):
                target_doc = {"exercises": []}
            if "exercises" not in target_doc:
                target_doc["exercises"] = []
        else:
            target_doc = {"exercises": []}
        
        # Prüfen ob bereits vorhanden (Doublette im Expert Tier verhindern)
        for ex in target_doc["exercises"]:
            if (ex.get("exercise_id") or ex.get("id")) == exercise_id:
                _gum_log("warn", f"Übung '{exercise_id}' existiert bereits in {target_file.name}. Daten werden gemergt.")
                ex.update(exercise_data)
                break
        else:
            target_doc["exercises"].append(exercise_data)
            # Sortieren nach ID für Ordnung
            target_doc["exercises"].sort(key=lambda x: (x.get("exercise_id") or x.get("id") or ""))

        # 5. Speichern
        # Source-File aktualisieren (ohne die verschobene Übung)
        if source_file.name.startswith("inbox_") and not temp_doc["exercises"]:
            # Leere Inbox-Files löschen
            source_file.unlink()
            _gum_log("info", f"Leeres Inbox-File gelöscht: {source_file.name}")
        else:
            source_file.write_text(yaml.dump(temp_doc, allow_unicode=True, sort_keys=False), encoding="utf-8")
            _gum_log("info", f"Übung aus {source_file.name} entfernt.")

        # Target-File aktualisieren
        target_file.write_text(yaml.dump(target_doc, allow_unicode=True, sort_keys=False), encoding="utf-8")
        _gum_log("info", f"Übung nach {target_file.name} verschoben und veredelt.")

        # 6. Lokale DB synchronisieren für sofortige Verfügbarkeit
        try:
            from anatomy_kb import db as _db
            conn = _db.connect()
            _db.sync_exercises(conn)
            _gum_log("info", "Lokale Datenbank aktualisiert.")
        except Exception as db_err:
            _gum_log("warn", f"DB-Sync nach Approval fehlgeschlagen: {db_err}")

        console.print(Panel(
            f"[bold green]Erfolg![/bold green]\n"
            f"Übung: [white]{exercise_id}[/white]\n"
            f"Status: [cyan]Expert Tier[/cyan]\n"
            f"Kategorie: {category}",
            title="Approval Workflow",
            border_style="green"
        ))

    except Exception as e:
        _gum_log("error", f"Fehler beim Speichern: {e}")
        raise typer.Exit(1)
