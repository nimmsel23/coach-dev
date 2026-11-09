"""Flashcard-Modus — Ursprung & Ansatz lernen mit Score-Tracking."""
from __future__ import annotations

import json
import random
from datetime import date
from pathlib import Path

import typer
from rich import box
from rich.panel import Panel
from rich.rule import Rule
from rich.table import Table

from ._helpers import init_loader, _gum_log, console
from anatomy_kb import loader, muscle_store as _store

SCORES_FILE = Path.home() / ".aos" / "fitness" / "anatomy-scores.json"
WEAK_THRESHOLD = 0.6  # correct_rate unter 60% → weak


# --- Score-Persistenz --------------------------------------------------------

def _load_scores() -> dict:
    if SCORES_FILE.exists():
        try:
            return json.loads(SCORES_FILE.read_text())
        except Exception:
            pass
    return {}


def _save_scores(scores: dict) -> None:
    SCORES_FILE.parent.mkdir(parents=True, exist_ok=True)
    SCORES_FILE.write_text(json.dumps(scores, indent=2, ensure_ascii=False))


def _record(scores: dict, muscle: str, field: str, rating: int) -> None:
    """Rating: 1=gewusst, 2=unsicher, 3=falsch"""
    key = f"{muscle}.{field}"
    entry = scores.setdefault(key, {"correct": 0, "incorrect": 0, "last": ""})
    if rating == 1:
        entry["correct"] += 1
    else:
        entry["incorrect"] += 1
    entry["last"] = date.today().isoformat()


def _correct_rate(entry: dict) -> float:
    total = entry["correct"] + entry["incorrect"]
    return entry["correct"] / total if total else 0.0


def _is_weak(scores: dict, muscle: str, field: str) -> bool:
    entry = scores.get(f"{muscle}.{field}")
    if entry is None:
        return True
    return _correct_rate(entry) < WEAK_THRESHOLD


# --- Karten-Sammlung ---------------------------------------------------------

def _collect_cards(exercise_filter: str | None, weak_only: bool, scores: dict) -> list[dict]:
    """Liest Karten aus muscles/*.yml, optional gefiltert nach Übung."""
    init_loader()
    ex_lookup = {ex_id: (d.get("name") or d.get("display_name") or ex_id)
                 for ex_id, d in loader.load_all().items()}

    muscle_ids = (_store.muscles_for_exercise(exercise_filter)
                  if exercise_filter else _store.list_muscles())

    cards = []
    for muscle_id in muscle_ids:
        doc = _store.load_muscle(muscle_id)
        if not doc:
            continue
        origin = (doc.get("origin") or "").strip()
        insertion = (doc.get("insertion") or "").strip()
        if not origin and not insertion:
            continue
        if weak_only and not (_is_weak(scores, muscle_id, "origin") or
                               _is_weak(scores, muscle_id, "insertion")):
            continue
        # Eine Karte pro Muskel — Exercise-Kontext aus exercises-Block
        exercises = list(doc.get("exercises", {}).keys())
        ex_id = exercises[0] if exercises else ""
        ex_name = ex_lookup.get(ex_id, ex_id) if ex_id else ""
        cards.append({
            "exercise_id": ex_id,
            "exercise_name": ex_name,
            "muscle": muscle_id,
            "latin": doc.get("latin", ""),
            "origin": origin,
            "insertion": insertion,
            "innervation": doc.get("innervation", ""),
        })
    return cards


# --- Einzelkarte anzeigen ----------------------------------------------------

def _show_card(card: dict, index: int, total: int, scores: dict) -> int | None:
    """Zeigt eine Karte, wartet auf Eingabe, gibt Rating zurück. None = abbrechen."""
    muscle = card["muscle"]
    latin = card["latin"]
    ex_name = card["exercise_name"]

    origin_score = scores.get(f"{muscle}.origin", {})
    insert_score = scores.get(f"{muscle}.insertion", {})

    def _score_badge(entry: dict) -> str:
        if not entry:
            return "[dim]neu[/dim]"
        rate = _correct_rate(entry)
        if rate >= 0.8:
            return f"[green]{rate:.0%}[/green]"
        if rate >= 0.5:
            return f"[yellow]{rate:.0%}[/yellow]"
        return f"[red]{rate:.0%}[/red]"

    header = f"[bold yellow]{muscle}[/bold yellow]"
    if latin:
        header += f"  [dim]{latin}[/dim]"

    console.print()
    console.print(Panel.fit(
        f"{header}\n[dim]Übung: {ex_name}  ·  {index}/{total}[/dim]\n"
        f"[dim]Ursprung {_score_badge(origin_score)}  ·  Ansatz {_score_badge(insert_score)}[/dim]",
        border_style="cyan",
    ))
    console.print()

    # Ursprung
    console.print("  [bold cyan]Ursprung (Origo)?[/bold cyan]  ", end="")
    try:
        input()
    except (KeyboardInterrupt, EOFError):
        return None
    console.print(Panel(
        f"[white]{card['origin']}[/white]",
        title="[cyan]Ursprung[/cyan]", border_style="cyan",
    ))
    console.print()

    # Ansatz
    console.print("  [bold cyan]Ansatz (Insertio)?[/bold cyan]  ", end="")
    try:
        input()
    except (KeyboardInterrupt, EOFError):
        return None
    console.print(Panel(
        f"[white]{card['insertion']}[/white]",
        title="[cyan]Ansatz[/cyan]", border_style="cyan",
    ))

    if card["innervation"]:
        console.print(f"  [dim]Innervation: {card['innervation']}[/dim]")

    console.print()
    console.print(Rule(style="dim"))
    console.print("  [bold green]1[/bold green] Gewusst   "
                  "[bold yellow]2[/bold yellow] Unsicher   "
                  "[bold red]3[/bold red] Falsch   "
                  "[dim]q[/dim] Beenden")
    console.print()

    while True:
        try:
            key = input("  → ").strip().lower()
        except (KeyboardInterrupt, EOFError):
            return None
        if key in ("1", "2", "3"):
            return int(key)
        if key in ("q", "quit", "exit"):
            return None
        console.print("  [dim]1, 2, 3 oder q[/dim]")


# --- Befehl ------------------------------------------------------------------

def command(
    exercise: str = typer.Option("", "--exercise", "-e", help="Nur Muskeln dieser Übung (z.B. pull_up)"),
    weak: bool = typer.Option(False, "--weak", "-w", help="Nur Muskeln unter 60% Trefferquote"),
    shuffle: bool = typer.Option(True, "--shuffle/--no-shuffle", help="Reihenfolge mischen (Standard: an)"),
    limit: int = typer.Option(0, "--limit", "-n", help="Maximale Kartenanzahl (0 = alle)"),
):
    """
    [bold]Flashcard-Modus — Ursprung & Ansatz[/bold]

    Zeigt Muskelname → du erinnerst dich → Enter → Ursprung aufdecken
    → Enter → Ansatz aufdecken → Selbstbewertung.

    Score wird in [dim]~/.aos/fitness/anatomy-scores.json[/dim] gespeichert.
    [dim]--weak[/dim] zeigt nur Muskeln unter 60% Trefferquote.

    \b
    Beispiele:
      anatomy-agent flashcard
      anatomy-agent flashcard --exercise pull_up
      anatomy-agent flashcard --weak
      anatomy-agent flashcard --limit 10
    """
    scores = _load_scores()
    cards = _collect_cards(exercise or None, weak, scores)

    if not cards:
        if weak:
            _gum_log("info", "Alle Muskeln über 60% — kein Nachholbedarf")
        else:
            _gum_log("warn", "Keine Karten gefunden — erst enrich/ingest ausführen")
        raise typer.Exit(0)

    if shuffle:
        random.shuffle(cards)
    if limit:
        cards = cards[:limit]

    total = len(cards)
    console.print()
    console.print(Panel.fit(
        f"[bold]Flashcard-Session[/bold]  [dim]{total} Karten[/dim]"
        + ("  [yellow]nur schwache[/yellow]" if weak else "")
        + (f"  [dim]{exercise}[/dim]" if exercise else ""),
        border_style="green",
    ))

    results = {1: 0, 2: 0, 3: 0}

    for i, card in enumerate(cards, 1):
        rating = _show_card(card, i, total, scores)
        if rating is None:
            console.print("\n  [dim]Session beendet.[/dim]\n")
            break
        results[rating] += 1
        _record(scores, card["muscle"], "origin", rating)
        _record(scores, card["muscle"], "insertion", rating)
        _save_scores(scores)

    done = sum(results.values())
    if done:
        console.print()
        table = Table(box=box.SIMPLE, show_header=False, padding=(0, 2))
        table.add_column("", no_wrap=True)
        table.add_column("", justify="right")
        table.add_row("[bold green]Gewusst[/bold green]", str(results[1]))
        table.add_row("[bold yellow]Unsicher[/bold yellow]", str(results[2]))
        table.add_row("[bold red]Falsch[/bold red]", str(results[3]))
        table.add_row("[dim]Gesamt[/dim]", str(done))
        console.print(Panel(table, title="[bold]Session-Ergebnis[/bold]", border_style="green"))
        console.print()
        if results[3] > 0 or results[2] > 0:
            _gum_log("info", "Nächste Session: anatomy-agent flashcard --weak")
