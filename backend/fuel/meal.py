#!/usr/bin/env python3
"""
fuel-meal — Meal logging CLI (interactive, manual, Gemini-powered)

Usage:
  fuel meal log "Nussschnecke" --kcal 250    # With manual macros
  fuel meal log "Wiener Schnitzel"           # Auto-estimate via Gemini
  fuel meal log "Name" --save-catalog        # Save to reusable catalog
  fuel meal list                             # List meals in catalog
  fuel meal today                            # Show today's meals
"""

from __future__ import annotations

import json
import os
import re as _re
import subprocess
import sys
from uuid import uuid4
from datetime import date, datetime, timezone
from pathlib import Path

import typer
from wasabi import Printer
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from rich.console import Console
from rich.table import Table

from . import paths as _paths
from . import parse as _parse

from .dates import resolve_flags as _resolve_date, extract_date_hint as _extract_date_hint, resolve as _resolve_one
from .narrative import parse as _parse_narrative, spread_times as _spread_times
from .gemini import estimate_macros_only as _gemini_macros, estimate_nutrition as _gemini_estimate, discover_item as _gemini_discover
from .catalog_lookup import find_meal as _catalog_find, extract_macros as _catalog_macros, save_meal as _catalog_save, load_meals as _catalog_load_meals, _normalize_components, _amount_to_grams


# Mahlzeit-Typ-Präfix am Zeilenanfang ("mittagessen: 2 Semmeln" → "2 Semmeln").
# Colon verlangt, damit ein Gericht das zufällig mit "Mittag..." beginnt nicht
# zerschnitten wird.
_MEAL_TYPE_PREFIX = _re.compile(
    r"^\s*(fr[uü]hst[uü]ck|mittag(?:essen)?|abend(?:essen|brot)?|nachmittag|"
    r"vormittag|jause|snack|zwischenmahlzeit|zn[uü]ni|zvieri|"
    r"breakfast|lunch|dinner|supper|brunch)\s*:\s*",
    _re.IGNORECASE,
)

# Präfix-Wort (ascii-gefaltet) → kanonischer meal_type.
_MEAL_TYPE_WORDS = {
    "fruhstuck": "breakfast", "breakfast": "breakfast", "brunch": "breakfast",
    "mittag": "lunch", "mittagessen": "lunch", "lunch": "lunch",
    "abend": "dinner", "abendessen": "dinner", "abendbrot": "dinner",
    "dinner": "dinner", "supper": "dinner",
    "nachmittag": "snack", "vormittag": "snack", "jause": "snack", "snack": "snack",
    "zwischenmahlzeit": "snack", "znuni": "snack", "zvieri": "snack",
}


def _split_meal_type_prefix(text: str) -> tuple[str | None, str]:
    """'mittagessen: 2 Semmeln' → ('lunch', '2 Semmeln'). Kein Präfix → (None, text).

    Ein vorangestelltes Mahlzeit-Typ-Wort ist ein expliziter Zeitpunkt-Hinweis
    und soll den meal_type setzen, nicht im Beschreibungstext stehen bleiben.
    """
    m = _MEAL_TYPE_PREFIX.match(text)
    if not m:
        return None, text
    word = (
        m.group(1).casefold()
        .replace("ü", "u").replace("ö", "o").replace("ä", "a")
    )
    return _MEAL_TYPE_WORDS.get(word), text[m.end():].strip()


def _clean_catalog_name(text: str, max_len: int = 80) -> str:
    """Roh-Beschreibung → sauberer, wiederverwendbarer Catalog-Name (kein Gemini-Call).

    Entfernt:
      - Mahlzeit-Typ-Präfix ("mittagessen:", "lunch:")
      - generischen Prefix-Müll ("Mahlzeit:", "Insgesamt:", "Gericht:")
      - Klammer-Zusätze, die nur Mengen-/Marken-Aufschlüsselung enthalten
        ("(240g Käsleberkäse, 2x65g Bio-Kaisersemmel, BILLA)") — die
        Zutaten-Zerlegung steckt ohnehin schon in `components`
    Führende Stückzahlen ("2 Semmeln", "5 Eier") bleiben erhalten: die
    gespeicherten Makros gelten für genau diese Menge.
    """
    cleaned = _MEAL_TYPE_PREFIX.sub("", text).strip()
    # Prefix-Müll: "Mahlzeit:", "Insgesamt:", etc.
    cleaned = _re.sub(r"^\s*(mahlzeit|insgesamt|gericht|essen)\s*:?\s*", "", cleaned, flags=_re.IGNORECASE).strip()

    def _drop_noise_paren(m: "_re.Match[str]") -> str:
        inner = m.group(1).strip()
        has_qty = _re.search(r"\d\s*(g|gr|gramm|kg|ml|l|stk|st[uü]ck|stueck|x)\b", inner, _re.IGNORECASE)
        # Reine Mengen-/Marken-Klammer verwerfen, inhaltliche Klammer ("(vegan)") behalten.
        if has_qty or (inner and inner.isupper()):
            return ""
        return m.group(0)

    cleaned = _re.sub(r"\s*\(([^()]*)\)", _drop_noise_paren, cleaned)
    cleaned = _re.sub(r"\s+", " ", cleaned).strip(" ,;.–-")
    if len(cleaned) > max_len:
        cleaned = cleaned[: max_len - 1].rsplit(",", 1)[0].rstrip() + "…"
    return cleaned or text

console = Console()
msg = Printer()

# ── Helpers ───────────────────────────────────────────────────────────────────

def gum_log(level: str, text: str):
    """Wrapper for gum log."""
    try:
        subprocess.run(["gum", "log", f"--level={level}", text])
    except:
        if level == "info": msg.info(text)
        elif level == "warn": msg.warn(text)
        elif level == "error": msg.fail(text)

# ── Config ────────────────────────────────────────────────────────────────────


# ── Paths ──────────────────────────────────────────────────────────────────────

DATA_DIR = Path(os.environ.get("AOS_FUEL_DATA_DIR", Path.home() / ".aos" / "fuel")).expanduser()
NUTRITION_DIR = DATA_DIR / "nutrition"

# ── Local I/O ──────────────────────────────────────────────────────────────────

def _load_log_local(date_str: str) -> dict:
    p = NUTRITION_DIR / f"{date_str}.json"
    if not p.exists():
        return {"date": date_str, "meals": [], "water_ml": 0}
    try:
        log = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise RuntimeError(f"Tageslog ist beschädigt: {p}; Datei wurde nicht überschrieben") from exc
    if not isinstance(log, dict):
        raise RuntimeError(f"Tageslog hat ein ungültiges Format: {p}; Datei wurde nicht überschrieben")
    if "meals" in log and not isinstance(log["meals"], list):
        raise RuntimeError(f"Tageslog meals ist keine Liste: {p}; Datei wurde nicht überschrieben")
    if any(not isinstance(meal, dict) for meal in log.get("meals", [])):
        raise RuntimeError(f"Tageslog meals enthält ungültige Einträge: {p}; Datei wurde nicht überschrieben")
    # Firestore-Pull kann das Datum auslassen; der Dateiname bleibt maßgeblich.
    log.setdefault("date", date_str)
    log.setdefault("meals", [])
    log.setdefault("water_ml", 0)
    return log

def _save_log_local(log: dict) -> None:
    NUTRITION_DIR.mkdir(parents=True, exist_ok=True)
    p = NUTRITION_DIR / f"{log['date']}.json"
    p.write_text(json.dumps(log, indent=2, ensure_ascii=False) + "\n")
    _sync_log_to_db(log)

# ── SQLite Sync (meals als Rows, id-basiert) ────────────────────────────────
# Schwester-Implementierung zu fuel-dev/src/server/services/nutrition-db.mjs
# (Node-Server schreibt dieselbe Tabelle). SQLite ist die normalisierte
# Row-Sicht auf denselben Tages-Log, JSON bleibt der Lesepfad fürs CLI.
# Grund: künftiger Firestore-Sync soll pro Meal-Row upserten können statt
# einen kompletten Tages-Blob zu überschreiben (siehe _merge_by_id-Fix in
# firestored/adapters/vitalos.py, 2026-07-23 — Datenverlust-Bug).

_DB_SCHEMA = """
CREATE TABLE IF NOT EXISTS meals (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL,
  catalog_id  TEXT,
  type        TEXT DEFAULT 'meal',
  description TEXT NOT NULL,
  notes       TEXT DEFAULT '',
  kcal        REAL DEFAULT 0,
  protein     REAL DEFAULT 0,
  carbs       REAL DEFAULT 0,
  fat         REAL DEFAULT 0,
  micros_json TEXT,
  logged_at   TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);

CREATE TABLE IF NOT EXISTS daily_water (
  date       TEXT PRIMARY KEY,
  water_ml   REAL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""


def _sync_log_to_db(log: dict) -> None:
    import sqlite3

    db_path = NUTRITION_DIR / "nutrition.db"
    try:
        con = sqlite3.connect(db_path)
        con.executescript(_DB_SCHEMA)

        existing_ids = {row[0] for row in con.execute(
            "SELECT id FROM meals WHERE date = ?", (log["date"],)
        )}
        current_ids = {m["id"] for m in log.get("meals", []) if m.get("id")}
        for stale_id in existing_ids - current_ids:
            con.execute("DELETE FROM meals WHERE id = ?", (stale_id,))

        for m in log.get("meals", []):
            meal_id = m.get("id")
            if not meal_id:
                # Alte Einträge ohne id (vor der id-Konvention) einzeln
                # überspringen statt den kompletten Tag zu verwerfen.
                gum_log("warn", f"Meal ohne id in {log['date']} übersprungen: {m.get('description')!r}")
                continue
            micros_json = json.dumps(m["micros"]) if m.get("micros") else None
            con.execute(
                """
                INSERT INTO meals (id, date, catalog_id, type, description, notes,
                                    kcal, protein, carbs, fat, micros_json, logged_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    date = excluded.date, catalog_id = excluded.catalog_id, type = excluded.type,
                    description = excluded.description, notes = excluded.notes,
                    kcal = excluded.kcal, protein = excluded.protein, carbs = excluded.carbs, fat = excluded.fat,
                    micros_json = excluded.micros_json, logged_at = excluded.logged_at,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    meal_id, log["date"], m.get("catalog_id"), m.get("type", "meal"),
                    m.get("description", ""), m.get("notes", ""),
                    m.get("kcal", 0), m.get("protein", 0), m.get("carbs", 0), m.get("fat", 0),
                    micros_json, m.get("logged_at") or m.get("time"),
                ),
            )

        con.execute(
            """
            INSERT INTO daily_water (date, water_ml) VALUES (?, ?)
            ON CONFLICT(date) DO UPDATE SET water_ml = excluded.water_ml, updated_at = CURRENT_TIMESTAMP
            """,
            (log["date"], log.get("water_ml", 0)),
        )
        con.commit()
        con.close()
    except Exception as e:
        gum_log("warn", f"nutrition.db Sync fehlgeschlagen: {e}")


def resync_db_from_json(nutrition_dir: Path) -> int:
    """Zieht alle Tages-JSONs eines nutrition/-Ordners erneut in dessen
    nutrition.db nach (idempotent — ON CONFLICT-Upsert). Für Drift-Fälle
    (z.B. Zeitraum in dem der Node/CLI-Sync-Code noch nicht aktiv war,
    oder manuelle JSON-Edits) statt Ad-hoc-Skripte im Bedarfsfall."""
    global NUTRITION_DIR
    prev = NUTRITION_DIR
    NUTRITION_DIR = nutrition_dir
    count = 0
    try:
        for f in sorted(nutrition_dir.glob("*.json")):
            log = _load_log_local(f.stem)
            if not log.get("meals"):
                continue
            _sync_log_to_db(log)
            count += 1
    finally:
        NUTRITION_DIR = prev
    return count


# ── Validation ─────────────────────────────────────────────────────────────────

class MealInput(BaseModel):
    model_config = ConfigDict(validate_assignment=True)
    description: str = Field(..., min_length=1)
    kcal: float = Field(0, ge=0)
    protein: float = Field(0, ge=0)
    carbs: float = Field(0, ge=0)
    fat: float = Field(0, ge=0)
    notes: str = Field("")

# Explizite Mengenangabe im Freitext ("200g", "0,5 l", "2 Stück", "1 Portion").
# Zweiter Zweig: führende blanke Stückzahl vor einem Wort ("5 Eier", "3 Bananen",
# "2 Semmeln") — die zählt genauso als explizite Menge, auch ohne Einheit-Token.
# Sonst warnt der Terminal-Hinweis "Menge nicht angegeben", obwohl Gemini/Haiku
# die Stückzahl sehr wohl exakt rechnet (Zutaten-Breakdown zeigt sie).
_QTY_IN_TEXT = _re.compile(
    r"\d+([.,]\d+)?\s*(g|gr|gramm|kg|ml|l|liter|stk|stück|stueck|portion|portionen|scheibe|scheiben|el|tl|tasse|becher)\b"
    r"|^\s*\d+\s+[^\d\s]",
    _re.IGNORECASE,
)
# Trockenwaren, die Gemini laut Prompt als Rohgewicht rechnet, sofern nicht
# "gekocht"/"cooked"/"zubereitet" dabeisteht — für den Hinweis im Terminal.
_DRY_GOODS = _re.compile(
    r"\b(reis|nudel|nudeln|pasta|spaghetti|penne|couscous|bulgur|quinoa|hafer|haferflocken|"
    r"linsen|bohnen|kichererbsen|mehl|griess|grieß|polenta)\b",
    _re.IGNORECASE,
)


def _fmt_micro_count(micros: dict) -> int:
    """Zahl der Mikronährstoffe mit einem Wert > 0."""
    return sum(1 for v in (micros or {}).values() if isinstance(v, (int, float)) and v > 0)


def _parse_macros_with_gemini(description: str) -> dict:
    """Vollschätzung über fuel.gemini: Makros + Mikros + Komponenten in EINEM Call.

    Früher lief hier nur estimate_macros_only — das warf Mikros und die
    Komponenten-Zerlegung weg, obwohl derselbe Gemini-/Haiku-Call sie
    ohnehin mitliefert. Jetzt wird das komplette Ergebnis zurückgegeben und
    von do_meal_log in Log-Eintrag + Catalog-Entry geschrieben (siehe
    save_meal). Multi-Key-Rotation bei HTTP 400/403/429 steckt weiterhin in
    call_gemini.

    Returns: {"macros": {...}, "micros": {...}, "components": [...], "_error"?: str}
    """
    result = _gemini_estimate(description, verify=True)
    macros = result.get("macros") or {}
    micros = result.get("micros") or {}
    components = result.get("components") or []
    kcal = macros.get("kcal", 0)

    if result.get("_error"):
        msg.warn(f"Gemini: {result['_error']}")
        return result

    if kcal > 0:
        msg.info(
            f"Gemini-Schätzung · {kcal:.0f} kcal · "
            f"{macros.get('protein', 0):.1f} EW / {macros.get('carbs', 0):.1f} KH / "
            f"{macros.get('fat', 0):.1f} Fett"
        )
        # Mengen-Annahme transparent machen.
        if _QTY_IN_TEXT.search(description):
            msg.info("  Menge: aus Text übernommen, exakt gerechnet")
        else:
            msg.warn("  Menge: nicht angegeben → Ø-Portion angenommen (Wert schwankt zwischen Läufen)")
        if _DRY_GOODS.search(description) and not _re.search(r"gekocht|cooked|zubereitet", description, _re.IGNORECASE):
            msg.warn("  Trockenware ohne \"gekocht\" → als Rohgewicht interpretiert (~Faktor 2,7 vs. gekocht)")
        if components:
            parts = ", ".join(
                f"{c.get('name', '?')} ({c.get('qty', '?')})" for c in components[:6]
            )
            msg.info(f"  Zutaten: {parts}")
        mc = _fmt_micro_count(micros)
        if mc:
            msg.info(f"  Micros: {mc} Werte geschätzt (Mahlzeitenebene, keine Zutaten-Auflösung)")

    return result

# ── Interactive Mode ───────────────────────────────────────────────────────────

def do_meal_interactive() -> None:
    """Interactive fzf catalog browser."""
    items = _catalog_load_meals()

    if not items:
        msg.warn("Catalog ist leer")
        raise SystemExit(1)

    fzf_items = []
    for item in items:
        kcal = item.get("kcal", 0)
        label = f"{item['name']:<40} {kcal:>4} kcal"
        fzf_items.append((label, item))

    fzf_input = "\n".join([label for label, _ in fzf_items])

    try:
        result = subprocess.run(
            ["fzf", "--header", "MEAL AUSWÄHLEN", "--height=15", "--layout=reverse"],
            input=fzf_input,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            raise SystemExit(0)

        selected_label = result.stdout.strip()
        selected_item = None
        for label, item in fzf_items:
            if label == selected_label:
                selected_item = item
                break

        if not selected_item:
            msg.fail("Item nicht gefunden")
            raise SystemExit(1)

        do_meal_log(selected_item["name"], selected_item.get("kcal", 0),
                    selected_item.get("protein", 0), selected_item.get("carbs", 0),
                    selected_item.get("fat", 0), "", None, False)

    except FileNotFoundError:
        msg.fail("fzf nicht gefunden")
        raise SystemExit(1)

# ── Meal Logging ───────────────────────────────────────────────────────────────

def do_meal_log(description: str, kcal: float, protein: float, carbs: float, fat: float, notes: str, day: str | None, save_catalog: bool, qty: int = 1, catalog_id: str | None = None, meal_type: str = "lunch", micros: dict | None = None, components: list | None = None, zeit: str | None = None) -> None:
    today = day or date.today().isoformat()
    qty = max(1, int(qty))
    micros = dict(micros) if micros else {}
    components = list(components) if components else []

    # Vorangestelltes Mahlzeit-Typ-Wort ("mittagessen: ...") setzt den meal_type
    # und fällt aus der Beschreibung raus — es ist ein Zeitpunkt, kein Name.
    _pfx_type, description = _split_meal_type_prefix(description)
    if _pfx_type:
        meal_type = _pfx_type

    if kcal == 0 and protein == 0 and carbs == 0 and fat == 0:
        # Lookup-first: Catalog-Hit spart Gemini-Call komplett
        if not catalog_id:
            hit = _catalog_find(description)
            if hit:
                m = _catalog_macros(hit)
                kcal, protein, carbs, fat = m["kcal"], m["protein"], m["carbs"], m["fat"]
                catalog_id = hit.get("id")
                # Zutaten-Bausteine (kind=ingredient) liegen pro yield_g (i.d.R. 100 g)
                # im Katalog — auf die in der Beschreibung genannte Grammzahl skalieren.
                _scale, _unit = 1.0, "Stück"
                if hit.get("kind") == "ingredient" and hit.get("yield_g"):
                    _grams = _amount_to_grams(description)
                    if _grams:
                        _scale = _grams / float(hit["yield_g"])
                        kcal, protein, carbs, fat = kcal * _scale, protein * _scale, carbs * _scale, fat * _scale
                        _unit = f"{_grams:.0f} g"
                # Gespeicherte Mikros aus dem Catalog-Hit übernehmen (wurden bisher
                # bei jedem Hit verworfen → Log ohne Mikros) und mitskalieren.
                hit_micros = hit.get("micros") or {}
                if hit_micros and not micros:
                    micros = {k: v * _scale for k, v in hit_micros.items()
                              if isinstance(v, (int, float)) and v > 0}
                msg.good(f"Catalog-Hit: {hit['name']} ({kcal:.0f} kcal / {_unit}) — kein Gemini-Call")
        if kcal == 0:
            with Console().status(f"[cyan]Gemini schätzt Nährwerte für '{description}'...[/cyan]", spinner="dots"):
                est = _parse_macros_with_gemini(description)

            macros = est.get("macros") or {}
            kcal, protein, carbs, fat = macros.get("kcal", 0), macros.get("protein", 0), macros.get("carbs", 0), macros.get("fat", 0)
            # Mikros + Komponenten aus demselben Call übernehmen (wurden früher verworfen).
            est_micros = {k: v for k, v in (est.get("micros") or {}).items() if isinstance(v, (int, float)) and v > 0}
            if est_micros:
                micros = est_micros
            if est.get("components"):
                components = est["components"]

            if kcal == 0 and protein == 0 and carbs == 0 and fat == 0:
                msg.fail("Gemini konnte die Makros nicht schätzen (Netzwerkfehler oder ungültige Antwort). Abbruch.")
                raise SystemExit(1)

    if qty > 1:
        kcal, protein, carbs, fat = kcal * qty, protein * qty, carbs * qty, fat * qty
        if micros:
            micros = {k: v * qty for k, v in micros.items()}

    try:
        MealInput(description=description, kcal=kcal, protein=protein, carbs=carbs, fat=fat, notes=notes)
    except ValidationError as e:
        msg.fail(f"Validation error: {e.error_count()} Fehler")
        raise SystemExit(1)

    if zeit:
        try:
            h, m = (int(p) for p in zeit.split(":", 1))
            local_dt = datetime.now().astimezone().replace(
                hour=h, minute=m, second=0, microsecond=0
            )
            now_iso = local_dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        except (ValueError, TypeError):
            msg.fail(f"Ungültige --zeit '{zeit}' (erwartet HH:MM) — nutze aktuelle Uhrzeit.")
            now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    else:
        now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    meal_entry = {
        "id": f"meal_{uuid4().hex}",
        "catalog_id": catalog_id,
        "type": meal_type,
        "description": f"{qty}x {description}" if qty > 1 else description,
        "notes": notes,
        "kcal": kcal, "protein": protein, "carbs": carbs, "fat": fat,
        "time": now_iso,
    }
    if micros:
        meal_entry["micros"] = micros
        meal_entry["micros_meta"] = {
            "source": "gemini",
            "method": "meal_estimate",  # ganze Mahlzeit geschätzt, nicht aus Zutaten summiert
            "resolved_at": now_iso,
        }
    if components:
        meal_entry["components"] = _normalize_components(components)

    # Direkter Dateizugriff — kein Node-Server als Dependency für das Python
    # CLI-Tool. War vorher _api_call("POST", "/nutrition/log", ...) über HTTP;
    # das koppelte den Log-Schreibpfad an einen laufenden Server-Prozess
    # (und dessen Arbeitsverzeichnis — /opt/fuel bei Prod statt Repo-Checkout).
    log = _load_log_local(today)
    log["meals"].append(meal_entry)
    _save_log_local(log)
    msg.good(f"{description} ({kcal:.0f} kcal) geloggt — {today}")

    # Tages-Zwischensumme nach dem Loggen.
    day_meals = log.get("meals", [])
    d_kcal = sum(m.get("kcal", 0) or 0 for m in day_meals)
    d_p = sum(m.get("protein", 0) or 0 for m in day_meals)
    d_c = sum(m.get("carbs", 0) or 0 for m in day_meals)
    d_f = sum(m.get("fat", 0) or 0 for m in day_meals)
    msg.info(
        f"  Tag {today}: {len(day_meals)} Mahlzeit(en) · {d_kcal:.0f} kcal · "
        f"{d_p:.0f} EW / {d_c:.0f} KH / {d_f:.0f} Fett"
    )

    # Nur echte Neu-Schätzungen in den Catalog schreiben. Kam die Mahlzeit aus
    # einem Catalog-Hit (catalog_id gesetzt), sind die Makros nur eine Kopie
    # eines vorhandenen Eintrags — sie unter einem neuen Slug erneut zu
    # speichern erzeugt Near-Duplikate und schleppt bei zu lockerem Match
    # (z.B. "Reis mit Brokkoli und 5 Eiern" → Hit auf "Reis mit Brokkoli")
    # den falschen Wert weiter.
    if save_catalog and not catalog_id:
        catalog_name = _clean_catalog_name(description)
        new_id = _catalog_save(
            catalog_name,
            {"kcal": kcal/qty, "protein": protein/qty, "carbs": carbs/qty, "fat": fat/qty},
            micros={k: v / qty for k, v in micros.items()} if micros else None,
            components=components or None,
        )
        msg.info(f"Zum Catalog hinzugefügt: {catalog_name} (id={new_id})")

def do_today(day: str | None) -> None:
    today = day or date.today().isoformat()
    meals = _load_log_local(today).get("meals", [])

    if not meals:
        console.print(f"[yellow]Keine Mahlzeiten geloggt am {today}[/yellow]")
        return

    table = Table(title=f"Mahlzeiten — {today}", show_header=True, header_style="bold green")
    table.add_column("MAHLZEIT")
    table.add_column("KCAL", justify="right")
    table.add_column("P", justify="right")
    table.add_column("K", justify="right")
    table.add_column("F", justify="right")

    for m in meals:
        table.add_row(m["description"], f"{m['kcal']:.0f}", f"{m['protein']:.1f}g", f"{m['carbs']:.1f}g", f"{m['fat']:.1f}g")
    
    console.print(table)

def do_unlog(day: str | None) -> None:
    target_day = day or date.today().isoformat()
    meals = _load_log_local(target_day).get("meals", [])

    if not meals:
        msg.warn(f"Keine Einträge am {target_day} zum Löschen.")
        return

    fzf_lines = []
    for m in meals:
        line = f"{m['id']} | {m['description']} ({m.get('kcal',0)} kcal)"
        fzf_lines.append(line)

    try:
        result = subprocess.run(
            ["fzf", "--header", f"MAHLZEIT LÖSCHEN ({target_day})", "--height=15", "--layout=reverse"],
            input="\n".join(fzf_lines),
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            return

        selected_line = result.stdout.strip()
        if not selected_line:
            return

        delete_id = selected_line.split("|")[0].strip()

        log = _load_log_local(target_day)
        tombstones = _tomb_load(target_day)
        log["meals"] = [m for m in log["meals"] if m["id"] != delete_id]
        _save_log_local(log)
        _tomb_save(target_day, tombstones + [delete_id])
        msg.good(f"Mahlzeit {delete_id} gelöscht.")

    except FileNotFoundError:
        msg.fail("fzf nicht gefunden")
        raise SystemExit(1)

# ── Meal verschieben (Tag → Tag) ──────────────────────────────────────────────
# Tombstones spiegeln src/server/services/log-tombstones.mjs: ein aus dem
# Tageslog entferntes Meal muss in <date>.deleted.json unter deleted_meal_ids
# stehen, sonst holt der stündliche Firestore-Merge (firestore-admin.mjs) es
# beim nächsten Lauf wieder zurück.

def _tomb_path(date_str: str) -> Path:
    return NUTRITION_DIR / f"{date_str}.deleted.json"


def _tomb_load(date_str: str) -> list[str]:
    p = _tomb_path(date_str)
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError, OSError) as exc:
        raise RuntimeError(f"Meal-Tombstones sind beschädigt: {p}; Datei wurde nicht überschrieben") from exc
    ids = data.get("deleted_meal_ids") if isinstance(data, dict) else None
    if not isinstance(ids, list) or any(not isinstance(value, str) for value in ids):
        raise RuntimeError(f"Meal-Tombstones haben ein ungültiges Format: {p}; Datei wurde nicht überschrieben")
    return [value for value in ids if value]


def _tomb_save(date_str: str, ids: list[str]) -> None:
    NUTRITION_DIR.mkdir(parents=True, exist_ok=True)
    _tomb_path(date_str).write_text(json.dumps({
        "deleted_meal_ids": sorted({x for x in ids if x}),
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }, ensure_ascii=False, indent=2) + "\n")


def do_meal_move(from_day: str, to_day: str, meal_id: str | None = None) -> None:
    """Verschiebt eine Mahlzeit (inkl. Makros/Mikros/Komponenten) von from_day
    nach to_day: aus dem Quelltag entfernen + Tombstone, Zeitstempel umdatieren
    (Uhrzeit bleibt), in den Zieltag einsortieren."""
    if from_day == to_day:
        msg.warn(f"Quell- und Zieltag identisch ({from_day}) — nichts zu tun.")
        return

    src = _load_log_local(from_day)
    src_meals = src.get("meals", [])
    if not src_meals:
        msg.warn(f"Keine Mahlzeiten am {from_day}.")
        raise SystemExit(1)

    if meal_id is None:
        fzf_lines = [
            f"{m['id']} | {m.get('description', '—')} ({m.get('kcal', 0) or 0:.0f} kcal)"
            for m in src_meals
        ]
        try:
            result = subprocess.run(
                ["fzf", "--header", f"VERSCHIEBEN  {from_day} → {to_day}",
                 "--height=15", "--layout=reverse"],
                input="\n".join(fzf_lines), capture_output=True, text=True,
            )
        except FileNotFoundError:
            msg.fail("fzf nicht gefunden — --id <meal_id> angeben")
            raise SystemExit(1)
        if result.returncode != 0 or not result.stdout.strip():
            return
        meal_id = result.stdout.strip().split("|")[0].strip()

    meal = next((m for m in src_meals if m.get("id") == meal_id), None)
    if meal is None:
        msg.fail(f"Meal {meal_id} nicht am {from_day} gefunden.")
        raise SystemExit(1)

    # Read and validate the destination before removing the source entry.
    dst = _load_log_local(to_day)
    dst_meals = dst.get("meals", [])
    from_tombstones = _tomb_load(from_day)
    to_tombstones = _tomb_load(to_day)

    # 1. aus Quelltag entfernen + Tombstone
    src["meals"] = [m for m in src_meals if m.get("id") != meal_id]
    _save_log_local(src)
    _tomb_save(from_day, from_tombstones + [meal_id])

    # 2. Zeitstempel auf den Zieltag umdatieren (Uhrzeit behalten)
    _retime_meal(meal, to_day)

    # 3. in Zieltag einfügen (bei ID-Kollision neue ID)
    if any(m.get("id") == meal_id for m in dst_meals):
        meal["id"] = f"meal_{uuid4().hex}"
    dst_meals.append(meal)
    dst_meals.sort(key=lambda m: m.get("time", ""))
    dst["meals"] = dst_meals
    _save_log_local(dst)
    _tomb_save(to_day, [value for value in to_tombstones if value != meal_id])

    msg.good(f"{meal.get('description', '—')} ({meal.get('kcal', 0) or 0:.0f} kcal) "
             f"verschoben: {from_day} → {to_day}")
    d_kcal = sum(m.get("kcal", 0) or 0 for m in dst_meals)
    msg.info(f"  {to_day}: {len(dst_meals)} Mahlzeit(en) · {d_kcal:.0f} kcal")

# ── Meal wiederholen (Tag → Tag, Quelle bleibt erhalten) ────────────────────────
# Wie do_meal_move, nur dass der Quelltag unangetastet bleibt — kein Tombstone,
# kein Entfernen. Deckt den Alltagsfall "das hab ich gestern schon gegessen,
# heute wieder" ab, ohne über den vollen Beschreibungstext neu zu gehen.

def do_meal_repeat(from_day: str, to_day: str, meal_id: str | None = None, qty: int = 1) -> None:
    """Kopiert eine Mahlzeit (inkl. Makros/Mikros/Komponenten) von from_day nach
    to_day, Quelltag bleibt unverändert. qty skaliert die Makros zusätzlich."""
    src = _load_log_local(from_day)
    src_meals = src.get("meals", [])
    if not src_meals:
        msg.warn(f"Keine Mahlzeiten am {from_day}.")
        raise SystemExit(1)

    if meal_id is None:
        fzf_lines = [
            f"{m['id']} | {m.get('description', '—')} ({m.get('kcal', 0) or 0:.0f} kcal)"
            for m in src_meals
        ]
        try:
            result = subprocess.run(
                ["fzf", "--header", f"WIEDERHOLEN  {from_day} → {to_day}",
                 "--height=15", "--layout=reverse"],
                input="\n".join(fzf_lines), capture_output=True, text=True,
            )
        except FileNotFoundError:
            msg.fail("fzf nicht gefunden — --id <meal_id> angeben")
            raise SystemExit(1)
        if result.returncode != 0 or not result.stdout.strip():
            return
        meal_id = result.stdout.strip().split("|")[0].strip()

    meal = next((m for m in src_meals if m.get("id") == meal_id), None)
    if meal is None:
        msg.fail(f"Meal {meal_id} nicht am {from_day} gefunden.")
        raise SystemExit(1)

    copy = dict(meal)
    qty = max(1, int(qty))
    if qty > 1:
        copy["description"] = f"{qty}x {meal.get('description', '—')}"
        for k in ("kcal", "protein", "carbs", "fat"):
            copy[k] = (copy.get(k) or 0) * qty
        if copy.get("micros"):
            copy["micros"] = {k: v * qty for k, v in copy["micros"].items()}

    copy["id"] = f"meal_{uuid4().hex}"
    _retime_meal(copy, to_day)

    dst = _load_log_local(to_day)
    dst_meals = dst.get("meals", [])
    dst_meals.append(copy)
    dst_meals.sort(key=lambda m: m.get("time", ""))
    dst["meals"] = dst_meals
    _save_log_local(dst)

    msg.good(f"{copy.get('description', '—')} ({copy.get('kcal', 0) or 0:.0f} kcal) "
             f"wiederholt: {from_day} → {to_day}")
    d_kcal = sum(m.get("kcal", 0) or 0 for m in dst_meals)
    msg.info(f"  {to_day}: {len(dst_meals)} Mahlzeit(en) · {d_kcal:.0f} kcal")


def _retime_meal(meal: dict, target_day: str) -> None:
    """Update all meal timestamps while preserving clock and UTC offset."""
    timestamp = meal.get("logged_at") or meal.get("time")
    try:
        parsed = datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
        value = datetime.combine(date.fromisoformat(target_day), parsed.timetz()).isoformat()
    except (TypeError, ValueError):
        value = f"{target_day}T12:00:00Z"
    meal["time"] = value
    if "logged_at" in meal:
        meal["logged_at"] = value

# ── Typer App ──────────────────────────────────────────────────────────────────

app = typer.Typer(help="Meal Logging CLI — ohne Subcommand: interaktiver Catalog-Browser (fzf)")

@app.command(name="unlog")
def unlog_command(
    tag:        str | None = typer.Option(None, "--tag", help="Datum: heute|gestern|vorgestern|-N|Mo|YYYY-MM-DD"),
    gestern:    bool       = typer.Option(False, "--gestern", "-g"),
    vorgestern: bool       = typer.Option(False, "--vorgestern"),
    day:        str | None = typer.Option(None, "--day", "-d", help="(legacy) Datum YYYY-MM-DD"),
) -> None:
    """Entferne einen Mahlzeiten-Eintrag interaktiv."""
    try:
        target = _resolve_date(tag=tag, gestern=gestern, vorgestern=vorgestern, day_legacy=day)
    except ValueError as e:
        msg.fail(str(e)); raise typer.Exit(1)
    do_unlog(target)

@app.command(name="move")
def move_command(
    to:      str        = typer.Option(..., "--to", "-t", help="Zieltag: heute|gestern|vorgestern|-N|Mo|YYYY-MM-DD"),
    frm:     str        = typer.Option("heute", "--from", "-f", help="Quelltag (Default: heute)"),
    meal_id: str | None = typer.Option(None, "--id", help="Meal-ID direkt (sonst fzf-Auswahl aus dem Quelltag)"),
) -> None:
    """Eine Mahlzeit von einem Tag auf einen anderen verschieben.

    Verschiebt den kompletten Eintrag (Makros/Mikros/Komponenten), datiert den
    Zeitstempel auf den Zieltag um und setzt am Quelltag einen Tombstone, damit
    der Firestore-Sync das Entfernen übernimmt.

    Beispiele:
      fuel-meal move --to gestern
      fuel-meal move --from heute --to 2026-09-05 --id meal_1788849645857
    """
    try:
        from_day = _resolve_one(frm)
        to_day = _resolve_one(to)
    except ValueError as e:
        msg.fail(str(e)); raise typer.Exit(1)
    do_meal_move(from_day, to_day, meal_id)

@app.command(name="repeat")
def repeat_command(
    frm:     str        = typer.Option("gestern", "--from", "-f", help="Quelltag (Default: gestern)"),
    to:      str        = typer.Option("heute", "--to", "-t", help="Zieltag (Default: heute)"),
    meal_id: str | None = typer.Option(None, "--id", help="Meal-ID direkt (sonst fzf-Auswahl aus dem Quelltag)"),
    qty:     int         = typer.Option(1, "--qty", "-q", help="Portionen-Multiplikator — Makros × N"),
) -> None:
    """Eine Mahlzeit von einem Tag auf einen anderen KOPIEREN (Quelltag bleibt erhalten).

    Für "das hab ich gestern schon gegessen, heute wieder" — im Unterschied zu
    `move` bleibt der Quelltag unverändert.

    Beispiele:
      fuel-meal repeat                          # fzf-Auswahl aus gestern → heute
      fuel-meal repeat --from 2026-09-05 --to heute --id meal_1788849645857
    """
    try:
        from_day = _resolve_one(frm)
        to_day = _resolve_one(to)
    except ValueError as e:
        msg.fail(str(e)); raise typer.Exit(1)
    do_meal_repeat(from_day, to_day, meal_id, qty)

@app.command(name="remicros")
def remicros_command(
    meal_id:    str | None = typer.Option(None, "--id", help="Meal-ID im Tageslog (entfällt, wenn der Tag nur eine Mahlzeit hat)"),
    catalog:    str | None = typer.Option(None, "--catalog", help="Catalog-Meal-ID statt Log-Eintrag"),
    tag:        str | None = typer.Option(None, "--tag", help="Datum: heute|gestern|vorgestern|-N|Mo|YYYY-MM-DD"),
    gestern:    bool       = typer.Option(False, "--gestern", "-g"),
    vorgestern: bool       = typer.Option(False, "--vorgestern"),
    dry_run:    bool       = typer.Option(False, "--dry-run", "-n", help="Nur anzeigen, nichts schreiben"),
) -> None:
    """Mikros einer Mahlzeit aus ihren `components` neu berechnen.

    Für den Fall, dass Mengen/Komponenten nachträglich korrigiert wurden und die
    Mikros noch zur alten Schätzung gehören. Komponenten mit Catalog-Baustein
    werden skaliert (fehlen dessen Mikros, werden sie einmalig ermittelt und im
    Catalog gespeichert), nur der Rest wird geschätzt.

    Beispiele:
      fuel-meal remicros --tag heute
      fuel-meal remicros --gestern --id meal_ab12…
      fuel-meal remicros --catalog meal_4_bio_debreziner_von_ja_naturlich_mit_bissl_dachsteinbrot_un
    """
    from .catalog_lookup import update_catalog_item
    from .micros import recompute_entry

    if catalog:
        entry = next((m for m in _catalog_load_meals() if m.get("id") == catalog), None)
        if entry is None:
            msg.fail(f"Catalog-Eintrag {catalog} nicht gefunden"); raise typer.Exit(1)
        label = entry.get("name", catalog)
        day_log = None
    else:
        try:
            target = _resolve_date(tag=tag, gestern=gestern, vorgestern=vorgestern, day_legacy=None)
        except ValueError as e:
            msg.fail(str(e)); raise typer.Exit(1)
        day_log = _load_log_local(target)
        meals = day_log.get("meals", [])
        if meal_id is None and len(meals) == 1:
            entry = meals[0]
        else:
            entry = next((m for m in meals if m.get("id") == meal_id), None)
        if entry is None:
            ids = ", ".join(m.get("id", "?") for m in meals) or "keine Mahlzeiten"
            msg.fail(f"Mahlzeit nicht eindeutig/gefunden am {target} — --id angeben ({ids})"); raise typer.Exit(1)
        label = entry.get("description", entry.get("id", "?"))

    with Console().status("[cyan]Berechne Mikros neu...[/cyan]", spinner="dots"):
        result = recompute_entry(entry)
    if result is None:
        msg.warn(f"{label}: keine components oder keine Mikros ermittelbar — nichts geändert"); raise typer.Exit(1)
    fields, info = result

    old_n = _fmt_micro_count(entry.get("micros") or {})
    msg.info(f"{label}: Mikros {old_n} → {_fmt_micro_count(fields['micros'])} Werte")
    if info["from_catalog"]:
        msg.info(f"  aus Catalog: {', '.join(info['from_catalog'])}")
    if info["created"]:
        msg.info(f"  Baustein-Mikros neu ermittelt + gespeichert: {', '.join(info['created'])}")
    if info["estimated"]:
        msg.warn(f"  geschätzt (kein Baustein): {', '.join(info['estimated'])}")
    if info["missing"]:
        msg.warn(f"  FEHLEN (Summe unvollständig): {', '.join(info['missing'])}")
    if dry_run:
        msg.info("Dry-Run — nichts geschrieben"); return

    if catalog:
        update_catalog_item(catalog, fields)
    else:
        entry.update(fields)
        _save_log_local(day_log)
    msg.good("Mikros aktualisiert")

@app.callback(invoke_without_command=True)
def _app_callback(ctx: typer.Context) -> None:
    if ctx.invoked_subcommand is None:
        do_meal_interactive()

@app.command(name="log")
def log_command(
    description: str = typer.Argument(..., help="Mahlzeit-Beschreibung — ohne Makros: Gemini schätzt automatisch"),
    kcal: float = typer.Option(0, "--kcal", help="Kalorien (kcal)"),
    protein: float = typer.Option(0, "--protein", help="Protein (g)"),
    carbs: float = typer.Option(0, "--carbs", help="Kohlenhydrate (g)"),
    fat: float = typer.Option(0, "--fat", help="Fett (g)"),
    notes: str = typer.Option("", "--notes", "-n", help="Optionale Notiz"),
    tag:        str | None = typer.Option(None, "--tag", help="Datum: heute|gestern|vorgestern|-N|Mo|YYYY-MM-DD"),
    gestern:    bool       = typer.Option(False, "--gestern", "-g"),
    vorgestern: bool       = typer.Option(False, "--vorgestern"),
    day: str = typer.Option(None, "--day", "-d", hidden=True),
    save_catalog: bool = typer.Option(False, "--save-catalog", "-s", help="Im Catalog speichern für spätere Wiederverwendung"),
    qty: int = typer.Option(1, "--qty", "-q", help="Portionen-Multiplikator — Makros × N"),
    meal_type: str = typer.Option("lunch", "--meal-type", "-m", help="breakfast|lunch|dinner|snack"),
    zeit: str | None = typer.Option(None, "--zeit", "-z", help="Explizite Uhrzeit HH:MM (statt 'jetzt')"),
) -> None:
    """Einzelne Mahlzeit loggen. Reihenfolge: --kcal (falls gesetzt) → Catalog-Hit → Gemini-Schätzung.

    Beispiele:
      fuel-meal log "Käsekrainer 330g"
      fuel-meal log "Nussschnecke" --kcal 250 --protein 4
      fuel-meal log "Toast mit Ei" --gestern --meal-type breakfast --save-catalog
    """
    try:
        target = _resolve_date(tag=tag, gestern=gestern, vorgestern=vorgestern, day_legacy=day)
    except ValueError as e:
        msg.fail(str(e)); raise typer.Exit(1)

    # Explizite Flags haben immer Vorrang. Nur wenn KEIN Datums-Flag gesetzt
    # wurde, nach einem Datumswort im Freitext suchen ("gestern hab ich X
    # gegessen") — sonst landet ein "gestern" in der Beschreibung fälschlich
    # auf dem heutigen Datum, weil es sonst nirgends ausgewertet wird.
    if not (tag or gestern or vorgestern or day):
        hint_date, cleaned = _extract_date_hint(description)
        if hint_date:
            target = hint_date
            description = cleaned
            msg.info(f"Datumswort erkannt: Log-Datum → {target}")

    no_macros = kcal == 0 and protein == 0 and carbs == 0 and fat == 0
    # Ein Baustein (kind=ingredient) ist keine Portion: "60dag Dachsteinbrot" muss in den Parser.
    _hit = _catalog_find(description) if no_macros and qty == 1 else None
    if no_macros and qty == 1 and _parse.looks_complex(description) and (_hit is None or _hit.get("kind") == "ingredient"):
        if _log_parsed(description, notes, target, bool(tag or gestern or vorgestern or day),
                       save_catalog, meal_type, zeit):
            return

    do_meal_log(description, kcal, protein, carbs, fat, notes, target, save_catalog, qty, meal_type=meal_type, zeit=zeit)


def _log_parsed(description: str, notes: str, target: str, day_explicit: bool,
                save_catalog: bool, meal_type: str, zeit: str | None) -> bool:
    """Freitext zerlegen (fuel.parse) → pro Mahlzeit Zutaten auflösen → loggen.

    False = Parsen/Auflösen unmöglich, bevor irgendetwas geloggt wurde → Aufrufer
    nimmt den bisherigen Ein-Call-Pfad. Explizite CLI-Flags (Tag, Zeit,
    Mahlzeit-Typ) schlagen immer das, was aus dem Text gelesen wurde.
    """
    with Console().status("[cyan]Zerlege Beschreibung...[/cyan]", spinner="dots"):
        parsed = _parse.parse_input(description)
    if not parsed:
        return False

    resolved_all = []
    for pm in parsed.meals:
        with Console().status(f"[cyan]Löse Zutaten auf: {pm.text[:50]}...[/cyan]", spinner="dots"):
            res = _parse.resolve_meal(pm)
        if res is None:
            msg.warn(f"Zutaten nicht auflösbar ({pm.text[:50]!r}) — alter Pfad")
            return False
        resolved_all.append((pm, res))

    if len(resolved_all) > 1:
        msg.info(f"{len(resolved_all)} Mahlzeiten erkannt")
    for pm, res in resolved_all:
        m = res.macros
        msg.info(f"Zerlegt · {m['kcal']:.0f} kcal · {m['protein']:.1f} EW / {m['carbs']:.1f} KH / {m['fat']:.1f} Fett")
        for line in res.notes:
            (msg.warn if ("GESCHÄTZT" in line or "fehlen" in line) else msg.info)(f"  {line}")
        do_meal_log(
            pm.text, m["kcal"], m["protein"], m["carbs"], m["fat"], notes,
            target if day_explicit else (pm.resolved_day() or target),
            # Einzelzutat ("850ml Hohes C") ist schon als Baustein im Catalog — ein
            # zweiter Eintrag mit der Menge im Namen wäre nur ein Near-Duplikat.
            save_catalog and len(pm.items) > 1, 1,
            meal_type=meal_type if meal_type != "lunch" else (pm.meal_type or meal_type),
            micros=res.micros, components=res.components,
            zeit=zeit or pm.time,
        )
    return True

@app.command(name="narrative")
def narrative_command(
    text: str = typer.Argument(..., help="Freitext: '4 Teller Nachmittag bis Abend: 250g Reis, Gemüse, Chicken'"),
    tag:        str | None = typer.Option(None, "--tag", help="Datum: heute|gestern|vorgestern|-N|Mo|YYYY-MM-DD"),
    gestern:    bool       = typer.Option(False, "--gestern", "-g"),
    vorgestern: bool       = typer.Option(False, "--vorgestern"),
    day:        str | None = typer.Option(None, "--day", "-d", hidden=True),
    save_catalog: bool     = typer.Option(False, "--save-catalog", "-s", help="Gericht als Catalog-Eintrag speichern"),
    dry_run:    bool       = typer.Option(False, "--dry-run", "-n", help="Vorschau — nichts loggen"),
) -> None:
    """Freitext → mehrere Mahlzeit-Einträge. Gemini schätzt Gesamt-Makros und teilt auf N Teller/Portionen auf."""
    try:
        target = _resolve_date(tag=tag, gestern=gestern, vorgestern=vorgestern, day_legacy=day)
    except ValueError as e:
        msg.fail(str(e)); raise typer.Exit(1)

    if not (tag or gestern or vorgestern or day):
        hint_date, cleaned = _extract_date_hint(text)
        if hint_date:
            target = hint_date
            text = cleaned
            msg.info(f"Datumswort erkannt: Log-Datum → {target}")

    parsed = _parse_narrative(text)
    if not parsed.items_text:
        msg.fail("Keine Items in der Beschreibung erkannt"); raise typer.Exit(1)

    msg.info(f"Erkannt: {parsed.count} Teller · Fenster {parsed.time_window or 'kein'} · Items: {parsed.items_text}")

    # Lookup-first: Catalog-Match → stored per-unit macros, null Gemini
    catalog_hit = _catalog_find(parsed.items_text)
    catalog_id: str | None = None
    catalog_name = _clean_catalog_name(parsed.items_text)

    if catalog_hit:
        m = _catalog_macros(catalog_hit)
        per_kcal, per_protein, per_carbs, per_fat = m["kcal"], m["protein"], m["carbs"], m["fat"]
        catalog_id = catalog_hit.get("id")
        catalog_name = catalog_hit.get("name") or catalog_name
        msg.good(f"Catalog-Hit: {catalog_name} ({per_kcal:.0f} kcal/Teller) — kein Gemini-Call")
    else:
        with Console().status(f"[cyan]Gemini schätzt Makros für '{parsed.items_text}'...[/cyan]", spinner="dots"):
            macros = _gemini_macros(parsed.items_text)
        if macros.get("_error"):
            msg.fail(f"Gemini-Fehler: {macros['_error']}"); raise typer.Exit(1)
        per_kcal    = macros["kcal"]    / parsed.count
        per_protein = macros["protein"] / parsed.count
        per_carbs   = macros["carbs"]   / parsed.count
        per_fat     = macros["fat"]     / parsed.count
        console.print(f"[bold]Gesamt:[/bold] {macros['kcal']:.0f} kcal · {macros['protein']:.1f}P · {macros['carbs']:.1f}C · {macros['fat']:.1f}F")

    times = _spread_times(parsed.count, parsed.time_window)
    console.print(f"[bold]Pro Teller:[/bold] {per_kcal:.0f} kcal · {per_protein:.1f}P · {per_carbs:.1f}C · {per_fat:.1f}F")

    # Catalog-Enhancement: bei Miss + --save-catalog → 1× discover + POST → catalog_id
    if save_catalog and not dry_run and not catalog_id:
        with Console().status("[cyan]Gemini extrahiert kanonischen Namen...[/cyan]", spinner="dots"):
            disc = _gemini_discover(parsed.items_text)
        if disc.get("error"):
            msg.warn(f"discover: {disc['error']} — fallback lokaler Name")
        else:
            entry = disc.get("catalog_entry") or {}
            name = (entry.get("name") or "").strip()
            if disc.get("type") == "meal" and name:
                catalog_name = name
        catalog_id = _catalog_save(catalog_name, {
            "kcal": per_kcal, "protein": per_protein, "carbs": per_carbs, "fat": per_fat,
        })
        msg.good(f"Catalog: '{catalog_name}' (id={catalog_id})")

    for i, t in enumerate(times, 1):
        slot = f" ~{t}" if t else ""
        # Saubere Description: Catalog-Name + Instance-Suffix (oder items_text wenn kein Catalog)
        base = catalog_name if catalog_id else parsed.items_text
        desc = f"{base} (Teller {i}/{parsed.count}{slot})"
        note = f"Teller {i}/{parsed.count}{slot}"
        if dry_run:
            console.print(f"  [dim]would log:[/dim] {desc}  →  {per_kcal:.0f}kcal/{per_protein:.1f}P/{per_carbs:.1f}C/{per_fat:.1f}F")
            continue
        do_meal_log(
            description=desc,
            kcal=per_kcal, protein=per_protein, carbs=per_carbs, fat=per_fat,
            notes=note, day=target,
            save_catalog=False,  # Catalog wurde 1× oben angelegt
            qty=1,
            catalog_id=catalog_id,
        )


@app.command(name="list")
def list_command() -> None:
    """Alle gespeicherten Mahlzeiten im Catalog anzeigen.

    Funktionsname != "list": ein Modul-Level `def list` überschreibt das Builtin
    und ließ isinstance(..., list) in _load_log_local abstürzen, sobald ein
    Tageslog existierte.
    """
    items = _catalog_load_meals()
    table = Table(title="Meal Catalog", show_header=True, header_style="bold magenta")
    table.add_column("NAME")
    table.add_column("KCAL", justify="right")
    for i in items:
        table.add_row(i["name"], f"{i.get('kcal',0):.0f}")
    console.print(table)

@app.command()
def today(
    tag:        str | None = typer.Option(None, "--tag", help="Datum: heute|gestern|vorgestern|-N|Mo|YYYY-MM-DD"),
    gestern:    bool       = typer.Option(False, "--gestern", "-g"),
    vorgestern: bool       = typer.Option(False, "--vorgestern"),
    day: str = typer.Option(None, "--day", "-d", hidden=True),
):
    """Gebuchte Mahlzeiten für heute (oder ein anderes Datum) anzeigen."""
    try:
        target = _resolve_date(tag=tag, gestern=gestern, vorgestern=vorgestern, day_legacy=day)
    except ValueError as e:
        msg.fail(str(e)); raise typer.Exit(1)
    do_today(target)


def main() -> None:
    app()


if __name__ == "__main__":
    main()
