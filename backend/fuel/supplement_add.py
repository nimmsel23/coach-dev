"""`fuel supplement add` — Supplement per Produktrecherche in den Katalog aufnehmen.

Sucht das exakte Produkt (Marke + Name) via Claude-Haiku-CLI + WebSearch,
Gemini als Fallback, und schreibt einen sauberen Eintrag nach
`catalogs/supplements/catalog.yaml` — analog zu `catalog_verify.py`, nur für
das Anlegen statt das Nachbessern.

Zusätzlich: `fuel supplement cloud <uid>` zeigt/zieht den in der Firebase-App
(Cloud-Channel) angelegten Supplement-Katalog einer UID.
"""

from __future__ import annotations

from .omega3 import OMEGA3_RULES, normalize_omega3

import json
from datetime import datetime, timezone
from pathlib import Path

import typer
from loguru import logger
from rich.console import Console
from rich.table import Table

from . import claude_cli
from . import gemini
from . import log as _log
from .constants.nutrients import MICRO_KEYS as _MICRO_KEYS_LIST
from .supplement_catalog import (
    CATALOG_PATH,
    load_catalog_file as _load,
    make_catalog_id as _make_id,
    save_catalog_file as _save,
)

_log.setup()
console = Console()

# DACH-Mikronährstoff-Keys (Quelle: fuel/sources/common.py ↔ src/shared/
# config/dach.mjs) — nur diese dürfen in `micros` landen, damit die
# Wochenheatmap nichts Unbekanntes sieht.
MICRO_KEYS = set(_MICRO_KEYS_LIST)
TIME_OF_DAY = {"morning", "midday", "evening", "night", "any"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


RESEARCH_PROMPT = """Du recherchierst ein Nahrungsergänzungsmittel für einen Supplement-Katalog.

Produkt: "{query}"
{brand_line}
Nutze WebSearch, um die OFFIZIELLE Hersteller-Produktseite oder das Etikett zu
finden (bevorzugt Hersteller-Website, sonst ein Shop mit vollständiger
Nährwert-/Wirkstofftabelle). Findest du das exakte Produkt, übernimm die
Etikettwerte 1:1. Findest du es nicht, schätze konservativ und setze "found": false.

Antworte NUR mit JSON, kein Markdown, keine Erklärung:
{{
  "found": <true|false>,
  "source_url": "<url oder null>",
  "name": "<Kurzname, z.B. Ashwagandha>",
  "product": "<voller Produktname inkl. Marke>",
  "unit": "mg|g|ml|µg|IU|Stk",
  "serving": {{"amount": <Zahl>, "unit": "Kapsel|Tablette|ml|g", "per_day": <empfohlene Portionen pro Tag>}},
  "default_dose": <Zahl in "unit" — Hauptwirkstoffmenge pro Tag>,
  "default_time_of_day": "morning|midday|evening|night|any",
  "per_unit": {{"<wirkstoff>_mg": <Menge pro EINER Serving-Einheit>}},
  "actives": {{"<wirkstoff>_mg": <Menge pro Tagesdosis>}},
  "micros": {{"zinc_mg": <Zahl>, "vitamin_c_mg": <Zahl>}},
  "notes": "<kurz: Wirkstoff-Form (z.B. KSM-66), Quelle, Auffälligkeiten>"
}}

"micros" darf NUR diese Keys enthalten (Werte = Menge pro Tagesdosis, in mg bzw. ug):
{micro_keys}
Enthält das Produkt keinen dieser Mikronährstoffe: "micros": {{}}.
"""


def _build_prompt(query: str, brand: str | None) -> str:
    brand_line = f'Marke: "{brand}"\n' if brand else ""
    return RESEARCH_PROMPT.format(
        query=query, brand_line=brand_line, micro_keys=", ".join(sorted(MICRO_KEYS))
    ) + "\n" + OMEGA3_RULES


def _research(query: str, brand: str | None, engine: str) -> tuple[dict | None, str]:
    """Returns (parsed_json_or_None, engine_used)."""
    prompt = _build_prompt(query, brand)

    if engine in ("auto", "haiku") and claude_cli.available():
        res = claude_cli.call_claude(prompt, timeout=120, log_label="supp-add:haiku")
        if res["ok"]:
            parsed = claude_cli._extract_json(res["text"])
            if parsed:
                return parsed, "haiku"
            logger.warning("Haiku lieferte kein valides JSON — Fallback")
        else:
            logger.warning(f"Haiku-Call fehlgeschlagen ({res['error']}) — Fallback")
        if engine == "haiku":
            return None, "haiku"

    if engine in ("auto", "gemini"):
        res = gemini.call_gemini(prompt, timeout=45, log_label="supp-add:gemini")
        if res["ok"]:
            parsed = claude_cli._extract_json(res["text"])
            if parsed:
                return parsed, "gemini"
            logger.error("Gemini lieferte kein valides JSON")
        else:
            logger.error(f"Gemini-Call fehlgeschlagen ({res['error']})")

    return None, engine


def _clean_actives(raw: object) -> dict:
    out: dict[str, float] = {}
    if isinstance(raw, dict):
        for k, v in raw.items():
            try:
                fv = float(v)
            except (TypeError, ValueError):
                continue
            if fv > 0:
                out[str(k)] = round(fv, 3)
    return out


def _clean_micros(raw: object) -> dict:
    out: dict[str, float] = {}
    if isinstance(raw, dict):
        for k, v in raw.items():
            if k not in MICRO_KEYS:
                if k:
                    logger.debug(f"micros: unbekannter Key '{k}' verworfen")
                continue
            try:
                fv = float(v)
            except (TypeError, ValueError):
                continue
            if fv >= 0:
                out[k] = round(fv, 3)
    return normalize_omega3(out)


def _to_catalog_item(parsed: dict, supp_id: str | None, dose_override: float | None) -> dict:
    name = (parsed.get("name") or parsed.get("product") or "").strip()
    if not name:
        raise ValueError("Recherche lieferte keinen Namen")

    product = (parsed.get("product") or "").strip()
    unit = (parsed.get("unit") or "mg").strip() or "mg"
    tod = (parsed.get("default_time_of_day") or "any").strip()
    if tod not in TIME_OF_DAY:
        tod = "any"

    dose = dose_override
    if dose is None:
        try:
            dose = float(parsed.get("default_dose"))
        except (TypeError, ValueError):
            dose = None

    item: dict = {
        "id": supp_id or _make_id(name),
        "name": name,
        "unit": unit,
        "default_dose": int(dose) if dose is not None and dose == int(dose) else dose,
        "default_time_of_day": tod,
    }
    if product and product.lower() != name.lower():
        item["product"] = product

    per_unit = _clean_actives(parsed.get("per_unit"))
    if per_unit:
        item["per_unit"] = per_unit
    actives = _clean_actives(parsed.get("actives"))
    if actives:
        item["actives"] = actives
    micros = _clean_micros(parsed.get("micros"))
    if micros:
        item["micros"] = micros

    sched = parsed.get("schedule")
    if isinstance(sched, dict) and sched.get("type") in ("daily", "weekly", "cyclical"):
        item["schedule"] = sched

    src_url = (parsed.get("source_url") or "").strip()
    found = bool(parsed.get("found"))
    note = (parsed.get("notes") or "").strip()
    bits = []
    if note:
        bits.append(note)
    if found and src_url:
        bits.append(f"Etikettwerte laut {src_url}")
    elif not found:
        bits.append("KI-Schätzung, keine offizielle Quelle gefunden — bitte prüfen")
    item["notes"] = " · ".join(bits)
    item["source"] = "manual" if found else "gemini"
    item["verified_at"] = _now() if found else ""
    return item


def _preview(item: dict, engine: str, found: bool) -> None:
    t = Table(title=f"Neuer Katalog-Eintrag  ·  {engine}  ·  {'Quelle bestätigt' if found else 'GESCHÄTZT'}",
              show_header=False, title_style="bold cyan")
    t.add_column("Feld", style="dim")
    t.add_column("Wert")
    for k in ("id", "name", "product", "unit", "default_dose", "default_time_of_day"):
        if k in item:
            t.add_row(k, str(item[k]))
    for k in ("per_unit", "actives", "micros", "schedule"):
        if item.get(k):
            t.add_row(k, json.dumps(item[k], ensure_ascii=False))
    if item.get("notes"):
        t.add_row("notes", item["notes"])
    console.print(t)


def run_add(query: str, *, brand: str | None, supp_id: str | None, dose: float | None,
            engine: str, dry_run: bool, assume_yes: bool) -> None:
    engine = engine.lower()
    if engine not in ("auto", "haiku", "gemini"):
        console.print(f"[red]Unbekannte Engine: {engine}[/red]")
        raise typer.Exit(1)
    if engine == "haiku" and not claude_cli.available():
        console.print("[red]claude CLI nicht gefunden — --engine gemini nutzen[/red]")
        raise typer.Exit(1)

    console.print(f"[dim]Recherchiere „{query}“ …[/dim]")
    parsed, used = _research(query, brand, engine)
    if not parsed:
        console.print("[red]Keine verwertbare Antwort von Haiku/Gemini.[/red]")
        raise typer.Exit(1)

    try:
        item = _to_catalog_item(parsed, supp_id, dose)
    except ValueError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1)

    found = bool(parsed.get("found"))
    _preview(item, used, found)

    if dry_run:
        console.print("[yellow]--dry-run: nichts geschrieben.[/yellow]")
        return

    data = _load(CATALOG_PATH)
    idx = next((i for i, x in enumerate(data["items"]) if x.get("id") == item["id"]), None)
    verb = "überschreiben" if idx is not None else "anlegen"
    if not assume_yes and not typer.confirm(f"Eintrag '{item['id']}' {verb}?", default=True):
        console.print("[yellow]Abgebrochen.[/yellow]")
        return

    if idx is not None:
        data["items"][idx] = item
    else:
        data["items"].append(item)
    _save(CATALOG_PATH, data)
    console.print(f"[green]✓ '{item['id']}' gespeichert → {CATALOG_PATH}[/green]")
    console.print("[dim]Server-Neustart bzw. Katalog-Save pusht den Stand nach Firestore.[/dim]")


# ── Cloud-Katalog (Firebase-App) ──────────────────────────────────────────────

def run_cloud(uid: str, *, pull: bool) -> None:
    """Zeigt den Supplement-Katalog einer Cloud-UID; mit --pull werden dort
    angelegte, lokal unbekannte Einträge in catalog.yaml übernommen."""
    try:
        from . import firestore as _fsmod
        fs = _fsmod.get_fs()
    except Exception as e:  # noqa: BLE001 — SA fehlt / firebase_admin nicht installiert
        console.print(f"[red]Firestore nicht verfügbar: {e}[/red]")
        raise typer.Exit(1)

    doc = fs.collection("supplements").document(uid).collection("meta").document("catalog").get()
    remote = (doc.to_dict() or {}).get("items", []) if doc.exists else []
    if not remote:
        console.print(f"[yellow]Kein Cloud-Katalog für UID {uid}.[/yellow]")
        return

    local_ids = {x.get("id") for x in _load(CATALOG_PATH)["items"]}
    t = Table(title=f"Cloud-Supplement-Katalog · {uid}", header_style="bold magenta")
    t.add_column("ID"); t.add_column("Name"); t.add_column("Dosis"); t.add_column("Zeit"); t.add_column("lokal?")
    for it in remote:
        known = it.get("id") in local_ids
        t.add_row(str(it.get("id", "")), str(it.get("name", "")),
                  f"{it.get('default_dose', '')}{it.get('unit', '')}",
                  str(it.get("default_time_of_day", "")),
                  "[green]ja[/green]" if known else "[yellow]neu[/yellow]")
    console.print(t)

    new_items = [it for it in remote if it.get("id") not in local_ids]
    if not pull:
        if new_items:
            console.print(f"[dim]{len(new_items)} neu — mit --pull übernehmen.[/dim]")
        return
    if not new_items:
        console.print("[green]Nichts zu übernehmen.[/green]")
        return
    data = _load(CATALOG_PATH)
    for it in new_items:
        it.setdefault("source", "cloud")
        data["items"].append(it)
    _save(CATALOG_PATH, data)
    console.print(f"[green]✓ {len(new_items)} Cloud-Einträge → {CATALOG_PATH}[/green]")
