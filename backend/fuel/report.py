#!/usr/bin/env python3
"""
fuel-report — Lese-Ansichten für den Tages-/Wochen-Log (Makros + Mikros).

Drei Einstiegspunkte (thin bin/-Skripte):
  fuel-today   detaillierter Tagesbericht: Mahlzeiten-Makros + Mikro-Tabelle mit Ref-%
  fuel-micro   nur die Mikronährstoff-Tabelle für einen Tag
  fuel-week    Wochenraster: Makro-Summen pro Tag + Mikro-Schnitt (Ø/Tag) mit Ref-%

Alle drei teilen dieselben Datums-Flags wie `fuel-meal today`:
  --tag <wort|datum>   heute|gestern|vorgestern|-N|Mo|YYYY-MM-DD
  --gestern / -g       gestern
  --vorgestern         vorgestern
  --day/-d YYYY-MM-DD   (legacy) explizites Datum

Referenzwerte (Spalte "Ref"): Adult-Tagesbezugswerte, überwiegend D-A-CH-
Referenzwerte bzw. EU-NRV wo D-A-CH keinen Wert nennt. Grobe Orientierung,
kein individueller Bedarf (Alter/Geschlecht/Schwangerschaft/Sport).
"""

from __future__ import annotations

import json
import os
from datetime import date, timedelta
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from .dates import resolve_flags as _resolve_date
from . import paths as _paths  # initializes shared Fuel environment configuration

console = Console()

# ── Paths ──────────────────────────────────────────────────────────────────────

def _nutrition_dir() -> Path:
    base = Path(os.environ.get("AOS_FUEL_DATA_DIR", Path.home() / ".aos" / "fuel")).expanduser()
    return base / "nutrition"


def _read_day(date_str: str) -> dict | None:
    p = _nutrition_dir() / f"{date_str}.json"
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError, OSError) as exc:
        raise RuntimeError(f"Tageslog ist beschädigt: {p}") from exc
    if not isinstance(data, dict) or not isinstance(data.get("meals", []), list):
        raise RuntimeError(f"Tageslog hat ein ungültiges Format: {p}")
    if any(not isinstance(meal, dict) for meal in data.get("meals", [])):
        raise RuntimeError(f"Tageslog enthält ungültige Mahlzeiten: {p}")
    return data


# ── Micro-Referenz ─────────────────────────────────────────────────────────────
# key -> (Label, Einheit, Ref-Tagesbedarf | None)

MICRO_META: dict[str, tuple[str, str, float | None]] = {
    "vitamin_a_ug":   ("Vitamin A", "µg", 800),
    "vitamin_d_ug":   ("Vitamin D", "µg", 20),
    "vitamin_e_mg":   ("Vitamin E", "mg", 12),
    "vitamin_k_ug":   ("Vitamin K", "µg", 75),
    "vitamin_c_mg":   ("Vitamin C", "mg", 100),
    "vitamin_b1_mg":  ("Vitamin B1", "mg", 1.1),
    "vitamin_b2_mg":  ("Vitamin B2", "mg", 1.4),
    "vitamin_b3_mg":  ("Vitamin B3", "mg", 15),
    "vitamin_b5_mg":  ("Vitamin B5", "mg", 6),
    "vitamin_b6_mg":  ("Vitamin B6", "mg", 1.4),
    "vitamin_b7_ug":  ("Vitamin B7", "µg", 40),
    "folate_ug":      ("Folat", "µg", 300),
    "vitamin_b12_ug": ("Vitamin B12", "µg", 4),
    "calcium_mg":     ("Calcium", "mg", 1000),
    "phosphorus_mg":  ("Phosphor", "mg", 700),
    "magnesium_mg":   ("Magnesium", "mg", 350),
    "iron_mg":        ("Eisen", "mg", 14),
    "zinc_mg":        ("Zink", "mg", 10),
    "selenium_ug":    ("Selen", "µg", 70),
    "iodine_ug":      ("Jod", "µg", 200),
    "potassium_mg":   ("Kalium", "mg", 4000),
    "sodium_mg":      ("Natrium", "mg", 1500),
    "boron_mg":       ("Bor", "mg", None),
    "omega3_mg":      ("Omega-3 gesamt", "mg", None),
    "omega3_ala_mg":  ("Omega-3 ALA", "mg", None),
    "omega3_epa_mg":  ("Omega-3 EPA", "mg", None),
    "omega3_dha_mg":  ("Omega-3 DHA", "mg", None),
    "omega3_dpa_mg":  ("Omega-3 DPA", "mg", None),
    "omega3_epa_dha_mg": ("EPA + DHA (EFSA)", "mg", 250),
}


# ── Aggregation ────────────────────────────────────────────────────────────────

def _sum_macros(meals: list[dict]) -> dict[str, float]:
    out = {"kcal": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0}
    for m in meals:
        for k in out:
            v = m.get(k, 0) or 0
            if isinstance(v, (int, float)):
                out[k] += v
    return out


def _sum_micros(meals: list[dict]) -> dict[str, float]:
    out: dict[str, float] = {k: 0.0 for k in MICRO_META}
    for m in meals:
        for k, v in (m.get("micros") or {}).items():
            if k in out and isinstance(v, (int, float)):
                out[k] += v
    return out


def _pct_style(pct: float | None) -> str:
    if pct is None:
        return "dim"
    if pct < 50:
        return "red"
    if pct < 100:
        return "yellow"
    if pct <= 300:
        return "green"
    return "magenta"  # sehr hoch — z.B. Natrium-Überschuss auffällig machen


def _fmt_amount(val: float) -> str:
    if val >= 100:
        return f"{val:.0f}"
    if val >= 10:
        return f"{val:.1f}"
    return f"{val:.2f}"


def _micro_table(micros: dict[str, float], *, title: str, divisor: int = 1,
                 amount_header: str = "Menge") -> Table:
    """divisor > 1 → Werte werden vor Anzeige geteilt (Ø/Tag im Wochenbericht)."""
    tbl = Table(title=title, show_header=True, header_style="bold cyan", title_justify="left")
    tbl.add_column("Mikronährstoff")
    tbl.add_column(amount_header, justify="right")
    tbl.add_column("Ref", justify="right")
    tbl.add_column("%", justify="right")

    any_row = False
    for key, (label, unit, ref) in MICRO_META.items():
        raw = micros.get(key, 0.0) or 0.0
        val = raw / divisor if divisor > 1 else raw
        if val <= 0 and ref is not None:
            # nichts geschätzt für diesen Nährstoff → als Lücke zeigen
            tbl.add_row(label, f"[dim]0 {unit}[/dim]", f"{_fmt_amount(ref)} {unit}", "[red]0 %[/red]")
            any_row = True
            continue
        if val <= 0:
            continue
        any_row = True
        pct = (val / ref * 100) if ref else None
        ref_cell = f"{_fmt_amount(ref)} {unit}" if ref else "[dim]—[/dim]"
        pct_cell = f"[{_pct_style(pct)}]{pct:.0f} %[/{_pct_style(pct)}]" if pct is not None else "[dim]—[/dim]"
        tbl.add_row(label, f"{_fmt_amount(val)} {unit}", ref_cell, pct_cell)

    if not any_row:
        tbl.add_row("[dim]keine Mikro-Daten[/dim]", "", "", "")
    return tbl


def _macro_line(macros: dict[str, float]) -> str:
    return (f"{macros['kcal']:.0f} kcal · "
            f"{macros['protein']:.0f} EW / {macros['carbs']:.0f} KH / {macros['fat']:.0f} Fett")


# ── Commands ───────────────────────────────────────────────────────────────────

def _date_opts():
    return dict(
        tag=typer.Option(None, "--tag", help="heute|gestern|vorgestern|-N|Mo|YYYY-MM-DD"),
        gestern=typer.Option(False, "--gestern", "-g"),
        vorgestern=typer.Option(False, "--vorgestern"),
        day=typer.Option(None, "--day", "-d", hidden=True),
    )


def _resolve(tag, gestern, vorgestern, day) -> str:
    try:
        return _resolve_date(tag=tag, gestern=gestern, vorgestern=vorgestern, day_legacy=day)
    except ValueError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1)


def _today_cmd(
    tag: str = typer.Option(None, "--tag", help="heute|gestern|vorgestern|-N|Mo|YYYY-MM-DD"),
    gestern: bool = typer.Option(False, "--gestern", "-g"),
    vorgestern: bool = typer.Option(False, "--vorgestern"),
    day: str = typer.Option(None, "--day", "-d", hidden=True),
) -> None:
    """Detaillierter Tagesbericht: Mahlzeiten-Makros + Mikro-Tabelle mit Ref-%."""
    target = _resolve(tag, gestern, vorgestern, day)
    d = _read_day(target)
    meals = (d or {}).get("meals", [])
    if not meals:
        console.print(f"[yellow]Keine Mahlzeiten geloggt am {target}[/yellow]")
        raise typer.Exit(0)

    mt = Table(title=f"Mahlzeiten — {target}", show_header=True, header_style="bold green", title_justify="left")
    mt.add_column("MAHLZEIT")
    mt.add_column("KCAL", justify="right")
    mt.add_column("EW", justify="right")
    mt.add_column("KH", justify="right")
    mt.add_column("FETT", justify="right")
    for m in meals:
        mt.add_row(
            m.get("description", "—"),
            f"{m.get('kcal', 0):.0f}",
            f"{m.get('protein', 0):.1f}g",
            f"{m.get('carbs', 0):.1f}g",
            f"{m.get('fat', 0):.1f}g",
        )
    tot = _sum_macros(meals)
    mt.add_section()
    mt.add_row("[bold]Total[/bold]", f"[bold]{tot['kcal']:.0f}[/bold]",
               f"[bold]{tot['protein']:.0f}g[/bold]", f"[bold]{tot['carbs']:.0f}g[/bold]",
               f"[bold]{tot['fat']:.0f}g[/bold]")
    console.print(mt)

    water = (d or {}).get("water_ml") or 0
    if water:
        console.print(f"[blue]Wasser:[/blue] {water} ml")

    console.print()
    console.print(_micro_table(_sum_micros(meals), title=f"Mikronährstoffe — {target}"))


def _micro_cmd(
    tag: str = typer.Option(None, "--tag", help="heute|gestern|vorgestern|-N|Mo|YYYY-MM-DD"),
    gestern: bool = typer.Option(False, "--gestern", "-g"),
    vorgestern: bool = typer.Option(False, "--vorgestern"),
    day: str = typer.Option(None, "--day", "-d", hidden=True),
) -> None:
    """Nur die Mikronährstoff-Tabelle für einen Tag."""
    target = _resolve(tag, gestern, vorgestern, day)
    d = _read_day(target)
    meals = (d or {}).get("meals", [])
    if not meals:
        console.print(f"[yellow]Keine Mahlzeiten geloggt am {target}[/yellow]")
        raise typer.Exit(0)
    console.print(_micro_table(_sum_micros(meals), title=f"Mikronährstoffe — {target}"))


def _week_cmd(
    tag: str = typer.Option(None, "--tag", help="Tag INNERHALB der Zielwoche (Default: aktuelle Woche)"),
    gestern: bool = typer.Option(False, "--gestern", "-g"),
    vorgestern: bool = typer.Option(False, "--vorgestern"),
    day: str = typer.Option(None, "--day", "-d", hidden=True),
) -> None:
    """Wochenraster: Makro-Summen pro Tag + Mikro-Schnitt (Ø/Tag) mit Ref-%."""
    anchor = date.fromisoformat(_resolve(tag, gestern, vorgestern, day))
    monday = anchor - timedelta(days=anchor.weekday())
    days = [monday + timedelta(days=i) for i in range(7)]

    wt = Table(title=f"Woche {monday.isoformat()} – {days[-1].isoformat()}  (KW {monday.isocalendar().week})",
               show_header=True, header_style="bold green", title_justify="left")
    wt.add_column("TAG")
    wt.add_column("KCAL", justify="right")
    wt.add_column("EW", justify="right")
    wt.add_column("KH", justify="right")
    wt.add_column("FETT", justify="right")
    wt.add_column("Mahlz.", justify="right")

    week_micros: dict[str, float] = {k: 0.0 for k in MICRO_META}
    week_macros = {"kcal": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0}
    logged_days = 0
    _wd = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]

    for i, dd in enumerate(days):
        d = _read_day(dd.isoformat())
        meals = (d or {}).get("meals", [])
        label = f"{_wd[i]} {dd.strftime('%d.%m.')}"
        if not meals:
            wt.add_row(f"[dim]{label}[/dim]", "[dim]—[/dim]", "[dim]—[/dim]", "[dim]—[/dim]", "[dim]—[/dim]", "[dim]0[/dim]")
            continue
        logged_days += 1
        mac = _sum_macros(meals)
        for k in week_macros:
            week_macros[k] += mac[k]
        for k, v in _sum_micros(meals).items():
            week_micros[k] += v
        wt.add_row(label, f"{mac['kcal']:.0f}", f"{mac['protein']:.0f}g",
                   f"{mac['carbs']:.0f}g", f"{mac['fat']:.0f}g", str(len(meals)))

    wt.add_section()
    if logged_days:
        wt.add_row("[bold]Ø/Tag[/bold]",
                   f"[bold]{week_macros['kcal']/logged_days:.0f}[/bold]",
                   f"[bold]{week_macros['protein']/logged_days:.0f}g[/bold]",
                   f"[bold]{week_macros['carbs']/logged_days:.0f}g[/bold]",
                   f"[bold]{week_macros['fat']/logged_days:.0f}g[/bold]", "")
        wt.add_row("[bold]Σ Woche[/bold]",
                   f"[bold]{week_macros['kcal']:.0f}[/bold]",
                   f"[bold]{week_macros['protein']:.0f}g[/bold]",
                   f"[bold]{week_macros['carbs']:.0f}g[/bold]",
                   f"[bold]{week_macros['fat']:.0f}g[/bold]", "")
    console.print(wt)

    if not logged_days:
        console.print("[yellow]Keine Mahlzeiten in dieser Woche geloggt.[/yellow]")
        raise typer.Exit(0)

    console.print()
    console.print(_micro_table(
        week_micros, divisor=logged_days, amount_header="Ø/Tag",
        title=f"Mikronährstoffe — Ø/Tag über {logged_days} geloggte(n) Tag(e)",
    ))


def today_main() -> None:
    typer.run(_today_cmd)


def micro_main() -> None:
    typer.run(_micro_cmd)


def week_main() -> None:
    typer.run(_week_cmd)
