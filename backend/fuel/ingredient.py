#!/usr/bin/env python3
"""
fuel-ingredient — Basis-Zutaten-Katalog (Makro+Mikro pro 100g), getrennt
vom Meal-Katalog (catalogs/nutrition/meals/). Siehe fuel/ingredient_add.py.
"""

from __future__ import annotations

import typer

app = typer.Typer(help="Ingredient-Katalog CLI — Basis-Zutaten mit vollem Makro+Mikro-Profil pro 100g.")


@app.command(name="add")
def add_command(
    query: str = typer.Argument(..., help='Zutat, z.B. "Freiland-Hühnerei" oder "Basmati-Reis, roh"'),
    ingredient_id: str | None = typer.Option(None, "--id", help="Katalog-ID (default: aus Name abgeleitet)"),
    engine: str = typer.Option("auto", "--engine", "-e", help="auto|haiku|gemini (für Quelle B)"),
    threshold: float = typer.Option(0.15, "--threshold", "-t", help="Relative Abweichung ab der geflaggt statt gemittelt wird"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Nur anzeigen, nicht schreiben"),
    yes: bool = typer.Option(False, "--yes", "-y", help="Ohne Rückfrage überschreiben"),
) -> None:
    """Zutat per Zwei-Quellen-Recherche (USDA FDC + Haiku/Gemini+WebSearch) anlegen."""
    from .ingredient_add import run_add
    run_add(query, ingredient_id=ingredient_id, engine=engine, threshold=threshold, dry_run=dry_run, assume_yes=yes)


def main() -> None:
    app()


if __name__ == "__main__":
    main()
