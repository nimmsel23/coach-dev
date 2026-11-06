#!/usr/bin/env python3
"""
Build fitness workout catalog from fitness-agent YAML sources.
Exports to ~/.aos/fitness/workouts/catalog.json
"""

import json
import time
from pathlib import Path
from typing import Optional

import yaml
import typer
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler


app = typer.Typer(help="Build fitness workout catalog from YAML sources")
console = Console()


class CatalogHandler(FileSystemEventHandler):
    def __init__(self, source_dir: Path, output_file: Path):
        self.source_dir = source_dir
        self.output_file = output_file
        self.last_run = 0

    def on_modified(self, event):
        if not event.is_directory and event.src_path.endswith(".yml"):
            # Debounce
            now = time.time()
            if now - self.last_run < 2:
                return
            self.last_run = now
            console.print(f"[dim]Change detected in {Path(event.src_path).name}, rebuilding...[/dim]")
            run_build(self.source_dir, self.output_file)


def run_build(source_dir: Path, output_file: Path):
    if not source_dir.exists():
        console.print(f"[bold red]✗ Error:[/bold red] source directory not found: {source_dir}")
        return False

    catalog = {
        "version": "0.1.0",
        "generated_from": "fitness-agent YAML",
        "exercises": []
    }

    # Tracking for summary
    stats = {
        "files_processed": 0,
        "exercises_added": 0,
        "errors": 0
    }

    # Load all YAML files from exercises/
    for yml_file in sorted(source_dir.glob("*.yml")):
        stats["files_processed"] += 1
        try:
            with open(yml_file, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)

            if not data or "exercises" not in data:
                continue

            for ex in data["exercises"]:
                catalog["exercises"].append({
                    "id": ex.get("exercise_id") or ex.get("id"),
                    "name": ex.get("name") or ex.get("display_name"),
                    "name_de": ex.get("display_name") or ex.get("german"),
                    "category": ex.get("category"),
                    "type": ex.get("type"),  # compound, isolation
                    "movement_pattern": ex.get("movement_pattern"),
                    "equipment": ex.get("equipment") or [],
                    "primary_muscles": ex.get("primary_muscles") or [],
                    "secondary_muscles": ex.get("secondary_muscles") or [],
                    "stabilizers": ex.get("stabilizers") or [],
                    "variations": ex.get("variations") or [],
                    "aliases": ex.get("aliases") or [],
                    "coaching_notes": ex.get("coaching_notes") or [],
                    "common_errors": ex.get("common_errors") or [],
                    "tags": ex.get("tags") or [],
                    "wger_id": ex.get("wger_id"),  # if available
                    "yuhonas_id": ex.get("yuhonas_id") or ((ex.get("external_ids") or {}).get("yuhonas") or [None])[0],
                    "difficulty": ex.get("difficulty", "intermediate"),
                    "default_sets": ex.get("default_sets", 3),
                    "default_reps": ex.get("default_reps", 8),
                })
                stats["exercises_added"] += 1
        except Exception as e:
            console.print(f"[yellow]⚠ Warning:[/yellow] Error loading {yml_file.name}: {e}")
            stats["errors"] += 1
            continue

    if not catalog["exercises"]:
        console.print("[bold red]✗ Error:[/bold red] No exercises found in YAML files")
        return False

    # Write to target
    output_file.parent.mkdir(parents=True, exist_ok=True)

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)

    # Display Summary Table
    table = Table(title="Catalog Build Summary", box=None)
    table.add_column("Metric", style="cyan")
    table.add_column("Value", style="bold")
    
    table.add_row("Files Processed", str(stats["files_processed"]))
    table.add_row("Exercises Added", str(stats["exercises_added"]))
    table.add_row("Errors", f"[red]{stats['errors']}[/red]" if stats["errors"] > 0 else "0")
    
    console.print(table)
    console.print(Panel(f"[bold green]✓ Catalog built successfully![/bold green]\nSaved to: [blue]{output_file}[/blue]", expand=False))
    return True


@app.command()
def build(
    source_dir: Optional[Path] = typer.Option(
        Path(__file__).resolve().parent.parent / "fitness" / "catalog" / "kb" / "exercises",
        help="Directory containing exercise YAML files (Default: Repo-KB; ~/fitness existiert nicht mehr)"
    ),
    output_file: Optional[Path] = typer.Option(
        Path.home() / ".aos" / "fitness" / "workouts" / "catalog.json",
        help="Target JSON file path"
    ),
    watch: bool = typer.Option(False, "--watch", "-w", help="Watch for changes and auto-rebuild")
):
    """Load all exercise YAMLs and build unified catalog."""
    
    success = run_build(source_dir, output_file)
    
    if watch:
        if not success:
            console.print("[yellow]Initial build failed, but starting watcher anyway...[/yellow]")
        
        console.print(f"[bold blue]⟳ Watching {source_dir} for changes...[/bold blue]")
        observer = Observer()
        handler = CatalogHandler(source_dir, output_file)
        observer.schedule(handler, str(source_dir), recursive=False)
        observer.start()
        
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            observer.stop()
        observer.join()
    else:
        if not success:
            raise typer.Exit(code=1)

if __name__ == "__main__":
    app()
