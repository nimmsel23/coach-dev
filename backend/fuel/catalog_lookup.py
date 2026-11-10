"""Catalog-Lookup: matcht User-Input gegen vorhandene Meal-Catalog-Einträge.

Ziel: vor jedem Gemini-Call erst Catalog durchsuchen. Bei Hit → stored
Per-Unit-Makros nutzen, null Gemini-Calls verbrauchen.
"""

from __future__ import annotations

import json
import os
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from loguru import logger

from . import log as _log
from .paths import REPO_DIR

_log.setup()

REPO_CATALOG_DIR = REPO_DIR / "catalogs" / "nutrition" / "meals"
FUEL_DATA_DIR = Path(os.getenv("AOS_FUEL_DATA_DIR", str(Path.home() / ".aos" / "fuel"))).expanduser()
DEFAULT_UID = os.getenv("FUEL_CLOUD_UID", "default")

# Wörter, die in Catalog-Namen typisch für "schlechte" Einträge mit Mengen sind
_QUANTITY_NOISE = re.compile(r"\d+\s*(g|gr|gramm|ml|stk|stück|x)\b", re.IGNORECASE)

# Verbindungs-/Füllwörter + Mengeneinheiten, die NICHT als inhaltliche
# Abweichung zwischen Query und Catalog-Name zählen.
_MATCH_STOPWORDS = frozenset({
    "mit", "und", "dazu", "plus", "sowie", "an", "auf", "aus", "von", "im", "in",
    "der", "die", "das", "ein", "eine", "einen", "einem", "einer", "etwas",
    "mein", "meine", "meinen", "noch", "dann", "extra", "bitte",
    "g", "gr", "gramm", "kg", "ml", "l", "liter", "stk", "stueck", "stück",
    "portion", "portionen", "scheibe", "scheiben", "el", "tl", "tasse", "becher", "x",
})


def _normalize(s: str) -> str:
    """Lowercase, Umlaute strip, nur a-z0-9 + Space, mehrfach-Space kollabiert."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    # ß → ss
    s = s.replace("ß", "ss")
    # Plural-Stripping (einfach): trailing 'n' bei >5 chars
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    s = re.sub(r"\s+", " ", s)
    return s


def _singularize(token: str) -> str:
    """Naives Plural→Singular für DE: 'semmeln' → 'semmel', 'eier' → 'ei' etc."""
    if len(token) > 5 and token.endswith("n"):
        return token[:-1]
    if len(token) > 4 and token.endswith("er"):
        return token[:-2]
    return token


def _normalize_singular(s: str) -> str:
    return " ".join(_singularize(t) for t in _normalize(s).split())


def active_uid() -> str:
    return os.getenv("FUEL_UID") or os.getenv("FUEL_ACTIVE_UID") or DEFAULT_UID


def user_data_dir(uid: str | None = None) -> Path:
    chosen_uid = uid or active_uid()
    if chosen_uid == "default":
        return FUEL_DATA_DIR
    target = FUEL_DATA_DIR / "users" / chosen_uid
    target.mkdir(parents=True, exist_ok=True)
    return target


def user_catalog_path(uid: str | None = None) -> Path:
    return user_data_dir(uid) / "nutrition" / "catalog.json"


def _load_catalog_from_repo() -> list[dict]:
    """Lädt den Meal-Catalog aus dem Repo nur noch als Compat-Fallback.

    Die aktive Fuel-SSOT liegt seit der User-Scope-Umstellung unter
    ~/.aos/fuel/users/<uid>/nutrition/catalog.json. Repo-Meal-Files bleiben
    nur noch für Alt-Konsumenten und manuelle Rückgewinnung lesbar.
    """
    items: list[dict] = []
    if not REPO_CATALOG_DIR.exists():
        return items
    seen_ids: set[str] = set()
    # YAML bevorzugen
    for f in sorted(REPO_CATALOG_DIR.glob("*.yaml")):
        try:
            import yaml
            data = yaml.safe_load(f.read_text())
            if isinstance(data, dict):
                items.append(data)
                seen_ids.add(f.stem)
        except Exception as e:
            logger.warning(f"catalog yaml parse failed for {f.name}: {e}")
    for f in sorted(REPO_CATALOG_DIR.glob("*.json")):
        if f.stem in seen_ids:
            continue
        try:
            items.append(json.loads(f.read_text()))
        except Exception as e:
            logger.warning(f"catalog json parse failed for {f.name}: {e}")

    return items


def load_meals(uid: str | None = None) -> list[dict]:
    """Lädt den aktiven Meal-Catalog bevorzugt aus dem user-spezifischen JSON.

    Repo-Catalog bleibt nur Lesefallback, damit Alt-Artefakte den aktiven
    User-Catalog nicht mehr versehentlich übersteuern.
    """
    path = user_catalog_path(uid)
    if path.exists():
      try:
          data = json.loads(path.read_text(encoding="utf-8"))
      except (json.JSONDecodeError, UnicodeDecodeError, OSError) as e:
          raise RuntimeError(f"Meal-Katalog ist beschädigt: {path}; Datei wurde nicht überschrieben") from e
      items = data.get("items", []) if isinstance(data, dict) else None
      if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
          raise RuntimeError(f"Meal-Katalog hat ein ungültiges Format: {path}; Datei wurde nicht überschrieben")
      return items
    logger.info(f"catalog compat fallback → repo path for uid={uid or active_uid()}")
    return _load_catalog_from_repo()


def _score_match(query_norm: str, item: dict) -> float:
    """Higher = better. 0.0 = kein Match."""
    name = item.get("name") or ""
    alias = item.get("alias") or ""
    name_norm = _normalize_singular(name)
    alias_norm = _normalize_singular(alias) if alias else ""
    q = _normalize_singular(query_norm)

    score = 0.0
    # Alias exact = sehr stark
    if alias_norm and q == alias_norm:
        score += 100.0
    # Name exact
    if q == name_norm:
        score += 90.0
    # Name enthält query (oder umgekehrt)
    if q in name_norm:
        score += 40.0
    elif name_norm in q:
        score += 30.0
    if alias_norm and alias_norm in q:
        score += 20.0
    # Token-Overlap (Jaccard-light)
    q_tokens = set(q.split())
    n_tokens = set(name_norm.split())
    if q_tokens and n_tokens:
        overlap = len(q_tokens & n_tokens) / len(q_tokens | n_tokens)
        score += overlap * 25.0

    if score == 0:
        return 0.0

    # Inhaltliche Zusatz-Tokens in der Query, die im Catalog-Namen fehlen
    # ("Reis mit Brokkoli UND 5 FREILAND-EIERN" vs. "Reis mit Brokkoli").
    # Solche Erweiterungen dürfen NICHT still auf die Basis-Version kollabieren —
    # dann fehlen die zusätzlichen Zutaten in Makros + Log. Pro echtem
    # Zusatz-Token kräftig abwerten, damit lieber Gemini rechnet.
    extra = {
        t for t in (q_tokens - n_tokens)
        if t not in _MATCH_STOPWORDS and len(t) > 2
        and not re.fullmatch(r"\d+[a-z]*", t)  # "5", "330g", "200ml", "2x" zählen nicht
    }
    if extra and q != name_norm and (not alias_norm or q != alias_norm):
        score -= 30.0 * len(extra)

    # Umgekehrter Fall: inhaltliche Tokens im Catalog-Namen, die in der Query
    # GAR NICHT vorkommen ("Eier" vs. "5 Eier MIT REIS UND BROKKOLI") —
    # sonst matcht eine blanke Einzelzutat-Query einen Komposit-Eintrag, dessen
    # Gesamt-kcal (für alle Komponenten) fälschlich als Pro-Stück-Wert der
    # Einzelzutat übernommen und von dispatch.py zusätzlich ×qty skaliert wird
    # (Bug: "5 Eier" → 3665 kcal statt ~400, 2026-10-08).
    missing = {
        t for t in (n_tokens - q_tokens)
        if t not in _MATCH_STOPWORDS and len(t) > 2
        and not re.fullmatch(r"\d+[a-z]*", t)
    }
    if missing and q != name_norm and (not alias_norm or q != alias_norm):
        score -= 30.0 * len(missing)

    # Ranking-Boni
    name_orig = item.get("name") or ""
    if _QUANTITY_NOISE.search(name_orig):
        score -= 15.0  # "500g Käseleberkäse..." schlechter als "Käseleberkäsesemmel"
    if item.get("kind") in ("meal", "recipe"):
        score += 5.0
    # Kürzere Namen bevorzugen (weniger spezifisch = wiederverwendbar)
    score -= min(len(name_orig) * 0.1, 10.0)
    # Vorhandene addons = gut strukturiert
    if item.get("addons"):
        score += 3.0
    return score


def find_meal(query: str, *, min_score: float = 40.0, uid: str | None = None) -> dict | None:
    """Sucht best-passenden Meal-Eintrag. None wenn kein guter Match.

    min_score=40 entspricht etwa "query in name" oder mittlerem Token-Overlap.
    Schwellwert sicherheitshalber konservativ, lieber Gemini fragen als falschen Hit nehmen.
    """
    if not query or not query.strip():
        return None
    items = load_meals(uid)
    if not items:
        return None
    # Nur normalisieren: _score_match singularisiert selbst. Doppeltes Singularisieren
    # machte aus "debreziner" → "debrezi" und der Alias traf nie.
    q_norm = _normalize(query)
    scored: list[tuple[float, dict]] = []
    for it in items:
        s = _score_match(q_norm, it)
        if s >= min_score:
            scored.append((s, it))
    if not scored:
        return None
    scored.sort(key=lambda x: x[0], reverse=True)
    best_score, best = scored[0]
    logger.info(f"catalog hit: {best.get('name')!r} (score={best_score:.1f}, query={query!r})")
    return best


def _slugify(name: str) -> str:
    s = _normalize(name).replace(" ", "_")
    return re.sub(r"_+", "_", s).strip("_")[:60] or "meal"


_GRAMS_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(g|gr|gramm|kg|ml|l)\b", re.IGNORECASE)


def _amount_to_grams(qty_text: str) -> float | None:
    """Zieht eine Grammzahl aus Geminis freitextlichem qty-Feld ("200g roh", "0,5 l")."""
    if not qty_text:
        return None
    m = _GRAMS_RE.search(str(qty_text))
    if not m:
        return None
    val = float(m.group(1).replace(",", "."))
    unit = m.group(2).lower()
    if unit == "kg" or unit == "l":
        val *= 1000
    return round(val, 1)


def _normalize_components(components: list | None) -> list[dict]:
    """Gemini-Komponenten ({name, qty, kcal, protein, carbs, fat}) in eine stabile
    Form bringen. per_100g-Mikroprofile pro Zutat sind hier noch nicht befüllt —
    das ist die separate Ausbaustufe (Zutaten-DB). micros_source markiert das."""
    out: list[dict] = []
    for c in components or []:
        if not isinstance(c, dict):
            continue
        qty_text = c.get("qty") or c.get("quantity") or ""
        out.append({
            "name": c.get("name") or "?",
            "qty_text": qty_text,
            "amount_g": _amount_to_grams(qty_text),
            "kcal": round(float(c.get("kcal", 0) or 0), 1),
            "protein": round(float(c.get("protein", 0) or 0), 1),
            "carbs": round(float(c.get("carbs", 0) or 0), 1),
            "fat": round(float(c.get("fat", 0) or 0), 1),
            "per_100g": None,
            "micros_source": None,
        })
    return out


def _read_catalog_raw(catalog_path: Path) -> dict:
    """Liest catalog.json inkl. Format-Validierung; fehlende Datei → leerer Catalog.

    Wirft RuntimeError bei beschädigter/ungültiger Datei, damit nichts überschrieben wird.
    """
    raw = {"items": [], "deleted_ids": []}
    if not catalog_path.exists():
        return raw
    try:
        loaded = json.loads(catalog_path.read_text(encoding="utf-8"))
    except Exception as e:
        raise RuntimeError(f"Meal-Katalog ist beschädigt: {catalog_path}; Datei wurde nicht überschrieben") from e
    if not isinstance(loaded, dict) or not isinstance(loaded.get("items", []), list):
        raise RuntimeError(f"Meal-Katalog hat ein ungültiges Format: {catalog_path}; Datei wurde nicht überschrieben")
    if any(not isinstance(item, dict) for item in loaded.get("items", [])):
        raise RuntimeError(f"Meal-Katalog enthält ungültige Einträge: {catalog_path}; Datei wurde nicht überschrieben")
    deleted_ids = loaded.get("deleted_ids", [])
    if not isinstance(deleted_ids, list) or any(not isinstance(item_id, str) for item_id in deleted_ids):
        raise RuntimeError(f"Meal-Katalog deleted_ids ist ungültig: {catalog_path}; Datei wurde nicht überschrieben")
    return loaded


def update_catalog_item(item_id: str, fields: dict, *, uid: str | None = None) -> bool:
    """Setzt `fields` auf dem Catalog-Eintrag `item_id` (updated_at wird gestempelt).

    False, wenn es die ID nicht gibt. Alle anderen Einträge bleiben unverändert.
    """
    catalog_path = user_catalog_path(uid)
    raw = _read_catalog_raw(catalog_path)
    for item in raw["items"]:
        if item.get("id") == item_id:
            item.update(fields)
            item["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            catalog_path.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n")
            logger.info(f"catalog aktualisiert uid={uid or active_uid()}: {item_id} ({', '.join(fields)})")
            return True
    return False


def find_ingredient(name: str, brand: str | None = None, *, uid: str | None = None) -> dict | None:
    """Zutaten-Baustein (kind=ingredient mit yield_g) zu einem Namen, sonst None.

    Nur Bausteine: ein Treffer auf ein fertiges Gericht würde dessen Gesamtwerte
    als Einzelzutat übernehmen (siehe _score_match). Erst find_meal (Name, dann
    Marke+Name); dann Fallback, weil das LLM Namen gern kürzt ("Debreziner" statt
    "Bio-Debreziner"): alle Query-Tokens müssen im Namen/Alias EINES Bausteins
    stecken, bei mehreren Kandidaten lieber kein Treffer als der falsche.
    """
    for q in [name] + ([f"{brand} {name}"] if brand else []):
        hit = find_meal(q, uid=uid)
        if hit and hit.get("kind") == "ingredient" and hit.get("yield_g"):
            return hit
    q_tokens = set(_normalize_singular(name).split())
    if not q_tokens:
        return None
    cands = [
        e for e in load_meals(uid)
        if e.get("kind") == "ingredient" and e.get("yield_g")
        and q_tokens <= set(_normalize_singular(f"{e.get('name', '')} {e.get('alias') or ''}").split())
    ]
    return cands[0] if len(cands) == 1 else None


def save_meal(name: str, macros: dict[str, float], *, source: str = "gemini", uid: str | None = None,
              micros: dict[str, float] | None = None, components: list | None = None) -> str:
    """Schreibt einen neuen Meal-Catalog-Eintrag in den user-spezifischen Catalog.

    micros: absolutes DACH-Mikroprofil für eine Portion des Gerichts (wie
    geschätzt). components: Zutaten-Zerlegung aus demselben Schätz-Call.
    Beides wird direkt in die git-/Firestore-getrackte catalog.json geschrieben,
    damit die Werte ohne laufenden Node-Server erhalten bleiben."""

    catalog_path = user_catalog_path(uid)
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    raw = _read_catalog_raw(catalog_path)
    base_id = f"meal_{_slugify(name)}"
    item_id = base_id
    n = 2
    existing_ids = {item.get("id") for item in raw.get("items", []) if isinstance(item, dict)}
    while item_id in existing_ids:
        item_id = f"{base_id}_{n}"
        n += 1

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    norm_components = _normalize_components(components)
    clean_micros = {k: round(float(v), 3) for k, v in (micros or {}).items()
                    if isinstance(v, (int, float)) and v > 0}
    entry = {
        "id": item_id,
        "kind": "meal",
        "category": "meal",
        "name": name,
        "alias": None,
        "meal_type": "meal",
        "description": name,
        "notes": "",
        "kcal": round(float(macros.get("kcal", 0)), 1),
        "protein": round(float(macros.get("protein", 0)), 1),
        "carbs": round(float(macros.get("carbs", 0)), 1),
        "fat": round(float(macros.get("fat", 0)), 1),
        "yield_g": sum(c["amount_g"] for c in norm_components if c.get("amount_g")) or None,
        "micros": clean_micros,
        "micros_meta": {
            "source": source,
            "method": "meal_estimate",
            "resolved_at": now,
        } if clean_micros else None,
        "components": norm_components,
        "addons": [],
        "default_addon_ids": [],
        "source": source,
        "created_at": now,
        "updated_at": now,
    }
    items = [item for item in raw.get("items", []) if isinstance(item, dict) and item.get("id") != item_id]
    items.append(entry)
    raw["items"] = items
    raw["deleted_ids"] = [deleted_id for deleted_id in raw.get("deleted_ids", []) if deleted_id != item_id]
    catalog_path.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n")
    logger.info(f"catalog gespeichert uid={uid or active_uid()}: {item_id} ({name})")
    return item_id


def extract_macros(item: dict) -> dict[str, float]:
    """Top-level macros aus Catalog-Item, inkl. default_addons summiert."""
    base = {
        "kcal": float(item.get("kcal") or 0),
        "protein": float(item.get("protein") or 0),
        "carbs": float(item.get("carbs") or 0),
        "fat": float(item.get("fat") or 0),
    }
    # default_addon_ids sind in den Top-Level-Werten i.d.R. schon enthalten
    # (siehe meal_spiegelei_5x: kcal=669 = base 445 + addons 70+154)
    # Daher KEIN doppeltes Addieren.
    return base
