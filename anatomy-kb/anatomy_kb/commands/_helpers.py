"""Shared helpers used by multiple command modules."""
import subprocess
import sys
from pathlib import Path

import typer

from anatomy_kb.config import ANATOMY_KB_ROOT, FITNESS_DEV, CATALOG_EXERCISES, ANATOMY_TEACHING as ANATOMY_TEACHING_DIR

ROOT = ANATOMY_KB_ROOT  # Alias für Backward-Compat (serve.py etc.)
EXERCISES_DIR = ANATOMY_TEACHING_DIR
SERVER_PORT = 9200

from anatomy_kb import loader, display as _display
from anatomy_kb.models import Exercise

_gum_log = _display.gum_log
console = _display.console


def init_loader() -> None:
    loader.init(EXERCISES_DIR, catalog_dir=CATALOG_EXERCISES if CATALOG_EXERCISES.exists() else None)


def load_exercise(exercise_id: str) -> Exercise:
    init_loader()
    data = loader.load_one(exercise_id)
    if data is None:
        _gum_log("error", f"Übung nicht gefunden: {exercise_id}")
        console.print(f"\n  Verfügbar: [dim]{', '.join(loader.list_ids())}[/dim]\n")
        raise typer.Exit(1)
    return Exercise.from_dict(data)


def fzf_pick(options: list[str], prompt: str = "Übung wählen") -> str | None:
    result = subprocess.run(
        ["fzf", "--prompt", f"{prompt}: ", "--height=40%", "--border", "--ansi"],
        input="\n".join(options),
        text=True,
        capture_output=True,
    )
    return result.stdout.strip() or None
