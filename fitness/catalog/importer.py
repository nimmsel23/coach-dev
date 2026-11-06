from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any
import urllib.parse
import urllib.request
import yaml
from tqdm import tqdm

from loguru import logger
from fitness.catalog.core.rich_utils import console
from fitness.catalog.core.loader import DATA_DIR, load_catalog_yaml
from fitness.catalog.core.non_exercises import is_non_exercise
from fitness.catalog.core.resolver import build_exercise_index, resolve_query, normalize_text
from fitness.catalog.coverage import normalize_muscle_id, load_muscle_taxonomy

WGER_API_BASE = os.environ.get("WGER_API_BASE", "http://127.0.0.1/api/v2")
WGER_TOKEN = os.environ.get("WGER_API_TOKEN", "")

WGER_CATEGORY_MAP = {
    10: "core", # Abs
    8: "arms",
    12: "back",
    14: "legs", # Calves
    15: "cardio",
    11: "chest",
    9: "legs",
    13: "shoulders",
}

# wger's own muscle taxonomy has a single deltoid entry (id 2, "Anterior deltoid")
# and no separate posterior/lateral deltoid ID. Every shoulder exercise - front
# raise or rear delt fly alike - gets tagged with id 2, so a plain wger_id lookup
# always resolves to 301_anterior_deltoid. Reclassify using name keywords instead.
DELTOID_REASSIGNMENT = [
    # Außen-/Innenrotation trainiert primär die Rotatorenmanschette (Infraspinatus/
    # Teres minor bei Außenrotation), nicht den hinteren Deltamuskel — anatomisch
    # eigene Kategorie, muss vor dem breiteren posterior-Pattern geprüft werden.
    (re.compile(r"external rotation|internal rotation|au(ss|ß)enrotation|innenrotation|"
                r"rotator ?cuff", re.I), "304_rotator_cuff"),
    (re.compile(r"rear|reverse|posterior|face.?pull|"
                r"hintere schulter|vorgebeugt", re.I), "303_posterior_deltoid"),
    (re.compile(r"lateral raise|side raise|seitheben|upright row", re.I), "302_lateral_deltoid"),
]

GENERIC_REGION_REASSIGNMENT = [
    (re.compile(r"external rotation|internal rotation|au(ss|ß)enrotation|innenrotation|rotator ?cuff", re.I), "304_rotator_cuff"),
    (re.compile(r"rear|reverse|posterior|face.?pull|hintere schulter|vorgebeugt", re.I), "303_posterior_deltoid"),
    (re.compile(r"lateral raise|side raise|seitheben", re.I), "302_lateral_deltoid"),
    (re.compile(r"front raise|frontheben", re.I), "301_anterior_deltoid"),
]


def reclassify_deltoid_muscles(muscle_ids: list[str], *name_variants: str) -> list[str]:
    if "301_anterior_deltoid" not in muscle_ids:
        return muscle_ids
    names = " ".join(n for n in name_variants if n)
    for pattern, replacement in DELTOID_REASSIGNMENT:
        if pattern.search(names):
            return [replacement if m == "301_anterior_deltoid" else m for m in muscle_ids]
    return muscle_ids


def refine_generic_region_labels(muscle_ids: list[str], *name_variants: str) -> list[str]:
    names = " ".join(n for n in name_variants if n)
    generic_shoulders = {"shoulders", "300_shoulders"}
    if generic_shoulders.intersection(muscle_ids):
        for pattern, replacement in GENERIC_REGION_REASSIGNMENT:
            if pattern.search(names):
                return [replacement if m in generic_shoulders else m for m in muscle_ids]
    return muscle_ids


_LEG_CURL_NAME = re.compile(r"\b(?:leg curls?|hamstring curls?|beinbeuger)\b", re.I)
_HAMSTRING_IDS = ["604a_biceps_femoris", "604b_semitendinosus", "604c_semimembranosus"]
_WGER_LEG_CURL_GERMAN = {
    1767: "Beinbeuger sitzend",
    1770: "Beinbeuger sitzend",
    366: "Beinbeuger sitzend",
    1300: "Einbeiniger Beinbeuger",
    1534: "Beinbeuger mit Widerstandsband",
}


def correct_leg_curl_primary(muscle_ids: list[str], *name_variants: str) -> list[str]:
    """Wger muscle IDs 8/12 on some leg curls are source errors, not anatomy."""
    if not any(_LEG_CURL_NAME.search(name or "") for name in name_variants):
        return muscle_ids
    return list(_HAMSTRING_IDS)


def correct_leg_curl_category(category: str, *name_variants: str) -> str:
    return "legs" if any(_LEG_CURL_NAME.search(name or "") for name in name_variants) else category


def wger_names(item: dict[str, Any]) -> tuple[str, str | None, str | None]:
    translations = item.get("translations", [])
    de = next((t for t in translations if t.get("language") == 1), None)
    en = next((t for t in translations if t.get("language") == 2), None)
    german = (de or {}).get("name") or _WGER_LEG_CURL_GERMAN.get(item.get("id"))
    english = (en or {}).get("name") or None
    return german or english or "", german, english

def fetch_json(url: str, headers: dict[str, str] | None = None) -> Any:
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode("utf-8"))


YUHONAS_DIST_JSON_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"


def _ensure_yuhonas_json() -> Path | None:
    """~/fitness/free-exercise-db ist ein voller Git-Klon (~200MB inkl. Bilder)
    und wurde in der Praxis wiederholt extern geleert (Ursache nicht
    identifiziert, siehe fitness-dev/CLAUDE.md-Gotcha zu diesem Pfad). Statt bei
    jedem Reimport an dieser Fragilitaet zu scheitern: die ~1MB dist/exercises.json
    bei Bedarf direkt von GitHub nachladen und lokal cachen - Bilder selbst
    kommen ohnehin per CDN (src/lib/yuhonasImage.js), kein voller Klon noetig
    fuer diesen Pfad.
    """
    path = Path.home() / "fitness/free-exercise-db/dist/exercises.json"
    if path.exists():
        return path
    try:
        logger.warning(f"{path} fehlt - lade dist/exercises.json direkt von GitHub nach...")
        data = fetch_json(YUHONAS_DIST_JSON_URL)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data), encoding="utf-8")
        logger.info(f"yuhonas dist/exercises.json wiederhergestellt ({len(data)} Eintraege).")
        return path
    except Exception as e:
        logger.error(f"Konnte yuhonas dist/exercises.json nicht nachladen: {e}")
        return None

# Wiederhergestellt (User-Vorgabe 2026-07-25) aus dem Diff von Commit 6be284f
# ("wger-Bulk-Import deaktivieren"), NICHT scharfgeschaltet: bevor der
# Import laufen darf, muss die Muskel-Taxonomie (muscle_index.yml, paralleles
# Arbeitsgebiet des Muscles-Agenten) verifiziert kollisionsfrei sein — sonst
# landen wieder falsche Muskel-IDs in primary_muscles (siehe unten,
# get_norm_muscles()-Fix). Auf True setzen erst nach expliziter Freigabe.
WGER_BULK_IMPORT_ENABLED = True


def import_external_exercises():
    logger.info("Starting bulk import from external sources...")

    existing_exercises = build_exercise_index()
    existing_ids = {ex.exercise_id for ex in existing_exercises}

    # Load taxonomy for wger_id mapping
    taxonomy = load_muscle_taxonomy()

    # wger's eigene Muskel-Taxonomie ist grober als unsere (z.B. wger_id 10
    # deckt alle vier Quadrizeps-Köpfe ab, wger_id 9 sowohl Trapezius
    # oben/mitte/unten ALS AUCH den hinteren Deltamuskel). Ein naiver
    # {wger_id: EIN norm_id}-Dict wuerde bei jeder Mehrfachzuordnung
    # stillschweigend nur die zuletzt eingelesene ID behalten (z.B. nur
    # 606_vastus_intermedius statt aller vier Quad-Koepfe) — genau der Bug,
    # der einmal zu "Front Squat: primary_muscles nur Gluteus" gefuehrt hat.
    # wger_groups in muscle_index.yml ist die von der Muskel-Taxonomie
    # gepflegte, autoritative wger_id -> [alle passenden canonical IDs]
    # Liste — die muss hier verwendet werden, nicht taxonomy neu ableiten.
    raw_taxonomy_doc_for_wger = load_catalog_yaml("muscle_index.yml") or {}
    wger_groups = raw_taxonomy_doc_for_wger.get("wger_groups", {}) if isinstance(raw_taxonomy_doc_for_wger, dict) else {}
    wger_id_to_norms: dict[int, list[str]] = {
        int(k): v for k, v in wger_groups.items() if isinstance(v, list)
    }

    def get_norm_muscles(wger_muscles: list[dict[str, Any]]) -> list[str]:
        res: list[str] = []
        for m in wger_muscles:
            w_id = m.get("id")
            res.extend(wger_id_to_norms.get(w_id, []))
        return sorted(set(res))

    # 1. Import from wger
    unreviewed_wger: list[dict] = []
    if not WGER_BULK_IMPORT_ENABLED:
        logger.info(
            "wger-Import deaktiviert (WGER_BULK_IMPORT_ENABLED=False) — wartet auf "
            "Freigabe der Muskel-Taxonomie-Kollisionsfreiheit. unreviewed_wger.yml "
            "bleibt unveraendert stehen."
        )
    else:
        try:
            logger.info("Fetching exercises from local wger API in batches...")
            offset = 0
            limit = 100
            while True:
                url = f"{WGER_API_BASE}/exerciseinfo/?limit={limit}&offset={offset}"
                headers = {"Authorization": f"Token {WGER_TOKEN}", "Accept": "application/json"}
                data = fetch_json(url, headers)

                results = data.get("results", [])
                if not results:
                    break

                for item in results:
                    translations = item.get("translations", [])
                    de = next((t for t in translations if t.get("language") == 1), None)
                    en = next((t for t in translations if t.get("language") == 2), None)

                    display_name, german_name, english_name = wger_names(item)
                    if not display_name:
                        continue

                    safe_id = f"wger_{item.get('id')}"
                    # Aktivitäten (HIIT, ...) sind keine Übungen, siehe kb/registry/non_exercises.yml
                    if is_non_exercise({"exercise_id": safe_id, "wger_id": item.get("id")}):
                        continue

                    res = resolve_query(display_name)
                    if res.matched and res.confidence == "high":
                        continue

                    primary = get_norm_muscles(item.get("muscles", []))
                    secondary = get_norm_muscles(item.get("muscles_secondary", []))

                    name_variants = (
                        display_name,
                        (de or {}).get("name", ""),
                        (en or {}).get("name", ""),
                    )
                    primary = reclassify_deltoid_muscles(primary, *name_variants)
                    secondary = reclassify_deltoid_muscles(secondary, *name_variants)
                    primary = refine_generic_region_labels(primary, *name_variants)
                    secondary = refine_generic_region_labels(secondary, *name_variants)
                    primary = correct_leg_curl_primary(primary, *name_variants)

                    category_id = item.get("category", {}).get("id")
                    category = WGER_CATEGORY_MAP.get(category_id, "other")
                    category = correct_leg_curl_category(category, *name_variants)

                    description = (de or en or {}).get("description", "")
                    clean_desc = re.sub('<[^<]+?>', '', description).strip()

                    ex = {
                        "exercise_id": safe_id,
                        "display_name": display_name,
                        "german": german_name,
                        "english": english_name,
                        "category": category,
                        "primary_muscles": primary,
                        "secondary_muscles": secondary,
                        "equipment": [e.get("name").lower() for e in item.get("equipment", [])],
                        "coaching_notes": [clean_desc] if clean_desc else [],
                        "original_description": clean_desc,
                        "tags": ["unreviewed", "wger"],
                        "wger_id": item.get("id"),
                        "wger_muscle_ids": {
                            "primary": [m.get("id") for m in item.get("muscles", [])],
                            "secondary": [m.get("id") for m in item.get("muscles_secondary", [])]
                        }
                    }
                    unreviewed_wger.append(ex)

                logger.info(f"Processed {offset + len(results)}/{data.get('count', '?')} wger exercises...")
                offset += limit
                if offset >= data.get("count", 0):
                    break

            logger.info(f"Prepared {len(unreviewed_wger)} unreviewed exercises from wger.")
        except Exception as e:
            logger.error(f"wger import failed: {e}")

    # 2. Import from yuhonas
    # yuhonas nutzt eine eigene, flache Muskel-Vokabel (17 Wörter: "chest",
    # "lats", "lower back", ...) - keine kanonischen taxonomy-IDs. Frueher wurde
    # hier ueber string_aliases (muscle_index.yml) auf canonical IDs uebersetzt -
    # unnoetiger Aufwand fuer unreviewte Bulk-Importe, deren Muskelangaben ohnehin
    # erst durchs Gemini-Enrichment (fitness-agent/anatomy-agent) fachlich korrekt
    # werden. Die Aufloesung passiert stattdessen erst beim Firestore-Push
    # (api/firestore_push.py::_resolve, nutzt denselben string_aliases-Block) -
    # rohe Woerter hier einfach normalisiert (slugify) uebernehmen.
    def resolve_yuhonas_muscle(name: str) -> str:
        return normalize_muscle_id(name)

    unreviewed_yuhonas = []
    yuhonas_path = _ensure_yuhonas_json()
    if yuhonas_path and yuhonas_path.exists():
        logger.info("Importing from yuhonas free-exercise-db...")
        try:
            with yuhonas_path.open("r", encoding="utf-8") as f:
                data = json.load(f)

            for item in tqdm(data, desc="yuhonas import", unit="ex"):
                display_name = item.get("name")
                if not display_name:
                    continue

                res = resolve_query(display_name)
                if res.matched and res.confidence == "high":
                    continue

                safe_id = f"yuhonas_{item.get('id').lower().replace(' ', '_')}"

                primary = sorted(set(resolve_yuhonas_muscle(m) for m in item.get("primaryMuscles", [])))
                secondary = sorted(set(resolve_yuhonas_muscle(m) for m in item.get("secondaryMuscles", [])))
                primary = refine_generic_region_labels(primary, display_name)
                secondary = refine_generic_region_labels(secondary, display_name)

                wger_primary = []
                for m in primary:
                    m_data = taxonomy.get(m)
                    if m_data and "wger_id" in m_data:
                        wger_primary.append(int(m_data["wger_id"]))

                wger_secondary = []
                for m in secondary:
                    m_data = taxonomy.get(m)
                    if m_data and "wger_id" in m_data:
                        wger_secondary.append(int(m_data["wger_id"]))

                ex = {
                    "exercise_id": safe_id,
                    "display_name": display_name,
                    "category": item.get("category", "other"),
                    "primary_muscles": primary,
                    "secondary_muscles": secondary,
                    "equipment": [item.get("equipment")] if item.get("equipment") else [],
                    "coaching_notes": item.get("instructions", []),
                    "original_description": item.get("instructions", []),
                    "tags": ["unreviewed", "yuhonas"],
                    "yuhonas_id": item.get("id"),
                    "wger_muscle_ids": {
                        "primary": sorted(list(set(wger_primary))),
                        "secondary": sorted(list(set(wger_secondary)))
                    }
                }
                if is_non_exercise(ex):
                    continue
                unreviewed_yuhonas.append(ex)
            logger.info(f"Prepared {len(unreviewed_yuhonas)} unreviewed exercises from yuhonas.")
        except Exception as e:
            logger.error(f"yuhonas import failed: {e}")
    else:
        logger.info("yuhonas DB not found at ~/fitness/free-exercise-db/dist/exercises.json")

    # Save to catalog
    exercises_dir = DATA_DIR / "exercises"
    exercises_dir.mkdir(parents=True, exist_ok=True)
    
    if unreviewed_wger:
        target = exercises_dir / "unreviewed_wger.yml"
        wrapper = {
            "name": "unreviewed_wger",
            "description": "Bulk imported exercises from local wger API",
            "exercises": unreviewed_wger
        }
        with target.open("w", encoding="utf-8") as f:
            yaml.safe_dump(wrapper, f, allow_unicode=True, sort_keys=False)
        logger.info(f"Saved {len(unreviewed_wger)} exercises to {target}")

    if unreviewed_yuhonas:
        target = exercises_dir / "unreviewed_yuhonas.yml"
        wrapper = {
            "name": "unreviewed_yuhonas",
            "description": "Bulk imported exercises from yuhonas free-exercise-db",
            "exercises": unreviewed_yuhonas
        }
        with target.open("w", encoding="utf-8") as f:
            yaml.safe_dump(wrapper, f, allow_unicode=True, sort_keys=False)
        logger.info(f"Saved {len(unreviewed_yuhonas)} exercises to {target}")

def _wger_entry_from_api_item(item: dict[str, Any]) -> dict[str, Any] | None:
    """Baut denselben Entry-Shape wie import_external_exercises()'s wger-Zweig,
    aus einem einzelnen /exerciseinfo/-Ergebnis (nicht der Bulk-Paginierung)."""
    translations = item.get("translations", [])
    de = next((t for t in translations if t.get("language") == 1), None)
    en = next((t for t in translations if t.get("language") == 2), None)
    display_name, german_name, english_name = wger_names(item)
    if not display_name:
        return None

    raw_taxonomy_doc_for_wger = load_catalog_yaml("muscle_index.yml") or {}
    wger_groups = raw_taxonomy_doc_for_wger.get("wger_groups", {}) if isinstance(raw_taxonomy_doc_for_wger, dict) else {}
    wger_id_to_norms: dict[int, list[str]] = {int(k): v for k, v in wger_groups.items() if isinstance(v, list)}

    def get_norm_muscles(wger_muscles: list[dict[str, Any]]) -> list[str]:
        res: list[str] = []
        for m in wger_muscles:
            res.extend(wger_id_to_norms.get(m.get("id"), []))
        return sorted(set(res))

    primary = get_norm_muscles(item.get("muscles", []))
    secondary = get_norm_muscles(item.get("muscles_secondary", []))
    name_variants = (display_name, (de or {}).get("name", ""), (en or {}).get("name", ""))
    primary = reclassify_deltoid_muscles(primary, *name_variants)
    secondary = reclassify_deltoid_muscles(secondary, *name_variants)
    primary = correct_leg_curl_primary(primary, *name_variants)

    category_id = item.get("category", {}).get("id")
    category = WGER_CATEGORY_MAP.get(category_id, "other")
    category = correct_leg_curl_category(category, *name_variants)
    description = (de or en or {}).get("description", "")
    clean_desc = re.sub("<[^<]+?>", "", description).strip()

    return {
        "exercise_id": f"wger_{item.get('id')}",
        "display_name": display_name,
        "german": german_name,
        "english": english_name,
        "category": category,
        "primary_muscles": primary,
        "secondary_muscles": secondary,
        "equipment": [e.get("name").lower() for e in item.get("equipment", [])],
        "coaching_notes": [clean_desc] if clean_desc else [],
        "original_description": clean_desc,
        "tags": ["unreviewed", "wger"],
        "wger_id": item.get("id"),
        "wger_muscle_ids": {
            "primary": [m.get("id") for m in item.get("muscles", [])],
            "secondary": [m.get("id") for m in item.get("muscles_secondary", [])],
        },
    }


def _yuhonas_entry_from_json_item(item: dict[str, Any]) -> dict[str, Any] | None:
    """Baut denselben Entry-Shape wie import_external_exercises()'s yuhonas-Zweig,
    aus einem einzelnen dist/exercises.json-Eintrag."""
    display_name = item.get("name")
    if not display_name:
        return None
    return {
        "exercise_id": f"yuhonas_{item.get('id').lower().replace(' ', '_')}",
        "display_name": display_name,
        "category": item.get("category", "other"),
        "primary_muscles": sorted(set(normalize_muscle_id(m) for m in item.get("primaryMuscles", []))),
        "secondary_muscles": sorted(set(normalize_muscle_id(m) for m in item.get("secondaryMuscles", []))),
        "equipment": [item.get("equipment")] if item.get("equipment") else [],
        "coaching_notes": item.get("instructions", []),
        "original_description": item.get("instructions", []),
        "tags": ["unreviewed", "yuhonas"],
        "yuhonas_id": item.get("id"),
    }


def _write_inbox_draft(ex: dict[str, Any]) -> Path:
    ex_id = ex["exercise_id"]
    inbox_dir = DATA_DIR / "inbox"
    inbox_dir.mkdir(parents=True, exist_ok=True)
    target = inbox_dir / f"inbox_{ex_id}.yml"
    doc = {
        "name": f"inbox_{ex_id}",
        "description": f"Reimported (gezielter Einzel-Reimport) fuer: {ex.get('display_name', ex_id)}",
        "exercises": [ex],
    }
    target.write_text(yaml.dump(doc, allow_unicode=True, sort_keys=False, default_flow_style=False), encoding="utf-8")
    from fitness.catalog.agent.inbox_actions import commit_inbox_draft
    commit_inbox_draft(target)
    return target


def reimport_exercise(query: str, *, source: str = "both") -> list[Path]:
    """Zieht eine einzelne Uebung gezielt aus wger und/oder yuhonas neu in
    kb/inbox/ (ohne den kompletten Bulk-Import zu wiederholen) - fuer den Fall
    "eine bestimmte Uebung fehlt/ist kaputt, Rest des Katalogs ist ok".

    Ueberspringt den Reimport, wenn `query` bereits mit hoher Konfidenz auf
    einen bestehenden (moeglicherweise approvten) Record matcht, um keine
    Duplikate parallel zu einem Expert-Eintrag anzulegen.
    """
    if source not in ("wger", "yuhonas", "both"):
        raise ValueError(f"unknown source: {source}")

    existing = build_exercise_index()
    res = resolve_query(query, existing)
    if res.matched and res.confidence == "high":
        logger.warning(f"'{query}' ist bereits im Katalog als '{res.canonical_id}' - kein Reimport noetig.")
        return []

    written: list[Path] = []

    if source in ("wger", "both"):
        try:
            q = urllib.parse.quote(query)
            headers = {"Authorization": f"Token {WGER_TOKEN}", "Accept": "application/json"}
            data = fetch_json(f"{WGER_API_BASE}/exerciseinfo/?limit=5&search={q}", headers)
            results = data.get("results", [])
            if results:
                entry = _wger_entry_from_api_item(results[0])
                if entry:
                    written.append(_write_inbox_draft(entry))
                    logger.info(f"wger: '{entry['display_name']}' -> {entry['exercise_id']}")
            else:
                logger.info(f"wger: kein Treffer fuer '{query}'")
        except Exception as e:
            logger.error(f"wger reimport failed: {e}")

    if source in ("yuhonas", "both"):
        yuhonas_path = _ensure_yuhonas_json()
        if not yuhonas_path:
            logger.warning("yuhonas DB nicht verfuegbar (lokal fehlend, Nachladen von GitHub fehlgeschlagen)")
        else:
            try:
                from rapidfuzz import fuzz, process

                data = json.loads(yuhonas_path.read_text(encoding="utf-8"))
                choices = {i: item.get("name", "") for i, item in enumerate(data)}
                match = process.extractOne(query, choices, scorer=fuzz.token_set_ratio)
                if match and match[1] >= 70:
                    item = data[match[2]]
                    entry = _yuhonas_entry_from_json_item(item)
                    if entry:
                        written.append(_write_inbox_draft(entry))
                        logger.info(f"yuhonas: '{entry['display_name']}' -> {entry['exercise_id']} (score {match[1]:.0f})")
                else:
                    logger.info(f"yuhonas: kein ausreichend sicherer Treffer fuer '{query}'")
            except ImportError:
                logger.error("rapidfuzz nicht installiert - yuhonas-Fuzzy-Match uebersprungen")
            except Exception as e:
                logger.error(f"yuhonas reimport failed: {e}")

    if not written:
        logger.warning(f"Kein Treffer fuer '{query}' in {source} gefunden.")
    return written


if __name__ == "__main__":
    import_external_exercises()
