"""`fuel ingredient add` — Basis-Zutat per Zwei-Quellen-Recherche anlegen.

Zieht zwei unabhängige Quellen für Makro- UND Mikronährstoffe pro 100g:

  1. USDA FoodData Central — Live-API-Lookup (fuel/sources/usda.py)
  2. Claude-Haiku-CLI + WebSearch — angewiesen, eine ZWEITE, von USDA
     unabhängige Quelle zu finden (nationale Nährwerttabelle, Hersteller-
     Etikett, NIH/EFSA) — Gemini als Fallback wenn die CLI fehlt.

Für jeden gemeinsamen Nährwert wird der Durchschnitt beider Quellen als
finaler Wert übernommen; Werte, die nur eine Quelle liefert, werden 1:1
übernommen (mit Notiz). Weicht ein Wert relativ stark ab (Default: 15%),
wird das im Eintrag unter `flagged_diffs` festgehalten statt still
gemittelt zu werden — analog zu catalog_verify.py, nur für Zutaten statt
fürs Nachbessern eines bestehenden Meal-Katalogeintrags.

Ausgabe: catalogs/nutrition/ingredients/{id}.json (git-tracked).
"""

from __future__ import annotations

from .omega3 import OMEGA3_RULES, normalize_omega3

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import typer
from loguru import logger
from rich.console import Console
from rich.table import Table

from . import claude_cli
from . import gemini
from . import log as _log
from .sources import usda as _usda
from .constants.nutrients import ALL_KEYS, MACRO_KEYS, MICRO_KEYS
from .paths import REPO_DIR

_log.setup()
console = Console()

INGREDIENTS_DIR = REPO_DIR / "catalogs" / "nutrition" / "ingredients"

DEFAULT_DIFF_THRESHOLD = 0.15  # 15% relative Abweichung → flaggen statt still mitteln


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _make_id(name: str) -> str:
    base = "".join(c.lower() if c.isalnum() else "_" for c in name).strip("_")
    while "__" in base:
        base = base.replace("__", "_")
    return base or f"ingredient_{int(time.time())}"


# ── Quelle 1: USDA FDC (Live-API) ─────────────────────────────────────────────

def _from_usda(query: str) -> tuple[dict | None, str | None]:
    """Returns (per_100g dict mit ALL_KEYS-Subset, Beschreibung/URL-Hinweis)."""
    result = _usda.lookup(query)
    if not result:
        logger.warning(f"USDA: kein Treffer für {query!r}")
        return None, None
    values = {k: v for k, v in result["per_100g"].items() if k in ALL_KEYS}
    ref = f"USDA FDC {result['fdc_id']} — {result['description']}"
    return values, ref


# ── Quelle 2: Haiku+WebSearch (zweite, unabhängige Quelle) ───────────────────

RESEARCH_PROMPT = """Du recherchierst Nährwerte für eine Lebensmittel-Zutat, pro 100g.

Zutat: "{query}"

Nutze WebSearch, um eine Nährwertquelle zu finden, die NICHT USDA FoodData
Central ist — z.B. eine nationale Nährwerttabelle (BLS/DACH), eine
Hersteller-Etikett-Angabe, oder NIH/EFSA-Daten. Ziel: eine zweite,
unabhängige Referenz zum Gegenchecken.

Antworte NUR mit JSON, kein Markdown, keine Erklärung:
{{
  "found": <true|false>,
  "source_name": "<Name der Quelle, z.B. 'Deutsche BLS' oder 'Hersteller-Etikett XY'>",
  "source_url": "<url oder null>",
  "per_100g": {{
    "kcal": <Zahl oder null>, "protein": <Zahl oder null>, "carbs": <Zahl oder null>,
    "fat": <Zahl oder null>, "fiber": <Zahl oder null>,
    {micro_keys_json}
  }}
}}

Fehlt ein Wert bei dieser Quelle, setze null statt zu schätzen. Werte NUR
pro 100g, keine anderen Portionsgrößen.
"""


def _from_web(query: str, engine: str) -> tuple[dict | None, str | None]:
    micro_keys_json = ", ".join(f'"{k}": <Zahl oder null>' for k in MICRO_KEYS)
    prompt = RESEARCH_PROMPT.format(query=query, micro_keys_json=micro_keys_json) + "\n" + OMEGA3_RULES

    parsed = None
    used = engine
    if engine in ("auto", "haiku") and claude_cli.available():
        res = claude_cli.call_claude(prompt, timeout=120, log_label="ingredient-add:haiku")
        if res["ok"]:
            parsed = claude_cli._extract_json(res["text"])
            if parsed:
                used = "haiku"
        if not parsed:
            logger.warning("Haiku lieferte kein valides JSON — Fallback Gemini")

    if not parsed and engine in ("auto", "gemini"):
        res = gemini.call_gemini(prompt, timeout=45, log_label="ingredient-add:gemini")
        if res["ok"]:
            parsed = claude_cli._extract_json(res["text"])
            used = "gemini"

    if not parsed or not parsed.get("found"):
        return None, None

    per_100g = parsed.get("per_100g") or {}
    values = {}
    for k in ALL_KEYS:
        v = per_100g.get(k)
        if v is None:
            continue
        try:
            values[k] = float(v)
        except (TypeError, ValueError):
            continue

    ref_bits = [parsed.get("source_name") or used]
    if parsed.get("source_url"):
        ref_bits.append(parsed["source_url"])
    return normalize_omega3(values), " — ".join(ref_bits)


# ── Vergleich + Mittelung ─────────────────────────────────────────────────────

def _compare(usda_vals: dict, web_vals: dict, threshold: float) -> dict:
    """Returns {averaged: {...}, flagged_diffs: [...], notes: [...]}."""
    averaged: dict[str, float] = {}
    flagged: list[dict] = []
    notes: list[str] = []

    all_keys_seen = set(usda_vals) | set(web_vals)
    for k in ALL_KEYS:
        if k not in all_keys_seen:
            continue
        a = usda_vals.get(k)
        b = web_vals.get(k)
        if a is not None and b is not None:
            avg = (a + b) / 2
            denom = max((abs(a) + abs(b)) / 2, 1e-6)
            rel_diff = abs(a - b) / denom
            averaged[k] = round(avg, 4)
            if rel_diff > threshold and max(abs(a), abs(b)) > 0.05:
                flagged.append({
                    "key": k, "usda": a, "web": b,
                    "diff_pct": round(rel_diff * 100, 1),
                })
        elif a is not None:
            averaged[k] = round(a, 4)
            notes.append(f"{k}: nur USDA (Web-Quelle lieferte keinen Wert)")
        elif b is not None:
            averaged[k] = round(b, 4)
            notes.append(f"{k}: nur Web-Quelle (USDA lieferte keinen Wert)")

    return {"averaged": averaged, "flagged_diffs": flagged, "notes": notes}


# ── Preview + Write ────────────────────────────────────────────────────────────

def _preview(name: str, cmp: dict, usda_ref: str | None, web_ref: str | None) -> None:
    t = Table(title=f"Zwei-Quellen-Vergleich · {name}", header_style="bold cyan")
    t.add_column("Nährwert", style="dim")
    t.add_column("Ø-Wert", justify="right")
    t.add_row("[dim]Quelle A[/dim]", usda_ref or "—")
    t.add_row("[dim]Quelle B[/dim]", web_ref or "—")
    for k, v in cmp["averaged"].items():
        t.add_row(k, str(v))
    console.print(t)

    if cmp["flagged_diffs"]:
        ft = Table(title="⚠ Große Abweichungen (nicht still gemittelt)", header_style="bold yellow")
        ft.add_column("Nährwert"); ft.add_column("USDA", justify="right")
        ft.add_column("Web", justify="right"); ft.add_column("Diff %", justify="right")
        for d in cmp["flagged_diffs"]:
            ft.add_row(d["key"], str(d["usda"]), str(d["web"]), f"{d['diff_pct']}%")
        console.print(ft)


def run_add(
    query: str, *, ingredient_id: str | None, engine: str,
    threshold: float, dry_run: bool, assume_yes: bool,
) -> None:
    engine = engine.lower()
    if engine not in ("auto", "haiku", "gemini"):
        console.print(f"[red]Unbekannte Engine: {engine}[/red]")
        raise typer.Exit(1)

    console.print(f"[dim]Quelle A (USDA FDC) für „{query}“ …[/dim]")
    usda_vals, usda_ref = _from_usda(query)
    console.print(f"[dim]Quelle B ({engine}+WebSearch) für „{query}“ …[/dim]")
    web_vals, web_ref = _from_web(query, engine)

    if not usda_vals and not web_vals:
        console.print("[red]Keine der beiden Quellen lieferte verwertbare Werte.[/red]")
        raise typer.Exit(1)
    if not usda_vals:
        console.print("[yellow]USDA lieferte nichts — nur Web-Quelle wird übernommen.[/yellow]")
    if not web_vals:
        console.print("[yellow]Web-Quelle lieferte nichts — nur USDA wird übernommen.[/yellow]")

    cmp = _compare(usda_vals or {}, web_vals or {}, threshold)
    _preview(query, cmp, usda_ref, web_ref)

    if dry_run:
        console.print("[yellow]--dry-run: nichts geschrieben.[/yellow]")
        return

    iid = ingredient_id or _make_id(query)
    out_path = INGREDIENTS_DIR / f"{iid}.json"
    if out_path.exists() and not assume_yes:
        if not typer.confirm(f"'{iid}.json' existiert bereits — überschreiben?", default=False):
            console.print("[yellow]Abgebrochen.[/yellow]")
            return

    macros = {k: cmp["averaged"].get(k, 0) for k in MACRO_KEYS}
    micros = {k: v for k, v in cmp["averaged"].items() if k in MICRO_KEYS}

    item = {
        "id": iid,
        "kind": "ingredient",
        "name": query,
        "basis": "per_100g",
        "grams_reference": 100,
        "source": "usda+web_cross_check" if (usda_vals and web_vals) else ("usda" if usda_vals else "web"),
        "source_refs": {"usda": usda_ref, "web": web_ref},
        "macros": macros,
        "micros": micros,
        "flagged_diffs": cmp["flagged_diffs"],
        "notes": "; ".join(cmp["notes"]) if cmp["notes"] else "",
        "created_at": _now(),
        "updated_at": _now(),
    }

    INGREDIENTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(item, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    console.print(f"[green]✓ '{iid}' gespeichert → {out_path}[/green]")
    if cmp["flagged_diffs"]:
        console.print(f"[yellow]⚠ {len(cmp['flagged_diffs'])} Nährwert(e) mit großer Abweichung — bitte manuell prüfen.[/yellow]")
