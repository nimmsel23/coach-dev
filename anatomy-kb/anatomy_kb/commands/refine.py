"""refine command — Autonomous Demand-Driven Refinement."""
from __future__ import annotations

from pathlib import Path
import yaml
import typer
from rich.panel import Panel

from ._helpers import console, _gum_log, CATALOG_EXERCISES, ANATOMY_TEACHING_DIR
from anatomy_kb import db as _db, gemini as _gemini, muscle_store as _store

def command(
    limit: int = typer.Option(3, "--limit", "-l", help="Anzahl der zu veredelnden Übungen"),
    dry_run: bool = typer.Option(False, "--dry-run", "-n", help="Nur analysieren, nichts generieren"),
):
    """
    [bold]Autonomous Refinement — Demand-Driven Analysis[/bold]

    Analysiert die Trainingshistorie, identifiziert häufig genutzte aber
    unreviewed Übungen und erstellt proaktiv Expert-Drafts in der Inbox.

    \b
    Schritte:
    1. Trainingsdaten synchronisieren
    2. Meistgenutzte unreviewed Übungen finden
    3. Gemini-Entwürfe (inbox_*.yml) für die Top-Kandidaten erstellen
    """
    with console.status("[dim]Analysiere Trainingsbedarf...[/dim]"):
        try:
            conn = _db.connect()
            _db.sync_training(conn)
            _db.sync_exercises(conn) # Ensure unreviewed status is fresh
            
            # Finde Top X unreviewed Übungen
            sql = """
                SELECT e.exercise_id, e.name, COUNT(*) as usage_count
                FROM training_sessions ts
                JOIN exercises e ON ts.exercise_id = e.exercise_id
                WHERE e.unreviewed = 1
                GROUP BY e.exercise_id
                ORDER BY usage_count DESC
                LIMIT ?
            """
            candidates = _db.query(sql, (limit,))
        except Exception as e:
            _gum_log("error", f"Analyse fehlgeschlagen: {e}")
            raise typer.Exit(1)

    if not candidates:
        _gum_log("info", "Keine unreviewed Übungen mit Trainingsdaten gefunden.")
        return

    _gum_log("info", f"{len(candidates)} Veredelungs-Kandidaten identifiziert.")
    
    for cand in candidates:
        ex_id = cand["exercise_id"]
        name = cand["name"]
        count = cand["usage_count"]
        
        inbox_file = CATALOG_EXERCISES / f"inbox_{ex_id}.yml"
        if inbox_file.exists():
            _gum_log("info", f"Überspringe '{ex_id}': Draft existiert bereits.")
            continue
            
        console.print(f"  [cyan]➜[/cyan] [bold]{name}[/bold] ({ex_id}) — {count} Sessions")
        
        if dry_run:
            continue

        # Gemini Draft generieren
        with console.status(f"[dim]Gemini erstellt Expert-Draft für {ex_id}...[/dim]"):
            try:
                # Wir nutzen die enrich-Logik, da wir oft keine Vault-Notiz für Bulk-Daten haben
                # Aber wir simulieren eine Übung für den Prompt
                ex_data = _db.query("SELECT * FROM exercises WHERE exercise_id = ?", (ex_id,))[0]
                
                # Rollen aus der DB holen
                m_rows = _db.query("SELECT muscle_id, role FROM exercise_muscles WHERE exercise_id = ?", (ex_id,))
                primary = [r["muscle_id"] for r in m_rows if r["role"] == "primary"]
                secondary = [r["muscle_id"] for r in m_rows if r["role"] == "secondary"]
                stabilizers = [r["muscle_id"] for r in m_rows if r["role"] == "stabilizer"]

                api_key, model = _gemini.load_env()
                prompt = _gemini.ENRICH_PROMPT.format(
                    name=name,
                    category=ex_data.get("category", "other"),
                    movement_pattern=ex_data.get("movement_pattern", "other"),
                    primary=", ".join(primary) or "—",
                    secondary=", ".join(secondary) or "—",
                    stabilizers=", ".join(stabilizers) or "—",
                )
                
                response_text = _gemini.call_with_fallback(prompt, api_key, model)
                if not response_text:
                    _gum_log("error", f"Gemini-Fehler bei {ex_id}")
                    continue
                    
                yaml_str = _gemini.extract_yaml_block(response_text)
                parsed = yaml.safe_load(yaml_str)
                
                # Draft-Struktur für Catalog
                draft = {
                    "exercises": [
                        {
                            "id": ex_id,
                            "name": name,
                            "display_name": ex_data.get("display_name"),
                            "category": ex_data.get("category"),
                            "movement_pattern": ex_data.get("movement_pattern"),
                            "unreviewed": True, # Bleibt unreviewed bis zum finalen approve
                            "coaching_notes": ["Auto-generated expert draft based on usage demand."],
                            "common_errors_explained": parsed.get("common_errors_explained", {})
                        }
                    ]
                }
                
                inbox_file.write_text(yaml.dump(draft, allow_unicode=True, sort_keys=False), encoding="utf-8")
                _gum_log("info", f"Draft gespeichert: {inbox_file.name}")
                
                # Optional: Auch Muskel-Daten in muscles/ aktualisieren
                muscle_anatomy = parsed.get("muscle_anatomy", {})
                for raw_mid, anatomy in muscle_anatomy.items():
                    canonical = _store.canonical_id(raw_mid)
                    if canonical:
                        _store.update_muscle(canonical, anatomy, ex_id, force=False)

            except Exception as e:
                _gum_log("error", f"Veredelung von {ex_id} fehlgeschlagen: {e}")

    _gum_log("info", "Refinement-Zyklus abgeschlossen.")
