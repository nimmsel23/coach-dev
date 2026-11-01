from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

try:
    from rapidfuzz import fuzz, process
except ImportError:
    from difflib import SequenceMatcher
    fuzz = None
    process = None

import json
from fitness.catalog.core.loader import load_catalog_directory_yaml, load_catalog_yaml, catalog_path

GYM_VOCAB = {
    "kh": "kurzhantel dumbbell",
    "kurzhantel": "kurzhantel kh dumbbell",
    "lh": "langhantel barbell",
    "langhantel": "langhantel lh barbell",
    "sz": "sz-hantel sz-bar",
    "db": "dumbbell kurzhantel",
    "dumbbell": "dumbbell kurzhantel kh",
    "bb": "barbell langhantel",
    "barbell": "barbell langhantel lh",
}

GENERIC_FUZZY_TOKENS = {
    "barbell", "bb", "bodyweight", "cable", "curl", "db", "dumbbell", "extension",
    "fly", "hantel", "kh", "kurzhantel", "langhantel", "lh", "machine", "press",
    "pull", "push", "raise", "row", "squat", "sz", "zug",
}

GENERIC_REGION_REASSIGNMENT = [
    (re.compile(r"external rotation|internal rotation|au(ss|ß)enrotation|innenrotation|rotator ?cuff", re.I), "304_rotator_cuff"),
    (re.compile(r"rear|reverse|posterior|face.?pull|hintere schulter|vorgebeugt", re.I), "303_posterior_deltoid"),
    (re.compile(r"lateral raise|side raise|seitheben", re.I), "302_lateral_deltoid"),
    (re.compile(r"front raise|frontheben", re.I), "301_anterior_deltoid"),
]


@dataclass
class ExerciseRecord:
    exercise_id: str
    display_name: str
    source_file: str
    source: str = "expert"
    categories: list[str] = field(default_factory=list) # Bridge Network: chest, push, legs...
    category: str = ""
    german: str = ""
    english: str = ""
    movement_pattern: str = ""
    movements: list[str] | None = None
    equipment: list[str] | None = None
    aliases: list[str] | None = None
    primary_muscles: list[str] | None = None
    secondary_muscles: list[str] | None = None
    stabilizers: list[str] | None = None
    variations: list[str] | None = None
    coaching_notes: list[str] | None = None
    common_errors: list[str] | None = None
    tags: list[str] | None = None
    search_aliases: list[str] | None = None
    external_ids: dict[str, Any] | None = None
    gif_url: str | None = None
    image_url: str | None = None
    images: list[str] | None = None
    instructions: list[str] | None = None
    wger_id: int | None = None
    wger_muscle_ids: dict | None = None
    anatomy: dict[str, Any] | None = None
    yuhonas_id: str | None = None
    original_description: str | list[str] | None = None
    logged_by_uid: str | None = None
    source_snapshot: dict[str, Any] | None = None
    source_selection: dict[str, Any] | None = None


@dataclass
class ResolveResult:
    query: str
    matched: bool
    canonical_id: str | None
    display_name: str | None
    source: str
    confidence: str
    suggestions: list[dict[str, str]]


def build_exercise_index() -> list[ExerciseRecord]:
    """Erstellt den konsolidierten Netzwerk-Index aller Übungen mit intelligenter Merging-Logik."""
    index: dict[str, ExerciseRecord] = {}
    # Hilfs-Maps für das Merging von Bulk-Daten in Expert-Records
    by_wger: dict[int, str] = {} # wger_id -> target_canonical_id
    by_name: dict[str, str] = {} # normalized_name -> target_canonical_id
    
    # In zwei Durchläufen laden: 1. Expert/Inbox (Katalog-Gerüst), 2. Bulk (Anreicherung/Fallback)
    # kb/inbox/ zusaetzlich zu kb/exercises/ scannen - Inbox-Drafts (inbox_*.yml)
    # sollen aus exercises/ raus, sonst verschwinden sie hier aus dem Index
    # (Suche/Demand-Audit sehen sie sonst nie).
    all_docs = load_catalog_directory_yaml("exercises") + load_catalog_directory_yaml("inbox")
    expert_docs = []
    bulk_docs = []
    
    for path, doc in all_docs:
        if path.name.startswith("unreviewed_"):
            bulk_docs.append((path, doc))
        else:
            expert_docs.append((path, doc))

    # Durchlauf 1: Expert & Inbox (Die "Wahrheit" setzen)
    for path, document in expert_docs:
        if not isinstance(document, dict): continue
        ext = path.suffix
        filename = path.name
        is_anatomy = ext == ".yaml"
        source_tier = "inbox" if filename.startswith("inbox_") else "expert"
        file_node = document.get("name") or path.stem
        
        exercises = document.get("exercises", [])
        if not isinstance(exercises, list): continue
        # Datei-Name als Netzwerk-Kategorie ergibt nur bei echten Gruppen-Dateien
        # Sinn (chest.yml/back.yml mit mehreren Exercises) - Einzelexercise-Dateien
        # (brustpresse.yml, body_rows.yml, alle inbox_*.yml) tragen ihre Kategorie
        # schon korrekt im per-entry `category:`-Feld, ihr Dateiname ist kein
        # Gruppen-Label. Aktuell hat kein inbox_*.yml mehr als 1 Exercise, dieser
        # Check schließt sie also implizit mit ein, ohne den Filename zu hardcoden.
        is_grouping_file = len(exercises) > 1

        for entry in exercises:
            ex_id = None
            entry_name = None
            w_id = None
            
            if isinstance(entry, (str, int)):
                ex_id = str(entry).zfill(3) if isinstance(entry, int) else str(entry)
            elif isinstance(entry, dict):
                ex_id = first_text(entry, "exercise_id", "id", "canonical_id")
                entry_name = first_text(entry, "display_name", "name")
                w_id = entry.get("wger_id")
                if not ex_id and path.stem.isdigit():
                    ex_id = path.stem.zfill(3)
            
            if not ex_id: continue
            if ex_id.isdigit(): ex_id = ex_id.zfill(3)

            if ex_id not in index:
                index[ex_id] = ExerciseRecord(
                    exercise_id=ex_id, 
                    display_name=entry_name or ex_id, 
                    source_file=filename, 
                    source=source_tier
                )
            
            rec = index[ex_id]
            
            # Cross-References registrieren
            if w_id: by_wger[int(w_id)] = ex_id
            if entry_name: 
                by_name[normalize_text(entry_name, smart=True)] = ex_id
            
            # Auch deutsche/englische Namen und Aliase indexieren
            if isinstance(entry, dict):
                german = first_text(entry, "german", "de")
                if german: by_name[normalize_text(german, smart=True)] = ex_id
                english = first_text(entry, "english", "en")
                if english: by_name[normalize_text(english, smart=True)] = ex_id
                aliases = list_of_text(entry.get("aliases"))
                if aliases:
                    for a in aliases: by_name[normalize_text(a, smart=True)] = ex_id
                search_aliases = list_of_text(entry.get("search_aliases"))
                if search_aliases:
                    for a in search_aliases: by_name[normalize_text(a, smart=True)] = ex_id

            # Netzwerk-Verknüpfung (Brücke)
            # Inbox-Dateien tragen als `name:` nur ihren eigenen Dateinamen
            # (z.B. "inbox_brustpresse_") - das ist kein echtes Kategorie-Label
            # wie bei chest.yml/back.yml, sondern nur ein generierter Datei-Identifier.
            if file_node and not path.stem.isdigit() and not is_anatomy and is_grouping_file:
                if file_node not in rec.categories:
                    rec.categories.append(file_node)

            # Daten Mergen
            if is_anatomy:
                rec.anatomy = entry if isinstance(entry, dict) else {}
                if not rec.primary_muscles:
                    rec.primary_muscles = list_of_text(rec.anatomy.get("primary_muscles"))
            else:
                if entry_name: rec.display_name = entry_name
                # Basis-Felder
                for f in ["category", "german", "english", "movement_pattern", "wger_id", "gif_url", "image_url", "external_ids", "yuhonas_id", "original_description", "logged_by_uid", "source_selection"]:
                    val = entry.get(f) if isinstance(entry, dict) else None
                    if val: setattr(rec, f, val)
                
                # Listen-Felder
                for lf in ["equipment", "aliases", "search_aliases", "movements", "primary_muscles", "secondary_muscles", "stabilizers", "variations", "coaching_notes", "common_errors", "tags"]:
                    val = list_of_text(entry.get(lf)) if isinstance(entry, dict) else None
                    if val:
                        existing = getattr(rec, lf) or []
                        setattr(rec, lf, sorted(list(set(existing + val))))
                
                if isinstance(entry, dict) and entry.get("wger_muscle_ids"):
                    rec.wger_muscle_ids = entry["wger_muscle_ids"]

                # origin.wger/origin.yuhonas: rohe Einzeltreffer, die
                # `attach_source_snapshot()` (inbox_actions.py) unter dem
                # bestehenden `origin`-Feld anhaengt (neben dessen
                # `type`/`source_refs`) — unveraendert durchreichen, damit
                # das Coach-Sheet "wger sagt X, yuhonas sagt Y" getrennt
                # zeigen kann, statt dass die Attribution beim Index-Bau
                # verloren geht.
                if isinstance(entry, dict):
                    origin = entry.get("origin")
                    if isinstance(origin, dict):
                        raw_sources = {
                            key: origin[key]
                            for key in ("wger", "yuhonas")
                            if isinstance(origin.get(key), dict)
                        }
                        if raw_sources:
                            rec.source_snapshot = raw_sources

    # Durchlauf 2: Bulk (Anreicherung oder Fallback)
    for path, document in bulk_docs:
        exercises = document.get("exercises", [])
        for entry in exercises:
            if not isinstance(entry, dict): continue
            
            w_id = entry.get("wger_id")
            name = first_text(entry, "display_name", "name")
            german = first_text(entry, "german", "de")
            english = first_text(entry, "english", "en")

            target_id = None
            # 1. Matching über wger_id
            if w_id and int(w_id) in by_wger:
                target_id = by_wger[int(w_id)]
            # 2. Matching über Namen
            else:
                norm_name = normalize_text(name, smart=True) if name else None
                norm_german = normalize_text(german, smart=True) if german else None
                norm_english = normalize_text(english, smart=True) if english else None
                if norm_name and norm_name in by_name:
                    target_id = by_name[norm_name]
                elif norm_german and norm_german in by_name:
                    target_id = by_name[norm_german]
                elif norm_english and norm_english in by_name:
                    target_id = by_name[norm_english]

            if target_id:
                # Merge in Expert Record (nur anreichern, was fehlt)
                rec = index[target_id]
                if not rec.wger_id and w_id: rec.wger_id = w_id
                if not rec.german and german: rec.german = german
                if not rec.english and english: rec.english = english
                if not rec.gif_url and entry.get("gif_url"): rec.gif_url = entry["gif_url"]
                if not rec.yuhonas_id and entry.get("yuhonas_id"): rec.yuhonas_id = entry["yuhonas_id"]
                if not rec.original_description:
                    rec.original_description = entry.get("original_description") or entry.get("coaching_notes") or None
                # Muskeln anreichern falls Expert-Record noch keine hat
                if not rec.primary_muscles:
                    rec.primary_muscles = list_of_text(entry.get("primary_muscles"))
                if not rec.secondary_muscles:
                    rec.secondary_muscles = list_of_text(entry.get("secondary_muscles"))
                # Wger Muscle IDs spiegeln falls vorhanden
                if entry.get("wger_muscle_ids") and not rec.wger_muscle_ids:
                    rec.wger_muscle_ids = entry["wger_muscle_ids"]
            else:
                # Neuen Bulk-Record anlegen
                ex_id = first_text(entry, "exercise_id", "id")
                if ex_id not in index:
                    index[ex_id] = ExerciseRecord(
                        exercise_id=ex_id,
                        display_name=name or ex_id,
                        source_file=path.name,
                        source="bulk",
                        german=german,
                        primary_muscles=list_of_text(entry.get("primary_muscles")),
                        secondary_muscles=list_of_text(entry.get("secondary_muscles")),
                        wger_id=w_id,
                        gif_url=entry.get("gif_url"),
                        yuhonas_id=entry.get("yuhonas_id"),
                        external_ids=entry.get("external_ids"),
                        original_description=entry.get("original_description") or entry.get("coaching_notes") or None,
                    )
                    # Bugfix: ohne diese Registrierung findet Durchlauf 3
                    # (Yuhonas) denselben, hier gerade neu angelegten
                    # Bulk-Eintrag nie wieder — by_wger/by_name wurden bisher
                    # nur aus Durchlauf 1 (Expert/Inbox) befuellt. Ergebnis:
                    # zwei separate unreviewed-Eintraege (bulk + yuhonas) fuer
                    # dieselbe reale Uebung, beide parallel in der Search
                    # sichtbar, statt eines einzigen mergebaren Inbox-Drafts.
                    if w_id:
                        by_wger[int(w_id)] = ex_id
                    for candidate in (norm_name, norm_german, norm_english):
                        if candidate:
                            by_name[candidate] = ex_id

    # Durchlauf 3: Yuhonas (Bilder + Instructions mergen, oder neuer Fallback-Record)
    yuhonas_dir = catalog_path("../yuhonas")
    if yuhonas_dir.exists():
        try:
            muscle_index = load_catalog_yaml("muscle_index.yml")
            string_aliases = muscle_index.get("string_aliases", {})
        except Exception:
            string_aliases = {}

        def resolve_muscle_strings(names: list) -> list:
            return [string_aliases.get(m, m) for m in (names or [])]

        def refine_generic_region_labels(muscles: list[str], exercise_name: str) -> list[str]:
            generic_shoulders = {"shoulders", "300_shoulders"}
            if not generic_shoulders.intersection(muscles):
                return muscles
            for pattern, replacement in GENERIC_REGION_REASSIGNMENT:
                if pattern.search(exercise_name or ""):
                    return [replacement if m in generic_shoulders else m for m in muscles]
            return muscles

        for json_file in sorted(yuhonas_dir.glob("*.json")):
            try:
                raw = json.loads(json_file.read_text())
            except Exception:
                continue

            name = raw.get("name", "")
            norm = normalize_text(name, smart=True)
            target_id = by_name.get(norm)

            images = raw.get("images") or []
            instructions = raw.get("instructions") or []
            primary = resolve_muscle_strings(raw.get("primaryMuscles", []))
            secondary = resolve_muscle_strings(raw.get("secondaryMuscles", []))
            primary = refine_generic_region_labels(primary, name)
            secondary = refine_generic_region_labels(secondary, name)

            if target_id and target_id in index:
                rec = index[target_id]
                if not rec.yuhonas_id:
                    rec.yuhonas_id = json_file.stem
                if not rec.images and images:
                    rec.images = images
                if not rec.instructions and instructions:
                    rec.instructions = instructions
                if not rec.primary_muscles and primary:
                    rec.primary_muscles = primary
                if not rec.secondary_muscles and secondary:
                    rec.secondary_muscles = secondary
            else:
                ex_id = f"yuhonas_{json_file.stem}"
                if ex_id not in index:
                    index[ex_id] = ExerciseRecord(
                        exercise_id=ex_id,
                        display_name=name,
                        source_file=json_file.name,
                        source="yuhonas",
                        tags=["yuhonas", "unreviewed"],
                        yuhonas_id=json_file.stem,
                        primary_muscles=primary,
                        secondary_muscles=secondary,
                        images=images,
                        instructions=instructions,
                        equipment=[raw.get("equipment")] if raw.get("equipment") else None,
                    )
                    by_name[norm] = ex_id

    # Raw-source name merges must not undo a deliberate Coach unlink/replacement.
    from fitness.catalog.core.source_selection import apply_source_selection
    for rec in index.values():
        if rec.source_selection:
            corrected = apply_source_selection(vars(rec))
            rec.wger_id = corrected.get("wger_id")
            rec.yuhonas_id = corrected.get("yuhonas_id")
            rec.external_ids = corrected.get("external_ids")
            rec.wger_muscle_ids = corrected.get("wger_muscle_ids")
            rec.search_aliases = corrected.get("search_aliases")
            rec.aliases = corrected.get("aliases")

    # Expert-Vorrang: Expert > Inbox > Bulk. Stabile Sortierung bewahrt
    # die innere Reihenfolge je Tier. Alle Lookups iterieren über diese Liste,
    # also gewinnt bei Gleichstand immer der höherwertige Eintrag.
    tier_rank = {"expert": 0, "inbox": 1, "bulk": 2}
    return sorted(
        index.values(),
        key=lambda r: (tier_rank.get(r.source, 3), r.exercise_id),
    )


# Score-Bonus im Fuzzy-Match, damit ein knapper Bulk-Treffer einen
# leicht schlechteren Expert-Treffer nicht verdrängt.
SOURCE_SCORE_BONUS = {"expert": 10, "inbox": 5, "bulk": 0}


def resolve_query(query: str, records: list[ExerciseRecord] | None = None) -> ResolveResult:
    if records is None:
        records = build_exercise_index()
    normalized_query = normalize_text(query, smart=True)
    alias_map = load_alias_map()

    exact = find_exact_id(query, records)
    if exact:
        return matched_result(query, exact, "canonical_id", "high", [])

    alias_match = alias_map.get(normalized_query)
    if alias_match:
        record = find_by_id(alias_match, records)
        if record:
            return matched_result(query, record, "alias", "high", [])

    name_match = find_name_match(normalized_query, records)
    if name_match:
        return matched_result(query, name_match, "name", "high", [])

    fuzzy_match, suggestions = find_fuzzy_match(normalized_query, records)
    if fuzzy_match:
        # Rapidfuzz scores are 0-100
        confidence = "high" if fuzzy_match.score >= 90 else ("medium" if fuzzy_match.score >= 75 else "low")
        return matched_result(query, fuzzy_match.record, "fuzzy", confidence, suggestions)

    return ResolveResult(
        query=query,
        matched=False,
        canonical_id=None,
        display_name=None,
        source="none",
        confidence="low",
        suggestions=suggestions_for_unknown(normalized_query, records),
    )


def load_alias_map() -> dict[str, str]:
    try:
        aliases = load_catalog_yaml("registry/aliases.yml")
    except FileNotFoundError:
        return {}
    if not isinstance(aliases, dict):
        return {}
    raw_aliases = aliases.get("aliases", aliases)
    if not isinstance(raw_aliases, dict):
        return {}
    result: dict[str, str] = {}
    for alias, canonical_id in raw_aliases.items():
        if not isinstance(alias, str):
            continue
        if isinstance(canonical_id, int):
            canonical_id = str(canonical_id).zfill(3)
        elif not isinstance(canonical_id, str):
            continue
        result[normalize_text(alias, smart=True)] = canonical_id
    return result


def find_exact_id(query: str, records: list[ExerciseRecord]) -> ExerciseRecord | None:

    query_text = query.strip()
    for record in records:
        if record.exercise_id == query_text:
            return record
    return None


def find_by_id(exercise_id: str, records: list[ExerciseRecord]) -> ExerciseRecord | None:
    for record in records:
        if record.exercise_id == exercise_id:
            return record

    # Alias-Auflösung: Nach einem Bulk-Merge in build_exercise_index() (Durchlauf
    # 2/3) existiert "wger_312"/"yuhonas_xyz" NICHT mehr als eigener Index-Key —
    # die Daten sind in den Tier-1-Record gemergt, nur wger_id/yuhonas_id zeigen
    # noch dorthin. Ohne das hier landet z.B. eine Session, die einen Bulk-Treffer
    # vor dessen Approval geloggt hat, nach dem Approve ins Leere (find_by_id
    # findet nichts mehr), statt auf den jetzt kuratierten Tier-1-Eintrag zu zeigen.
    if exercise_id.startswith("wger_"):
        try:
            w_id = int(exercise_id.removeprefix("wger_"))
        except ValueError:
            w_id = None
        if w_id is not None:
            for record in records:
                if record.wger_id == w_id:
                    return record
    elif exercise_id.startswith("yuhonas_"):
        y_id = exercise_id.removeprefix("yuhonas_")
        for record in records:
            if record.yuhonas_id == y_id:
                return record

    return None


def find_name_match(normalized_query: str, records: list[ExerciseRecord]) -> ExerciseRecord | None:
    for record in records:
        for candidate in candidate_texts(record):
            if normalized_query == normalize_text(candidate, smart=True):
                return record
    return None


@dataclass
class FuzzyMatch:
    record: ExerciseRecord
    score: float


def find_fuzzy_match(normalized_query: str, records: list[ExerciseRecord]) -> tuple[FuzzyMatch | None, list[dict[str, str]]]:
    if not records:
        return None, []

    # Kandidaten NICHT mit GYM_VOCAB expandieren — nur der Query wird expandiert.
    # Sonst wird z.B. "Pin Squat" zu "pin kniebeuge squat" und matcht falsch besser.
    candidate_map: dict[str, ExerciseRecord] = {}
    for r in records:
        for text in candidate_texts(r):
            norm = normalize_text(text, smart=False)
            if norm not in candidate_map:
                candidate_map[norm] = r

    choices = list(candidate_map.keys())
    
    if process and fuzz:
        # token_set_ratio allein gibt 100 für jeden Kandidaten der den Query enthält
        # (z.B. "squat" → "bulgarian split squat" = 100). Kombination mit token_sort_ratio
        # als Tiebreaker bevorzugt kürzere, spezifischere Treffer.
        def combined_score(q: str, c: str, **_) -> float:
            return fuzz.token_set_ratio(q, c) * 0.65 + fuzz.token_sort_ratio(q, c) * 0.35

        results = process.extract(normalized_query, choices, scorer=combined_score, limit=5)

        if not results:
            return None, []

        scored = [
            FuzzyMatch(record=candidate_map[res[0]], score=res[1])
            for res in results
            if fuzzy_candidate_allowed(normalized_query, res[0])
        ]
        if not scored:
            suggestions = suggestions_from_scored([
                FuzzyMatch(record=candidate_map[res[0]], score=res[1])
                for res in results
            ])
            return None, suggestions
        for fm in scored:
            fm.score += SOURCE_SCORE_BONUS.get(fm.record.source, 0)
        scored.sort(key=lambda x: x.score, reverse=True)
        suggestions = suggestions_from_scored(scored)

        best = scored[0]
        raw_score = best.score - SOURCE_SCORE_BONUS.get(best.record.source, 0)
        if raw_score < 75:
            return None, suggestions

        return best, suggestions
    else:
        # Fallback to difflib
        from difflib import SequenceMatcher
        scored_fallback: list[FuzzyMatch] = []
        for norm, record in candidate_map.items():
            if not fuzzy_candidate_allowed(normalized_query, norm):
                continue
            score = SequenceMatcher(None, normalized_query, norm).ratio() * 100
            scored_fallback.append(FuzzyMatch(record=record, score=score))
        
        for fm in scored_fallback:
            fm.score += SOURCE_SCORE_BONUS.get(fm.record.source, 0)
        scored_fallback.sort(key=lambda x: x.score, reverse=True)
        suggestions = suggestions_from_scored(scored_fallback)

        if not scored_fallback or (scored_fallback[0].score - SOURCE_SCORE_BONUS.get(scored_fallback[0].record.source, 0)) < 60:
            return None, suggestions

        return scored_fallback[0], suggestions


def suggestions_for_unknown(normalized_query: str, records: list[ExerciseRecord]) -> list[dict[str, str]]:
    _, suggestions = find_fuzzy_match(normalized_query, records)
    return suggestions


def suggestions_from_scored(scored: list[FuzzyMatch], limit: int = 3) -> list[dict[str, str]]:
    seen: set[str] = set()
    unique_suggestions: list[dict[str, str]] = []
    for item in scored:
        ex_id = item.record.exercise_id
        if not ex_id or ex_id in seen:
            continue
        seen.add(ex_id)
        unique_suggestions.append({
            "canonical_id": ex_id,
            "display_name": item.record.display_name,
        })
        if len(unique_suggestions) >= limit:
            break
    return unique_suggestions


def fuzzy_candidate_allowed(normalized_query: str, normalized_candidate: str) -> bool:
    query_tokens = set(normalized_query.split())
    candidate_tokens = set(normalized_candidate.split())
    meaningful_query_tokens = query_tokens - GENERIC_FUZZY_TOKENS
    if len(query_tokens) <= 1 or not meaningful_query_tokens:
        return True
    return bool(meaningful_query_tokens & candidate_tokens)



def matched_result(query: str, record: ExerciseRecord, source: str, confidence: str, suggestions: list[dict[str, str]]) -> ResolveResult:
    return ResolveResult(
        query=query,
        matched=True,
        canonical_id=record.exercise_id,
        display_name=record.display_name,
        source=source,
        confidence=confidence,
        suggestions=suggestions,
    )


def candidate_texts(record: ExerciseRecord) -> list[str]:
    texts = [record.exercise_id, record.display_name]
    if record.german:
        texts.append(record.german)
    if record.english:
        texts.append(record.english)
    if record.aliases:
        texts.extend(record.aliases)
    if record.search_aliases:
        texts.extend(record.search_aliases)
    return texts


def first_text(entry: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = entry.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def list_of_text(value: Any) -> list[str] | None:
    if not isinstance(value, list):
        return None
    items = [item.strip() for item in value if isinstance(item, str) and item.strip()]
    return items or None


def normalize_text(text: str, smart: bool = False) -> str:
    if not text:
        return ""
        
    normalized = unicodedata.normalize("NFKD", text)
    stripped = "".join(char for char in normalized if not unicodedata.combining(char))
    # Keep alphanumeric and spaces
    collapsed = re.sub(r"[^a-zA-Z0-9]+", " ", stripped.casefold())
    words = collapsed.split()
    
    if smart:
        # Apply Gym Vocabulary substitutions
        words = [GYM_VOCAB.get(w, w) for w in words]
        
    return " ".join(words)
