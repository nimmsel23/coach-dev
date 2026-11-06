"""teach command + _teach_exercise helper (shared with browse.pick_command)."""
import yaml
import typer
from rich.panel import Panel

from anatomy_kb.commands._helpers import (
    EXERCISES_DIR, console, load_exercise, _gum_log,
)
from anatomy_kb import display as _display

_section = _display.section


def _teach_exercise(exercise_id: str) -> None:
    """Interne Teaching-Logik — wird von teach() und pick() verwendet."""
    ex = load_exercise(exercise_id)
    raw = ex.raw

    console.print()
    console.print(Panel.fit(
        f"[bold white]{ex.name}[/bold white]  [dim]·  {ex.category}  ·  {ex.movement_pattern}[/dim]",
        title="[cyan]anatomy-kb[/cyan]",
        border_style="cyan",
    ))
    console.print()

    _section("Kurzerklärung")
    console.print(f"  {ex.simple_explanation.strip()}\n")

    _section("Anatomie")
    for line in ex.detailed_explanation.strip().splitlines():
        console.print(f"  {line.strip()}")
    console.print()

    if raw.get("joint_actions"):
        _section("Gelenkaktionen")
        for joint, phases in raw["joint_actions"].items():
            if isinstance(phases, dict):
                for phase, actions in phases.items():
                    if isinstance(actions, list):
                        console.print(f"  [yellow]{joint}[/yellow] / [dim]{phase}[/dim]: {', '.join(actions)}")
                    elif isinstance(actions, str):
                        console.print(f"  [yellow]{joint}[/yellow] / [dim]{phase}[/dim]: {actions}")
            elif isinstance(phases, list):
                console.print(f"  [yellow]{joint}[/yellow]: {', '.join(phases)}")
        console.print()

    _section("Muskeln")
    if ex.muscle_roles.primary:
        console.print(f"  [bold green]Primär:[/bold green]       {', '.join(ex.muscle_roles.primary)}")
    if ex.muscle_roles.secondary:
        console.print(f"  [green]Sekundär:[/green]     {', '.join(ex.muscle_roles.secondary)}")
    if ex.muscle_roles.stabilizers:
        console.print(f"  [dim]Stabilisator:[/dim] {', '.join(ex.muscle_roles.stabilizers)}")
    console.print()

    if ex.feel_cues:
        _section("Körpergefühl")
        for cue in ex.feel_cues:
            console.print(f"  [cyan]→[/cyan] {cue}")
        console.print()

    if raw.get("coaching_cues"):
        _section("Coaching-Cues")
        cues = raw["coaching_cues"]
        if isinstance(cues, dict):
            for phase, items in cues.items():
                console.print(f"  [bold]{phase}:[/bold]")
                for item in (items or []):
                    console.print(f"    · {item}")
        console.print()

    variation_keys = [
        ("body_position_effect", "Körperposition-Effekte"),
        ("grip_variation_effect", "Griff-Variationen"),
        ("stance_variation_effect", "Stand-Variationen"),
        ("lunge_variation_effect", "Ausfallschritt-Variationen"),
        ("rdl_vs_deadlift", "RDL vs. Deadlift"),
    ]
    for key, label in variation_keys:
        if raw.get(key):
            _section(label)
            console.print(f"  [dim]{yaml.dump(raw[key], allow_unicode=True, default_flow_style=False).strip()}[/dim]")
            console.print()


def command(
    exercise_id: str = typer.Argument(..., help="Exercise-ID (z.B. bench_press, pull_up, squat)"),
):
    """
    [bold]Anatomy-Teaching einer Übung[/bold]

    Zeigt die vollständige didaktische Schicht:

    \b
    - Kurz- und Detailerklärung
    - Gelenkaktionen (konzentrisch / exzentrisch / statisch)
    - Muskelrollen (primär / sekundär / stabilisierend)
    - Körpergefühl-Cues
    - Coaching-Cues (Setup + Ausführung)
    - Variations-Effekte (Griff, Winkel, Stand)

    \b
    Beispiel: anatomy-agent teach pull_up
    """
    _teach_exercise(exercise_id)
