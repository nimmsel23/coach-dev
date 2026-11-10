"""Wöchentlicher Katalog-Abgleich: unverifizierte Meal-Einträge gegen offizielle
Herstellerwerte prüfen (Haiku-CLI + WebSearch), YAML bei Treffer korrigieren.

Nur Einträge mit `source: gemini` werden geprüft — `source: manual` gilt als
bereits verifiziert und wird nie angefasst. Läuft typischerweise über den
systemd-User-Timer `fuel-catalog-verify.timer` (siehe deploy/systemd/).
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import typer
import yaml
from loguru import logger

from . import claude_cli
from . import log as _log
from .catalog_lookup import REPO_CATALOG_DIR

_log.setup()

app = typer.Typer(add_completion=False)

VERIFY_PROMPT = """Für folgendes Lebensmittel/Produkt: "{name}"

Prüfe per WebSearch, ob dies ein Markenprodukt mit einer öffentlich auffindbaren,
offiziellen Nährwerttabelle ist (Hersteller-Website, Verpackungsangabe, seriöse
Lebensmitteldatenbank wie fddb.info — bevorzugt EU/deutsche Quellen, NICHT USDA).

Wenn gefunden: rechne die kcal/Protein/Kohlenhydrate/Fett-Werte für die aktuell
im System hinterlegte Menge ({yield_desc}) um.

Antworte NUR mit JSON, keine Erklärung:
{{
  "found": <true/false>,
  "source_url": "<url oder null>",
  "per_100g": {{"kcal": <Zahl>, "protein": <Zahl>, "carbs": <Zahl>, "fat": <Zahl>}},
  "yield_g": <Zahl oder null — geschätztes/offizielles Portionsgewicht in Gramm>,
  "note": "<kurze Notiz, z.B. Glasgröße, Abtropfgewicht>"
}}
Wenn nichts Verlässliches gefunden wird: {{"found": false}}
"""


def _load_unverified(limit: int) -> list[Path]:
    files = sorted(REPO_CATALOG_DIR.glob("*.yaml"))
    out = []
    for f in files:
        try:
            data = yaml.safe_load(f.read_text())
        except yaml.YAMLError:
            continue
        data = data or {}
        # verified_at fehlt bei allen vor 2026-08-25 angelegten Einträgen
        # (Feld existiert erst seit der inline-Verifikation beim Catalog-Save) —
        # source:gemini bleibt als Fallback-Kriterium für diese Altbestände.
        if not data.get("verified_at") or data.get("source") == "gemini":
            out.append(f)
        if len(out) >= limit:
            break
    return out


def _verify_one(path: Path) -> str:
    """Returns 'corrected' | 'no_match' | 'error'."""
    data = yaml.safe_load(path.read_text())
    name = data.get("name") or data.get("description") or path.stem
    yield_desc = f"{data.get('yield_g')}g" if data.get("yield_g") else "unbekannte Menge (Standardportion)"

    prompt = VERIFY_PROMPT.format(name=name, yield_desc=yield_desc)
    res = claude_cli.call_claude(prompt, timeout=120, log_label=f"verify:{path.stem}")
    if not res["ok"]:
        logger.warning(f"{path.stem}: Haiku-Call fehlgeschlagen ({res['error']})")
        return "error"

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    parsed = claude_cli._extract_json(res["text"])
    if not parsed or not parsed.get("found"):
        logger.info(f"{path.stem}: keine offizielle Quelle gefunden")
        # verified_at trotzdem setzen — sonst würde jeder erneute Log-Vorgang
        # (saveMeal-Aufruf) denselben erfolglosen Haiku-Call erneut auslösen.
        data["verified_at"] = now
        path.write_text(yaml.dump(data, allow_unicode=True, sort_keys=False, default_flow_style=False))
        return "no_match"

    per_100g = parsed.get("per_100g") or {}
    yield_g = parsed.get("yield_g") or data.get("yield_g") or 100
    try:
        yield_g = float(yield_g)
        kcal = round(per_100g["kcal"] * yield_g / 100, 1)
        protein = round(per_100g["protein"] * yield_g / 100, 1)
        carbs = round(per_100g["carbs"] * yield_g / 100, 1)
        fat = round(per_100g["fat"] * yield_g / 100, 1)
    except (KeyError, TypeError, ZeroDivisionError) as e:
        logger.warning(f"{path.stem}: unbrauchbare Werte von Haiku ({e})")
        return "error"

    note = parsed.get("note") or ""
    source_url = parsed.get("source_url") or ""
    data["kcal"] = kcal
    data["protein"] = protein
    data["carbs"] = carbs
    data["fat"] = fat
    data["yield_g"] = yield_g
    data["source"] = "manual"
    data["notes"] = f"Offizielle Herstellerangabe ({source_url}) pro 100g: {per_100g}. {note}".strip()
    data["updated_at"] = now
    data["verified_at"] = now

    path.write_text(yaml.dump(data, allow_unicode=True, sort_keys=False, default_flow_style=False))
    logger.success(f"{path.stem}: korrigiert auf {kcal} kcal (Quelle: {source_url})")
    return "corrected"


@app.command("verify-one")
def verify_one_cmd(item_id: str):
    """Prüft einen einzelnen, frisch angelegten Catalog-Eintrag sofort —
    wird vom Node-Server (nutrition-catalog.mjs:saveMeal) nach jedem Save
    im Hintergrund aufgerufen, statt auf den Wochen-Batch zu warten."""
    if not claude_cli.available():
        print(json.dumps({"result": "error", "error": "claude CLI nicht gefunden"}))
        raise typer.Exit(1)
    path = REPO_CATALOG_DIR / f"{item_id}.yaml"
    if not path.exists():
        print(json.dumps({"result": "error", "error": "not_found"}))
        raise typer.Exit(1)
    result = _verify_one(path)
    print(json.dumps({"result": result}))


@app.command()
def run(limit: int = typer.Option(20, help="Max. Einträge pro Lauf (Kostenbremse)")):
    """Scannt unverifizierte Katalog-Einträge und gleicht sie gegen offizielle Quellen ab."""
    if not claude_cli.available():
        logger.error("claude CLI nicht gefunden — abgebrochen")
        raise typer.Exit(1)

    targets = _load_unverified(limit)
    if not targets:
        logger.info("Keine unverifizierten Einträge (source: gemini) gefunden")
        return

    logger.info(f"{len(targets)} unverifizierte Einträge, prüfe (max {limit})...")
    counts = {"corrected": 0, "no_match": 0, "error": 0}
    for path in targets:
        result = _verify_one(path)
        counts[result] += 1

    logger.info(f"Fertig: {counts['corrected']} korrigiert, {counts['no_match']} ohne Treffer, {counts['error']} Fehler")


def main():
    app()


if __name__ == "__main__":
    main()
