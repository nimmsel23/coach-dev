from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any

from fitness.catalog.core.loader import DATA_DIR, load_catalog_yaml
from fitness.catalog.core.non_exercises import is_non_exercise, load_non_exercise_ids
from fitness.catalog.core.muscle_normalization import normalize_exercise_muscle_list
from fitness.catalog.core.resolver import normalize_text, GENERIC_FUZZY_TOKENS, fuzzy_candidate_allowed
from fitness.catalog.core.resolver import build_exercise_index, find_by_id

try:
    from rapidfuzz import fuzz, process
except ImportError:
    fuzz = None
    process = None


def _entries_from_file(filename: str) -> list[dict[str, Any]]:
    # Bewusst UNGECACHT: find_source_entries() laeuft auch im langlebigen
    # API-Prozess. Nur noch fuer wger-Bulk (`unreviewed_wger.yml`).
    # Yuhonas kommt aus dem Vendor-Submodul — siehe load_yuhonas_bulk_entries().
    doc = load_catalog_yaml(f"exercises/{filename}") or {}
    entries = doc.get("exercises") or []
    blocked = load_non_exercise_ids()
    return [
        entry for entry in entries
        if isinstance(entry, dict) and not is_non_exercise(entry, blocked)
    ]


def yuhonas_vendor_json_path() -> Path | None:
    """Gepinntes free-exercise-db unter catalog/kb/vendor (fitness-Repo)."""
    candidates = [
        DATA_DIR / "vendor" / "free-exercise-db" / "dist" / "exercises.json",
        Path.home() / "dev" / "fitness" / "vendor" / "free-exercise-db" / "dist" / "exercises.json",
    ]
    for path in candidates:
        if path.is_file():
            return path
    return None


def yuhonas_item_to_entry(item: dict[str, Any]) -> dict[str, Any] | None:
    """Roh-JSON (upstream) → Katalog-Bulk-Shape (frueher unreviewed_yuhonas.yml)."""
    raw_id = item.get("id")
    name = item.get("name")
    if not raw_id or not name:
        return None
    safe_id = f"yuhonas_{str(raw_id).lower().replace(' ', '_')}"
    equipment = item.get("equipment")
    return {
        "exercise_id": safe_id,
        "display_name": name,
        "english": name,
        "category": item.get("category") or "other",
        "primary_muscles": list(item.get("primaryMuscles") or []),
        "secondary_muscles": list(item.get("secondaryMuscles") or []),
        "equipment": [equipment] if equipment else [],
        "coaching_notes": list(item.get("instructions") or []),
        "original_description": list(item.get("instructions") or []),
        "instructions": list(item.get("instructions") or []),
        "images": list(item.get("images") or []),
        "tags": ["bulk_import", "yuhonas"],
        "yuhonas_id": raw_id,
        "level": item.get("level"),
        "force": item.get("force"),
        "mechanic": item.get("mechanic"),
    }


def load_yuhonas_bulk_entries() -> list[dict[str, Any]]:
    """Live-Bulk aus vendor/free-exercise-db — ersetzt unreviewed_yuhonas.yml."""
    path = yuhonas_vendor_json_path()
    if path is None:
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(raw, list):
        return []
    blocked = load_non_exercise_ids()
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        entry = yuhonas_item_to_entry(item)
        if entry and not is_non_exercise(entry, blocked):
            out.append(entry)
    return out


def _find_wger_entry(entries: list[dict[str, Any]], wger_id: Any) -> dict[str, Any] | None:
    try:
        wanted = int(wger_id)
    except (TypeError, ValueError):
        return None
    for entry in entries:
        try:
            if int(entry.get("wger_id")) == wanted:
                return entry
        except (TypeError, ValueError):
            continue
    return None


def _find_yuhonas_entry(entries: list[dict[str, Any]], yuhonas_id: Any) -> dict[str, Any] | None:
    wanted = str(yuhonas_id or "").strip()
    if not wanted:
        return None
    wanted_lower = wanted.casefold()
    for entry in entries:
        value = str(entry.get("yuhonas_id") or "").strip()
        if value and value.casefold() == wanted_lower:
            return entry
    return None


def _candidate_texts(entry: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for key in ("display_name", "german", "english", "name", "exercise_id", "id"):
        value = entry.get(key)
        if isinstance(value, str) and value.strip():
            values.append(value.strip())
    for key in ("aliases", "search_aliases"):
        value = entry.get(key)
        if isinstance(value, list):
            values.extend(str(item).strip() for item in value if str(item).strip())
    return values


def _norm(value: str) -> str:
    return normalize_text(value, smart=True)


# Equipment-/Bewegungs-Woerter fuers Scoring ausblenden: wger liefert oft
# geraete-neutrale Namen ("Walking Lunges"), yuhonas geraete-praefigierte
# ("Barbell Walking Lunge") + oft Singular statt Plural ("Lunge" statt
# "Lunges") — beides druckt den rohen fuzz-Score unter AUTO_MATCH_MIN_SCORE,
# obwohl es dieselbe Uebung ist (siehe catalog/CLAUDE.md "Fuzzy-Match-Falle").
# Wiederverwendet GENERIC_FUZZY_TOKENS aus resolver.py (EINE Wortliste,
# schon von resolve_query()/fuzzy_candidate_allowed() genutzt) statt einer
# eigenen, engeren Liste — die deckt neben Equipment auch generische
# Bewegungswoerter ab (curl/row/press/squat/...), die dasselbe Kollaps-
# Risiko haben (siehe _best_match_scored()-Regression unten).
_GENERIC_MATCH_TOKENS = GENERIC_FUZZY_TOKENS


def _singularize(word: str) -> str:
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def _match_norm(value: str) -> str:
    """Generische Woerter (Equipment + Bewegungstyp) nur dann aus dem
    Vergleichstext streichen, wenn danach noch >= 2 Woerter uebrig bleiben —
    sonst bleibt z.B. "Cable Curls" als reines "curl" stehen, und
    token_set_ratio bewertet danach JEDE Anfrage mit diesem Wort (auch
    "Jefferson Curl") faelschlich als Untermenge/Volltreffer. Reicht als
    Schutz allein trotzdem NICHT (siehe die zusaetzliche
    `fuzzy_candidate_allowed()`-Pruefung in `_best_match_scored()` unten,
    die genau den hier verbliebenen Fall - zwei Woerter, aber nur das
    generische gemeinsam - noch abfaengt)."""
    words = _norm(value).split()
    stripped = [w for w in words if w not in _GENERIC_MATCH_TOKENS]
    if len(stripped) < 2:
        stripped = words
    return " ".join(_singularize(w) for w in stripped)


# Auto-Link nur noch per exakter ID oder exaktem normalisierten Namen
# (siehe find_source_entries). Fuzzy-Scores dienen ausschliesslich als
# manuelle Vorschlaege. CANDIDATE_MIN_SCORE bewusst hoch: token_set/ratio
# unter ~80 bringt zu oft Varianten (Pull-Up → Band Assisted / Scapular /
# Weighted) oder verwandte Griffe (Obergriff → Chin-Up) als "Treffer".
AUTO_MATCH_MIN_SCORE = 95  # Legacy-Schwelle fuer Aufrufer/Docs; Auto nutzt Exact.
CANDIDATE_MIN_SCORE = 80


def _best_match_scored(query: str, entries: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, float]:
    normalized_query = _norm(query)
    if not normalized_query:
        return None, 0.0

    for entry in entries:
        if normalized_query in {_norm(text) for text in _candidate_texts(entry)}:
            return entry, 100.0

    if not process or not fuzz:
        return None, 0.0

    choices: dict[str, str] = {}
    choice_to_entry: dict[str, int] = {}
    choice_to_text: dict[str, str] = {}
    for idx, entry in enumerate(entries):
        for text in _candidate_texts(entry):
            choice_key = f"{idx}:{text}"
            choices[choice_key] = _match_norm(text)
            choice_to_entry[choice_key] = idx
            choice_to_text[choice_key] = text

    # Regression gefunden + gefixt (User-Report: "Jefferson Curl" matchte
    # trotz der Equipment-Strip-Normalisierung oben immer noch faelschlich
    # auf "Kurzhantel-Curl"/"Cable Curls" mit Score 100 — token_set_ratio
    # bewertet zwei Namen, die sich nur ein generisches Wort ("curl") teilen,
    # als Volltreffer, egal wie unterschiedlich der Rest ist). process.
    # extractOne() gibt nur den EINEN besten Treffer zurueck, egal ob der
    # inhaltlich Unsinn ist — deshalb hier process.extract() (mehrere
    # Kandidaten) + `fuzzy_candidate_allowed()` (aus resolver.py, bereits von
    # resolve_query() genutzt) als Gate: mind. ein NICHT-generisches Wort
    # (nicht in GENERIC_FUZZY_TOKENS) muss zwischen Query und Kandidat
    # uebereinstimmen, sonst wird der Kandidat trotz hohem Rohscore
    # uebersprungen.
    matches = process.extract(_match_norm(query), choices, scorer=fuzz.ratio, limit=5)  # No subset=100 shortcut for Dips/Bench Dips.
    for _, score, choice_key in matches:
        candidate_text = choice_to_text[choice_key]
        if fuzzy_candidate_allowed(_norm(query), _norm(candidate_text)):
            return entries[choice_to_entry[choice_key]], float(score)
    return None, 0.0


def _best_match(query: str, entries: list[dict[str, Any]], *, min_score: int = AUTO_MATCH_MIN_SCORE) -> dict[str, Any] | None:
    entry, score = _best_match_scored(query, entries)
    if entry is not None and score >= min_score:
        return entry
    return None


def _candidate_queries(display_name: str, exercise_id: str | None = None, *, record: Any = None) -> list[str]:
    """Namens-Queries fuer manuelle Kandidaten (nicht fuer Auto-Link).

    `record` nur per exakter `exercise_id` (oder vom Aufrufer) — nie per
    Fuzzy-`resolve_query(display_name)`. Sonst erbt z.B. „Klimmzug im
    Obergriff" die Aliase von „Untergriff-Klimmzug"/Chin-Up und verlinkt
    die falsche Quelle.
    """
    queries: list[str] = []
    seen: set[str] = set()

    def add(value: Any) -> None:
        text = str(value or "").strip()
        if not text:
            return
        key = text.casefold()
        if key in seen:
            return
        seen.add(key)
        queries.append(text)

    add(display_name)
    add(exercise_id)

    if record is None and exercise_id:
        record = find_by_id(str(exercise_id), build_exercise_index())

    if record is not None:
        english = str(record.english or "").strip()
        display = str(record.display_name or "").strip()
        equipment = [str(item).strip() for item in (record.equipment or []) if str(item).strip()]

        for value in (
            record.display_name,
            record.german,
            record.exercise_id,
            record.wger_id and f"wger_{record.wger_id}",
            record.yuhonas_id,
        ):
            add(value)
        # Erst spezifische Varianten wie "Barbell Deadlift" erzeugen, damit
        # generische Namen ("Deadlift") nicht an irgendeine yuhonas-Variante
        # mit demselben Kernwort binden (Axle/Trap/Sumo/...).
        if english:
            for gear in equipment:
                add(f"{gear} {english}")
        if display and display != english:
            for gear in equipment:
                add(f"{gear} {display}")
        add(english)
        for item in record.aliases or []:
            add(item)
        for item in record.search_aliases or []:
            add(item)

    return queries


def _exact_link_queries(display_name: str, exercise_id: str | None = None) -> list[str]:
    """Nur Aufrufer-Name + ID — keine Alias-Expansion, keine Fuzzy-Nachbarn."""
    queries: list[str] = []
    seen: set[str] = set()
    for value in (display_name, exercise_id):
        text = str(value or "").strip()
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        queries.append(text)
    return queries


def _exact_name_entry(query: str, entries: list[dict[str, Any]]) -> dict[str, Any] | None:
    normalized_query = _norm(query)
    if not normalized_query:
        return None
    for entry in entries:
        if normalized_query in {_norm(text) for text in _candidate_texts(entry)}:
            return entry
    return None


def _merged_external_id_map(wger: dict[str, Any] | None, yuhonas: dict[str, Any] | None) -> dict[str, list[Any]]:
    out: dict[str, list[Any]] = {}
    if wger:
        wger_ids: list[Any] = []
        if wger.get("wger_id") not in (None, ""):
            wger_ids.append(wger.get("wger_id"))
        existing = (wger.get("external_ids") or {}).get("wger") if isinstance(wger.get("external_ids"), dict) else None
        if isinstance(existing, list):
            for item in existing:
                if item not in wger_ids:
                    wger_ids.append(item)
        if wger_ids:
            out["wger"] = wger_ids
    if yuhonas:
        yuhonas_ids: list[Any] = []
        if yuhonas.get("yuhonas_id") not in (None, ""):
            yuhonas_ids.append(yuhonas.get("yuhonas_id"))
        existing = (yuhonas.get("external_ids") or {}).get("yuhonas") if isinstance(yuhonas.get("external_ids"), dict) else None
        if isinstance(existing, list):
            for item in existing:
                if item not in yuhonas_ids:
                    yuhonas_ids.append(item)
        if yuhonas_ids:
            out["yuhonas"] = yuhonas_ids
    return out


def _merge_list_fields(*values: Any) -> list[Any]:
    out: list[Any] = []
    for value in values:
        items = value if isinstance(value, list) else ([] if value in (None, "") else [value])
        for item in items:
            if item not in out:
                out.append(item)
    return out


def find_source_entries(
    display_name: str,
    exercise_id: str | None = None,
    *,
    record: Any = None,
    source_selection: dict | None = None,
    wger_entries: list[dict[str, Any]] | None = None,
    yuhonas_entries: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Sucht die rohen wger-/yuhonas-Einzeleintraege fuer eine Uebung.
    wger: `unreviewed_wger.yml`; yuhonas: Vendor `free-exercise-db` JSON.
    Liefert beide roh und getrennt (`{"wger": entry|None, "yuhonas": entry|None}`).

    Auto-Link-Prioritaet (eng, eindeutig):
      1. explizite wger_id / yuhonas_id / external_ids / source_selection
      2. exakter normalisierter Name von display_name oder exercise_id
    Fuzzy-Treffer landen nur in `*_candidate` zur manuellen Bestaetigung.

    `wger_entries`/`yuhonas_entries`: optional bereits geladene Rohlisten."""
    wger_entry = None
    yuhonas_entry = None
    wger_candidate: dict[str, Any] | None = None
    yuhonas_candidate: dict[str, Any] | None = None
    wger_candidate_score = 0.0
    yuhonas_candidate_score = 0.0

    if wger_entries is None:
        wger_entries = _entries_from_file("unreviewed_wger.yml")
    if yuhonas_entries is None:
        yuhonas_entries = load_yuhonas_bulk_entries()

    if record is None and exercise_id:
        record = find_by_id(str(exercise_id), build_exercise_index())
    wger_hints: list[Any] = []
    yuhonas_hints: list[Any] = []

    if record is not None:
        if record.wger_id not in (None, ""):
            wger_hints.append(record.wger_id)
        if record.external_ids and isinstance(record.external_ids, dict):
            wger_hints.extend((record.external_ids.get("wger") or []))
            yuhonas_hints.extend((record.external_ids.get("yuhonas") or []))
        if record.yuhonas_id not in (None, ""):
            yuhonas_hints.append(record.yuhonas_id)

    # exercise_id selbst als ID-Hinweis (wger_206 / yuhonas_Pullups), ohne Fuzzy.
    eid = str(exercise_id or "").strip()
    if eid.startswith("wger_"):
        suffix = eid.removeprefix("wger_")
        if suffix.isdigit():
            wger_hints.append(int(suffix))
    elif eid.startswith("yuhonas_"):
        yuhonas_hints.append(eid.removeprefix("yuhonas_"))

    for hint in wger_hints:
        wger_entry = wger_entry or _find_wger_entry(wger_entries, hint)
    for hint in yuhonas_hints:
        yuhonas_entry = yuhonas_entry or _find_yuhonas_entry(yuhonas_entries, hint)

    selection = source_selection if source_selection is not None else getattr(record, "source_selection", None) or {}
    if "wger" in selection:
        wger_entry = _find_wger_entry(wger_entries, selection["wger"])
    if "yuhonas" in selection:
        yuhonas_entry = _find_yuhonas_entry(yuhonas_entries, selection["yuhonas"])

    for query in _exact_link_queries(display_name, exercise_id):
        if wger_entry is None and "wger" not in selection:
            wger_entry = _exact_name_entry(query, wger_entries)
        if yuhonas_entry is None and "yuhonas" not in selection:
            yuhonas_entry = _exact_name_entry(query, yuhonas_entries)

    # Fuzzy nur als Vorschlag — nie Auto-Link. Alias-Expansion nur vom
    # exakt per ID geladenen Record, nicht von Namens-Nachbarn.
    for query in _candidate_queries(display_name, exercise_id, record=record):
        if wger_entry is None and "wger" not in selection:
            cand, score = _best_match_scored(query, wger_entries)
            if cand is not None and score >= CANDIDATE_MIN_SCORE and score > wger_candidate_score:
                wger_candidate, wger_candidate_score = cand, score
        if yuhonas_entry is None and "yuhonas" not in selection:
            cand, score = _best_match_scored(query, yuhonas_entries)
            if cand is not None and score >= CANDIDATE_MIN_SCORE and score > yuhonas_candidate_score:
                yuhonas_candidate, yuhonas_candidate_score = cand, score

    return {
        "wger": wger_entry,
        "yuhonas": yuhonas_entry,
        "wger_candidate": None if wger_entry is not None else wger_candidate,
        "yuhonas_candidate": None if yuhonas_entry is not None else yuhonas_candidate,
        "wger_candidate_score": None if wger_entry is not None or wger_candidate is None else wger_candidate_score,
        "yuhonas_candidate_score": None if yuhonas_entry is not None or yuhonas_candidate is None else yuhonas_candidate_score,
    }


def build_external_seed(display_name: str, exercise_id: str | None = None, *, source_selection: dict | None = None) -> dict[str, Any] | None:
    found = find_source_entries(display_name, exercise_id, source_selection=source_selection)
    wger_entry = found["wger"]
    yuhonas_entry = found["yuhonas"]

    if not wger_entry and not yuhonas_entry:
        return None

    base = deepcopy(wger_entry or yuhonas_entry or {})
    canonical_id = (
        exercise_id
        or base.get("exercise_id")
        or (yuhonas_entry or {}).get("exercise_id")
        or (wger_entry or {}).get("exercise_id")
    )
    merged = {
        "exercise_id": canonical_id,
        "id": canonical_id,
        "display_name": (wger_entry or {}).get("display_name") or (yuhonas_entry or {}).get("display_name") or display_name,
        "german": (wger_entry or {}).get("german") or (yuhonas_entry or {}).get("german") or display_name,
        "english": (wger_entry or {}).get("english") or (yuhonas_entry or {}).get("english") or (yuhonas_entry or {}).get("display_name") or display_name,
        "category": (wger_entry or {}).get("category") or (yuhonas_entry or {}).get("category"),
        "equipment": _merge_list_fields((wger_entry or {}).get("equipment"), (yuhonas_entry or {}).get("equipment")),
        # Rohe Regionsnamen (yuhonas liefert "chest"/"shoulders"/"triceps" statt
        # kanonischer IDs) MUESSEN vor dem Merge aufgeloest werden — sonst landen
        # sie unaufgeloest NEBEN den bereits kanonischen wger-IDs im Draft
        # (grobe Regionen duerfen nie als Muskel-Eintrag stehen bleiben).
        "primary_muscles": normalize_exercise_muscle_list(
            _merge_list_fields((wger_entry or {}).get("primary_muscles"), (yuhonas_entry or {}).get("primary_muscles")),
            display_name,
        ),
        "secondary_muscles": normalize_exercise_muscle_list(
            _merge_list_fields((wger_entry or {}).get("secondary_muscles"), (yuhonas_entry or {}).get("secondary_muscles")),
            display_name,
        ),
        "stabilizers": normalize_exercise_muscle_list(
            _merge_list_fields((wger_entry or {}).get("stabilizers"), (yuhonas_entry or {}).get("stabilizers")),
            display_name,
        ),
        "instructions": deepcopy((yuhonas_entry or {}).get("instructions")) or deepcopy((yuhonas_entry or {}).get("coaching_notes")) or [],
        "images": deepcopy((yuhonas_entry or {}).get("images")) or [],
        "coaching_notes": _merge_list_fields((wger_entry or {}).get("coaching_notes"), (yuhonas_entry or {}).get("coaching_notes")),
        "original_description": (
            deepcopy((wger_entry or {}).get("original_description"))
            or deepcopy((yuhonas_entry or {}).get("original_description"))
            or _merge_list_fields((wger_entry or {}).get("coaching_notes"))
            or _merge_list_fields((yuhonas_entry or {}).get("instructions"))
            or _merge_list_fields((yuhonas_entry or {}).get("coaching_notes"))
        ),
        "wger_id": (wger_entry or {}).get("wger_id"),
        "wger_muscle_ids": deepcopy((wger_entry or {}).get("wger_muscle_ids")),
        "yuhonas_id": (yuhonas_entry or {}).get("yuhonas_id"),
        "external_ids": _merged_external_id_map(wger_entry, yuhonas_entry),
        "tags": _merge_list_fields((wger_entry or {}).get("tags"), (yuhonas_entry or {}).get("tags")),
        "search_aliases": _merge_list_fields((wger_entry or {}).get("search_aliases"), (yuhonas_entry or {}).get("search_aliases")),
        "aliases": _merge_list_fields((wger_entry or {}).get("aliases"), (yuhonas_entry or {}).get("aliases")),
    }
    if wger_entry and yuhonas_entry:
        merged["tags"] = _merge_list_fields(merged.get("tags"), ["merged_external", "wger", "yuhonas"])
    return {key: value for key, value in merged.items() if value not in (None, "", [], {})}


def search_source_entries(source: str, query: str, limit: int = 30) -> list[dict]:
    """Search raw sources even when a curated record supersedes them in normal search."""
    query = str(query or "").strip().casefold()
    if not query:
        return []
    if source == "yuhonas":
        entries = load_yuhonas_bulk_entries()
    else:
        entries = _entries_from_file(f"unreviewed_{source}.yml")
    matches = []
    for entry in entries:
        sid = entry.get(f"{source}_id")
        texts = _candidate_texts(entry) + [str(sid)]
        if not any(query in text.casefold() for text in texts):
            continue
        matches.append({"id": sid, "display_name": entry.get("display_name") or entry.get("name"),
                        "english": entry.get("english"), "equipment": entry.get("equipment") or [],
                        "description": str(entry.get("original_description") or entry.get("instructions") or "")[:600]})
    matches.sort(key=lambda e: (str(e['id']).casefold() != query, str(e.get('display_name') or '').casefold() != query, str(e['id'])))
    return matches[:limit]
