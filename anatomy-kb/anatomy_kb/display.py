"""Rich-Anzeige-Helpers für anatomy-kb CLI."""
from __future__ import annotations

import subprocess

import yaml
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.rule import Rule
from rich.table import Table
from rich.text import Text

console = Console()


def gum_log(level: str, msg: str) -> None:
    if subprocess.run(["which", "gum"], capture_output=True).returncode == 0:
        subprocess.run(["gum", "log", f"--level={level}", msg])
    else:
        icons = {"info": "ℹ", "warn": "⚠", "error": "✗"}
        console.print(f"{icons.get(level, '·')} {msg}")


def section(title: str) -> None:
    console.print(Rule(f"[bold cyan]{title}[/bold cyan]", style="dim"))


def show_muscle_anatomy(muscle_anatomy: dict) -> None:
    if not muscle_anatomy:
        return
    console.print(Rule("[bold cyan]Muskel-Anatomie[/bold cyan]", style="dim"))
    console.print()
    for muscle_key, data in muscle_anatomy.items():
        if not isinstance(data, dict):
            continue
        latin = data.get("latin", "")
        header = f"[bold yellow]{muscle_key}[/bold yellow]"
        if latin:
            header += f"  [dim]{latin}[/dim]"
        table = Table(box=box.SIMPLE, show_header=False, padding=(0, 1))
        table.add_column("Feld", style="bold cyan", no_wrap=True, width=14)
        table.add_column("Inhalt")
        table.add_row("Ursprung", data.get("origin", "—"))
        table.add_row("Ansatz", data.get("insertion", "—"))
        table.add_row("Innervation", data.get("innervation", "—"))
        table.add_row("Funktion", data.get("function_in_exercise", "—"))
        console.print(Panel(table, title=header, border_style="dim"))
        console.print()


def show_common_errors(errors: dict) -> None:
    if not errors:
        return
    console.print(Rule("[bold red]Fehlerbilder[/bold red]", style="dim"))
    console.print()
    for err_id, err_data in errors.items():
        if not isinstance(err_data, dict):
            continue
        table = Table(box=box.SIMPLE, show_header=False, padding=(0, 1))
        table.add_column("Feld", style="bold red", no_wrap=True, width=14)
        table.add_column("Inhalt")
        table.add_row("Problem", err_data.get("description", "—"))
        table.add_row("Anatomie", err_data.get("anatomical_reason", "—"))
        table.add_row("Korrektur", err_data.get("correction", "—"))
        teaches = err_data.get("teaches", [])
        if teaches:
            table.add_row("Lehrt", ", ".join(teaches) if isinstance(teaches, list) else str(teaches))
        console.print(Panel(table, title=f"[yellow]{err_id}[/yellow]", border_style="dim"))
        console.print()


def show_vault_tags(tags: list[str]) -> None:
    if not tags:
        return
    console.print(Rule("[bold magenta]Tags[/bold magenta]", style="dim"))
    console.print()
    console.print("  " + "  ".join(f"[magenta]#{t}[/magenta]" for t in tags))
    console.print()


def save_to_yaml(yml_file, muscle_anatomy: dict, errors: dict, vault_tags: list[str]) -> None:
    """Mergt muscle_anatomy, common_errors_explained, vault_tags in YAML."""
    try:
        from ruamel.yaml import YAML as _RYAML
        import io as _io
        ry = _RYAML()
        ry.preserve_quotes = True
        ry.width = 120
        existing = ry.load(yml_file.read_text())
        if muscle_anatomy:
            existing["muscle_anatomy"] = muscle_anatomy
        if errors:
            existing["common_errors_explained"] = errors
        if vault_tags:
            existing["vault_tags"] = vault_tags
        buf = _io.StringIO()
        ry.dump(existing, buf)
        yml_file.write_text(buf.getvalue())
    except ImportError:
        existing = yaml.safe_load(yml_file.read_text()) or {}
        if muscle_anatomy:
            existing["muscle_anatomy"] = muscle_anatomy
        if errors:
            existing["common_errors_explained"] = errors
        if vault_tags:
            existing["vault_tags"] = vault_tags
        yml_file.write_text(
            yaml.dump(existing, allow_unicode=True, default_flow_style=False,
                      sort_keys=False, width=120)
        )
