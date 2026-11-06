"""Kernlogik für Inbox-Review-Aktionen — geteilt zwischen TUI (tui.py) und
CLI (`fitness-catalog inbox ...`). Reine Funktionen ohne rich.Prompt/Confirm-
Abhaengigkeit, damit beide Oberflaechen dieselbe Logik nutzen (kein Copy-Paste
zwischen TUI und CLI, kein Drift zwischen beiden Wegen).
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import re
import subprocess
from typing import Any

import yaml
from loguru import logger

from fitness.catalog.core.paths import DATA_DIR
from fitness.catalog.core.exercise_schema import apply_exercise_schema
from fitness.catalog.core.inbox_pipeline import preserve_reenrich_provenance
from fitness.catalog.core.muscle_normalization import normalize_exercise_muscles
from fitness.catalog.core.source_merge import build_external_seed
from fitness.catalog.core.yaml_utils import load_yaml
from fitness.catalog.agent.gemini import load_gemini_key, call_enrichment, review_with_haiku, review_with_codex


def _git_repo_root(start: Path) -> Path | None:
    try:
        out = subprocess.run(
            ["git", "-C", str(start), "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=5, check=True,
        )
        return Path(out.stdout.strip())
    except Exception:
        return None


def _git_commit_paths(paths: list[Path], message: str) -> bool:
    """Committet exakt die uebergebenen Pfade (bewusst KEIN `git add -A`).

    Inbox-Drafts sind versionierte KB-Daten. Werden neue Drafts nur geschrieben,
    bleiben sie unstaged und koennen spaeter versehentlich in einem unrelated
    Commit einer parallelen Session landen. Darum committet jeder Writer seine
    konkreten Dateien direkt. Approval/Reject nutzen denselben Weg fuer ihre
    Datei- und Registry-Aenderungen.

    Best-effort: Git-Fehler werden geloggt, nie geworfen - ein Commit-Problem
    darf die eigentliche Inbox-Aktion nie blockieren oder rueckgaengig machen.
    """
    paths = [p for p in paths if p is not None]
    if not paths:
        return False
    repo_root = _git_repo_root(paths[0].parent)
    if not repo_root:
        logger.warning("Auto-Commit uebersprungen: kein Git-Repo gefunden.")
        return False
    try:
        subprocess.run(
            ["git", "-C", str(repo_root), "add", "--"] + [str(p) for p in paths],
            check=True, capture_output=True, text=True, timeout=10,
        )
        staged = subprocess.run(
            ["git", "-C", str(repo_root), "diff", "--cached", "--quiet", "--"] + [str(p) for p in paths],
            capture_output=True, timeout=10,
        )
        if staged.returncode == 0:
            return False  # nichts tatsaechlich geaendert
        subprocess.run(
            ["git", "-C", str(repo_root), "commit", "-m", message, "--"] + [str(p) for p in paths],
            check=True, capture_output=True, text=True, timeout=10,
        )
        logger.info(f"Auto-Commit: {message}")
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"Auto-Commit fehlgeschlagen: {e.stderr}")
        return False
    except Exception as e:
        logger.error(f"Auto-Commit fehlgeschlagen: {e}")
        return False


def commit_inbox_draft(path: Path) -> bool:
    """Commite genau einen geschriebenen KB-Inbox-Draft, ohne Push/Approval."""
    return _git_commit_paths([path], f"chore(catalog): save inbox draft {path.stem}")


def _rebuild_runtime_catalog() -> None:
    """~/.aos/fitness/workouts/catalog.json (gelesen von server.mjs/fitness-
    runtime.mjs, Dev UND Prod-Node :6100) wird nur per `npm run build:catalog`
    gebaut - ohne diesen Trigger bleibt es nach jedem Approve/Reject stale,
    bis irgendwer manuell rebuildet. Best-effort, Fehler blockieren die
    eigentliche Inbox-Aktion nicht."""
    repo_root = _git_repo_root(DATA_DIR)
    if not repo_root:
        return
    script = repo_root / "scripts" / "build-catalog.py"
    if not script.exists():
        return
    try:
        subprocess.run(
            ["python3", str(script)],
            cwd=str(repo_root), capture_output=True, text=True, timeout=30, check=True,
        )
        logger.info("catalog.json neu gebaut (Approve/Reject-Trigger).")
    except Exception as e:
        logger.error(f"catalog.json-Rebuild fehlgeschlagen: {e}")


def inbox_dir() -> Path:
    """kb/inbox/ - alleinige Ablage fuer unreviewte Drafts (inbox_*.yml)."""
    return DATA_DIR / "inbox"


def exercises_dir() -> Path:
    """kb/exercises/ - Ziel fuer approvte/canonical Exercise-Dateien."""
    return DATA_DIR / "exercises"


def tombstones_path() -> Path:
    """Registry fuer bewusst verworfene Inbox-Drafts.

    Firestore/Runtime-Pulls koennen alte Inbox-JSONs erneut liefern. Der
    Tombstone verhindert, dass daraus wieder ein lokaler Review-Draft entsteht.
    """
    return DATA_DIR / "registry" / "inbox_tombstones.yml"


def list_inbox_files() -> list[Path]:
    # Fallback auf kb/exercises/ falls dort noch (alte) Drafts liegen, siehe
    # tui.py::_find_inbox_files() fuer denselben Grund.
    return sorted(list(inbox_dir().glob("inbox_*.yml")) + list(exercises_dir().glob("inbox_*.yml")))


def load_inbox_entry(file_id: str) -> tuple[Path, dict[str, Any]]:
    """Laedt einen Inbox-Draft anhand seiner file_id (z.B. "inbox_wger_851",
    mit oder ohne .yml-Endung). Wirft FileNotFoundError/ValueError bei Problemen.
    """
    stem = file_id[:-4] if file_id.endswith(".yml") else file_id
    f = inbox_dir() / f"{stem}.yml"
    if not f.exists():
        f = exercises_dir() / f"{stem}.yml"
    if not f.exists():
        raise FileNotFoundError(f"Inbox-Datei nicht gefunden: {stem}.yml")
    doc = load_yaml(f)
    exercises = doc.get("exercises") or [{}]
    ex = exercises[0]
    if not ex:
        raise ValueError(f"{f.name}: kein exercises[0]-Eintrag")
    return f, ex


def display_name_of(ex: dict[str, Any], fallback: str) -> str:
    return ex.get("display_name") or ex.get("german") or ex.get("name") or fallback


def list_approved_exercise_files() -> list[Path]:
    files: list[Path] = []
    for f in sorted(exercises_dir().glob("*.yml")):
        if f.name.startswith("unreviewed_") or f.name.startswith("approved_from_firebase"):
            continue
        try:
            doc = load_yaml(f)
        except Exception:
            continue
        exercises = doc.get("exercises") or []
        if len(exercises) != 1 or not isinstance(exercises[0], dict):
            continue
        ex = exercises[0]
        source = str(ex.get("source") or "")
        if source in {"approved", "expert"} or str(doc.get("description") or "").startswith("Expert details for "):
            files.append(f)
    return files


def _norm_key(value: Any) -> str:
    return str(value or "").strip().casefold().replace("-", "_").replace(" ", "_")


def _append_unique(target: list[Any], values: list[Any]) -> None:
    seen = {str(item) for item in target if item is not None}
    for value in values:
        if value is None or value == "":
            continue
        key = str(value)
        if key in seen:
            continue
        target.append(value)
        seen.add(key)


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if value is None or value == "":
        return []
    return [value]


def _infer_source_refs(f: Path, ex: dict[str, Any]) -> tuple[list[int], list[str], list[str]]:
    """Preserve external source identity when a draft becomes an expert entry.

    The coach-facing exercise keeps its clean local ID/name. Raw source IDs stay
    in hidden search/merge fields so Firestore/search can suppress duplicate
    wger/yuhonas imports without exposing their names in the UI.
    """
    wger_ids: list[int] = []
    yuhonas_ids: list[str] = []
    search_aliases: list[str] = []

    candidates = [f.stem, ex.get("exercise_id"), ex.get("id")]
    for value in candidates:
        text = str(value or "")
        match = re.fullmatch(r"(?:inbox_)?wger_(\d+)", text)
        if match:
            wger_ids.append(int(match.group(1)))
            search_aliases.append(f"wger_{match.group(1)}")
        if text.startswith("yuhonas_"):
            search_aliases.append(text)
        if text.startswith("inbox_yuhonas_"):
            search_aliases.append(text.removeprefix("inbox_"))

    existing_wger_id = ex.get("wger_id")
    if existing_wger_id:
        try:
            wger_ids.append(int(existing_wger_id))
            search_aliases.append(f"wger_{int(existing_wger_id)}")
        except (TypeError, ValueError):
            pass

    for value in _as_list(ex.get("yuhonas_id")):
        yuhonas_ids.append(str(value))
        search_aliases.append(str(value))

    for key in ("display_name", "german", "english", "name"):
        value = ex.get(key)
        if isinstance(value, str) and value:
            search_aliases.append(value)

    return wger_ids, yuhonas_ids, search_aliases


def _tombstone_keys(file_id: str | None, ex: dict[str, Any] | None = None) -> list[str]:
    ex = ex or {}
    keys: list[str] = []

    for value in (file_id, ex.get("exercise_id"), ex.get("id")):
        text = str(value or "")
        if not text:
            continue
        keys.append(_norm_key(text))
        if text.startswith("inbox_"):
            keys.append(_norm_key(text.removeprefix("inbox_")))
        match = re.fullmatch(r"(?:inbox_)?wger_(\d+)", text)
        if match:
            keys.append(f"wger:{match.group(1)}")

    wger_id = ex.get("wger_id")
    if wger_id:
        keys.append(f"wger:{wger_id}")

    yuhonas_id = ex.get("yuhonas_id")
    for value in _as_list(yuhonas_id):
        keys.append(f"yuhonas:{_norm_key(value)}")
        keys.append(_norm_key(value))

    for key in ("display_name", "german", "english", "name"):
        value = ex.get(key)
        if isinstance(value, str) and value:
            keys.append(f"name:{_norm_key(value)}")

    unique: list[str] = []
    seen: set[str] = set()
    for key in keys:
        if key and key not in seen:
            seen.add(key)
            unique.append(key)
    return unique


def _load_tombstones() -> dict[str, Any]:
    path = tombstones_path()
    if not path.exists():
        return {"version": 1, "tombstones": []}
    doc = load_yaml(path)
    if not isinstance(doc, dict):
        return {"version": 1, "tombstones": []}
    tombstones = doc.get("tombstones")
    if not isinstance(tombstones, list):
        doc["tombstones"] = []
    if "version" not in doc:
        doc["version"] = 1
    return doc


def _write_tombstones(doc: dict[str, Any]) -> None:
    path = tombstones_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.dump(doc, allow_unicode=True, sort_keys=False), encoding="utf-8")


def list_inbox_tombstones() -> list[dict[str, Any]]:
    doc = _load_tombstones()
    return [entry for entry in doc.get("tombstones", []) if isinstance(entry, dict)]


def find_inbox_tombstone(tombstone_id: str) -> dict[str, Any]:
    key = _norm_key(tombstone_id)
    for entry in list_inbox_tombstones():
        candidates = [
            entry.get("id"),
            entry.get("exercise_id"),
            *(entry.get("keys") or []),
        ]
        if any(_norm_key(candidate) == key for candidate in candidates if candidate):
            return entry
    raise FileNotFoundError(f"Graveyard-Eintrag nicht gefunden: {tombstone_id}")


def remove_inbox_tombstone(tombstone_id: str) -> dict[str, Any]:
    target = find_inbox_tombstone(tombstone_id)
    doc = _load_tombstones()
    doc["tombstones"] = [
        entry for entry in doc.get("tombstones", [])
        if not isinstance(entry, dict) or entry.get("id") != target.get("id")
    ]
    _write_tombstones(doc)
    return target


def _source_exercise_for_tombstone(entry: dict[str, Any]) -> dict[str, Any] | None:
    exercise_id = entry.get("exercise_id")
    if not exercise_id:
        return None
    for source_file in ("unreviewed_wger.yml", "unreviewed_yuhonas.yml"):
        path = exercises_dir() / source_file
        if not path.exists():
            continue
        doc = load_yaml(path)
        for ex in doc.get("exercises", []) or []:
            if isinstance(ex, dict) and str(ex.get("exercise_id")) == str(exercise_id):
                return dict(ex)
    return None


def restore_inbox_tombstone(tombstone_id: str) -> Path:
    """Stellt einen Graveyard-Eintrag als Inbox-Draft wieder her und entfernt
    danach den Tombstone. Wenn die Bulk-Quelle nicht mehr vorhanden ist, wird ein
    minimaler Draft aus dem Tombstone erzeugt, damit der Coach ihn reviewen kann.
    """
    entry = find_inbox_tombstone(tombstone_id)
    stem = str(entry.get("id") or f"inbox_{entry.get('exercise_id')}")
    if not stem.startswith("inbox_"):
        stem = f"inbox_{stem}"
    target = inbox_dir() / f"{stem}.yml"
    if target.exists():
        raise FileExistsError(f"Inbox-Datei existiert bereits: {target.name}")

    ex = _source_exercise_for_tombstone(entry)
    if ex is None:
        ex = {
            "exercise_id": entry.get("exercise_id") or stem.removeprefix("inbox_"),
            "display_name": entry.get("display_name") or stem,
            "source": "unreviewed",
            "primary_muscles": [],
            "secondary_muscles": [],
            "stabilizers": [],
        }
    ex["source"] = "unreviewed"

    wrapper = {
        "name": stem,
        "description": f"Restored from graveyard: {entry.get('display_name') or stem}",
        "restored_at": datetime.now(timezone.utc).isoformat(),
        "graveyard_entry": entry,
        "exercises": [ex],
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(yaml.dump(wrapper, allow_unicode=True, sort_keys=False), encoding="utf-8")
    remove_inbox_tombstone(stem)
    _git_commit_paths(
        [target, tombstones_path()],
        f"chore(catalog): restore inbox draft {target.stem}",
    )
    return target


def write_inbox_tombstone(
    file_id: str | Path,
    ex: dict[str, Any] | None = None,
    reason: str = "deleted_inbox",
) -> None:
    stem = file_id.stem if isinstance(file_id, Path) else str(file_id).removesuffix(".yml")
    keys = _tombstone_keys(stem, ex)
    if not keys:
        return

    doc = _load_tombstones()
    tombstones = doc["tombstones"]
    existing_keys: set[str] = set()
    for entry in tombstones:
        if isinstance(entry, dict):
            existing_keys.update(str(key) for key in entry.get("keys", []) if key)
    if any(key in existing_keys for key in keys):
        return

    tombstones.append({
        "id": stem,
        "exercise_id": (ex or {}).get("exercise_id") or (ex or {}).get("id"),
        "display_name": display_name_of(ex or {}, stem),
        "reason": reason,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "keys": keys,
    })

    _write_tombstones(doc)


def is_inbox_tombstoned(file_id: str | Path, ex: dict[str, Any] | None = None) -> bool:
    stem = file_id.stem if isinstance(file_id, Path) else str(file_id).removesuffix(".yml")
    keys = set(_tombstone_keys(stem, ex))
    if not keys:
        return False
    doc = _load_tombstones()
    for entry in doc.get("tombstones", []):
        if not isinstance(entry, dict):
            continue
        if keys.intersection(str(key) for key in entry.get("keys", []) if key):
            return True
    return False


def _merge_source_refs(f: Path, ex: dict[str, Any]) -> None:
    wger_ids, yuhonas_ids, inferred_aliases = _infer_source_refs(f, ex)

    if wger_ids and not ex.get("wger_id"):
        ex["wger_id"] = wger_ids[0]

    external_ids = ex.get("external_ids")
    if not isinstance(external_ids, dict):
        external_ids = {}
    if wger_ids:
        wger_values = _as_list(external_ids.get("wger"))
        _append_unique(wger_values, wger_ids)
        external_ids["wger"] = wger_values
    if yuhonas_ids:
        yuhonas_values = _as_list(external_ids.get("yuhonas"))
        _append_unique(yuhonas_values, yuhonas_ids)
        external_ids["yuhonas"] = yuhonas_values
    if external_ids:
        ex["external_ids"] = external_ids

    search_aliases = _as_list(ex.get("search_aliases"))
    _append_unique(search_aliases, inferred_aliases)
    if search_aliases:
        ex["search_aliases"] = search_aliases


def _find_yuhonas_match(display_name: str, min_score: float = 90.0) -> str | None:
    """Fuzzy-Match eines Anzeigenamens gegen yuhonas-Uebungsnamen. Gibt die
    yuhonas exercise_id (ohne "yuhonas_"-Praefix) zurueck, oder None wenn
    keine sichere Uebereinstimmung existiert. wger und yuhonas teilen keine
    gemeinsame ID — Name-Matching ist die einzige indirekte Bruecke."""
    if not display_name:
        return None
    try:
        from rapidfuzz import fuzz, process
    except ImportError:
        return None

    from fitness.catalog.core.loader import load_catalog_yaml

    doc = load_catalog_yaml("exercises/unreviewed_yuhonas.yml") or {}
    entries = doc.get("exercises") or []
    choices = {
        e["exercise_id"]: e.get("display_name", "")
        for e in entries
        if e.get("exercise_id") and e.get("display_name")
    }
    if not choices:
        return None

    match = process.extractOne(display_name, choices, scorer=fuzz.token_set_ratio)
    if not match or match[1] < min_score:
        return None
    matched_id = match[2]
    return str(matched_id).removeprefix("yuhonas_")


def _merge_missing_source_payload(ex: dict[str, Any], display_name: str, exercise_id: str) -> dict[str, Any]:
    seed = build_external_seed(display_name, exercise_id)
    if not seed:
        return ex

    for key in (
        "wger_id",
        "yuhonas_id",
        "external_ids",
        "original_description",
        "instructions",
        "images",
        "search_aliases",
        "aliases",
    ):
        if ex.get(key) in (None, "", [], {}) and seed.get(key) not in (None, "", [], {}):
            ex[key] = seed.get(key)
    return ex


def _link_source_id(ex: dict[str, Any], source_key: str, entry: dict[str, Any]) -> bool:
    """Setzt `ex["wger_id"]`/`ex["yuhonas_id"]` + `ex["external_ids"][source_key]`
    aus einem gefundenen Rohtreffer, falls die Übung dort noch keine ID hat.
    Das ist die eigentliche "Verlinkung" (nicht nur der rohe Snapshot) —
    macht `wger_id`/`yuhonas_id`/`external_ids` fuer nachfolgende ID-Hinweis-
    Lookups (`source_merge._candidate_queries`, exakt statt fuzzy) und fuer
    `inbox reenrich` (REENRICH_OVERLAY_FIELDS uebernimmt genau diese Felder)
    sofort nutzbar, statt dass die Verknuepfung nur im Snapshot vergraben ist.
    Gibt True zurueck, wenn etwas geaendert wurde."""
    id_field = f"{source_key}_id"
    raw_id = entry.get(id_field)
    changed = False
    if raw_id not in (None, "") and ex.get(id_field) in (None, ""):
        ex[id_field] = raw_id
        changed = True
    if raw_id not in (None, ""):
        external_ids = ex.get("external_ids")
        if not isinstance(external_ids, dict):
            external_ids = {}
        existing_ids = external_ids.get(source_key)
        existing_ids = list(existing_ids) if isinstance(existing_ids, list) else []
        if raw_id not in existing_ids:
            existing_ids.append(raw_id)
            external_ids[source_key] = existing_ids
            ex["external_ids"] = external_ids
            changed = True
    return changed


def attach_source_snapshot(f: Path, ex: dict[str, Any], apply: bool = False) -> dict[str, Any]:
    """Sucht den rohen wger- und yuhonas-Eintrag zu einem Inbox-Draft (per
    ID-Hinweis bzw. Namens-Fuzzy-Match, siehe `source_merge.find_source_entries`)
    und verlinkt bei einem sicheren Treffer (Score >= AUTO_MATCH_MIN_SCORE) NUR
    die IDs (`wger_id`/`yuhonas_id`/`external_ids`, `origin.type`/
    `origin.source_refs`) auf oberster Ebene.

    Frueher wurde hier zusaetzlich der komplette Rohtreffer UNVERAENDERT unter
    `ex["origin"]["wger"]`/`ex["origin"]["yuhonas"]` gespeichert — de facto ein
    Content-Dump pro Inbox-Draft-Datei, trotz des Namens "snapshot" derselbe
    Fehler, den `exercise_schema.py::build_source_snapshot()` schon fuer das
    gleichnamige Feld hatte (siehe dessen Docstring). Per User-Direktive
    ("ich sagte ganz einfach die ids verlinken" / "neue exercise xxx.yml =>
    wger_id + yuhona") entfernt: eine neue/aktualisierte Inbox-Datei traegt
    nur noch die ID-Referenz, nie eine Kopie des rohen Quelltexts. Wer den
    Rohtreffer sehen will (Coach-Sheet "## Quellen"), holt ihn sich zur
    Anzeigezeit ueber `find_source_entries()` per ID — siehe
    `coach_sheet.py::_load_source_blocks()`.

    Treffer zwischen CANDIDATE_MIN_SCORE und AUTO_MATCH_MIN_SCORE werden NIE
    automatisch verlinkt (zu unsicher), sondern nur im Rueckgabewert unter
    `candidates` fuer eine manuelle Review durchgereicht.

    Dry-run per Default (Repo-Konvention, siehe `fitness/runtime/cli.py`):
    ohne `apply=True` wird nichts geschrieben, nur berechnet + zurueckgegeben.
    Bei `apply=True` wird nur geschrieben, wenn mindestens eine ID neu
    dazukommt (.bak vorher, bestehende IDs bleiben erhalten — kein Overwrite
    bereits gesetzter Werte).
    Rueckgabe: {"found": {"wger": bool, "yuhonas": bool}, "changed": bool,
    "candidates": {"wger": {"id":..,"score":..}|None, "yuhonas": ...}, "exercise": ex}.
    """
    from fitness.catalog.core.source_merge import find_source_entries

    ex_id = ex.get("exercise_id") or ex.get("id") or f.stem.replace("inbox_", "")
    display_name = display_name_of(ex, ex_id)

    found = find_source_entries(display_name, str(ex_id))
    origin = ex.get("origin") if isinstance(ex.get("origin"), dict) else {}

    new_origin = dict(origin)
    new_source_refs = dict(origin.get("source_refs") or {})
    changed = False
    for source_key in ("wger", "yuhonas"):
        entry = found.get(source_key)
        if not entry:
            continue
        if _link_source_id(ex, source_key, entry):
            changed = True
        id_value = entry.get(f"{source_key}_id")
        if id_value not in (None, "") and source_key not in new_source_refs:
            new_source_refs[source_key] = [str(id_value)]
            changed = True

    if changed and apply:
        new_origin.setdefault("type", "external")
        if new_source_refs:
            new_origin["source_refs"] = new_source_refs
        ex["origin"] = new_origin
        f.with_suffix(".yml.bak").write_text(f.read_text())
        doc = load_yaml(f)
        doc["exercises"] = [ex]
        f.write_text(yaml.dump(doc, allow_unicode=True, sort_keys=False))

    def _candidate_info(source_key: str) -> dict[str, Any] | None:
        entry = found.get(f"{source_key}_candidate")
        score = found.get(f"{source_key}_candidate_score")
        if not entry:
            return None
        return {"id": entry.get(f"{source_key}_id") or entry.get("exercise_id"), "score": score}

    return {
        "found": {"wger": bool(found.get("wger")), "yuhonas": bool(found.get("yuhonas"))},
        "changed": changed,
        "candidates": {"wger": _candidate_info("wger"), "yuhonas": _candidate_info("yuhonas")},
        "exercise": ex,
    }


def create_inbox_draft(
    display_name: str,
    *,
    exercise_id: str | None = None,
    wger_id: Any = None,
    yuhonas_id: Any = None,
    coaching_notes: list[str] | None = None,
    force: bool = False,
) -> Path:
    """Generelles Skript zum Anlegen eines neuen Inbox-Drafts — die Basis ist
    IMMER nur die ID-Referenz zu wger/yuhonas, nie ein Content-Dump (siehe
    `attach_source_snapshot()`-Docstring oben, gleiche Direktive: "die basis
    eines inbox drafts ist die id zum wger UND zum yuhona äquivalent... nicht
    einfach den wger/yuhona inhalt reindumpen sondern VERLINKEN per ID").

    Zwei Faelle:
    - `wger_id`/`yuhonas_id` explizit uebergeben: manueller Fixpunkt, z.B.
      eine neue Uebungsvariante (User-Beispiel: "vorgebeugtes Langhantelrudern
      stehend" hat selbst keinen eigenen wger/yuhonas-Treffer, soll aber die
      IDs der allgemeinen "Langhantelrudern"-Basis als Referenz tragen, damit
      spaeter jemand "wger/yuhonas sagen dazu X" nachschlagen kann, OHNE dass
      deren Text in diese neue Datei kopiert wird).
    - keine IDs uebergeben: Auto-Suche per `find_source_entries()` (Name-
      Fuzzy-Match, derselbe AUTO_MATCH_MIN_SCORE-Threshold wie ueberall sonst)
      — nur bei sicherem Treffer verlinkt, sonst bleibt die Uebung ohne
      Quellenreferenz (kein falsches Verlinken erzwingen).

    Schreibt NICHTS von `coaching_notes`/`primary_muscles`/etc. aus der
    Quelle in die neue Datei — nur was explizit per `coaching_notes`-Parameter
    uebergeben wird (eigene, neue Coach-Notizen fuer genau diese Variante).
    Muskeln/Content fuellt entweder Gemini (`add-exercise`-CLI-Pfad,
    `build_inbox_draft_seed()` nutzt die Quelle nur als GROUNDING-Kontext,
    nicht als gespeicherte Kopie) oder ein Mensch manuell nach.

    Gibt den Pfad der geschriebenen Datei zurueck. Wirft FileExistsError wenn
    die Zieldatei schon existiert und `force=False`.
    """
    from fitness.catalog.core.source_merge import find_source_entries

    safe_id = exercise_id or re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", display_name.strip().lower())).strip("_")
    target = inbox_dir() / f"inbox_{safe_id}.yml"
    if target.exists() and not force:
        raise FileExistsError(f"Inbox-Draft existiert bereits: {target}")

    ex: dict[str, Any] = {
        "exercise_id": safe_id,
        "display_name": display_name,
    }
    if coaching_notes:
        ex["coaching_notes"] = list(coaching_notes)

    # wger_id/yuhonas_id sind top-level die alleinige Quelle der Wahrheit.
    # external_ids ist nur die Liste-Form davon (fuer find_source_entries()-
    # Hints/mehrere IDs pro Quelle) — origin.source_refs wird von
    # apply_exercise_schema() bereits DARAUS abgeleitet, hier also bewusst
    # NICHT nochmal von Hand gesetzt (das war die eigentliche "ID kommt 10x
    # vor"-Redundanz: dieselbe ID in 3-4 Feldern gleichzeitig einzutragen).
    external_ids: dict[str, list[Any]] = {}

    if wger_id not in (None, ""):
        ex["wger_id"] = wger_id
        external_ids["wger"] = [wger_id]
    if yuhonas_id not in (None, ""):
        ex["yuhonas_id"] = yuhonas_id
        external_ids["yuhonas"] = [yuhonas_id]

    if not external_ids:
        # Keine expliziten IDs übergeben -> automatische Suche, aber nur ein
        # sicherer Treffer wird verlinkt (siehe attach_source_snapshot()).
        found = find_source_entries(display_name, safe_id)
        for source_key in ("wger", "yuhonas"):
            entry = found.get(source_key)
            if not entry:
                continue
            id_value = entry.get(f"{source_key}_id")
            if id_value not in (None, ""):
                ex[f"{source_key}_id"] = id_value
                external_ids[source_key] = [id_value]

    if external_ids:
        ex["external_ids"] = external_ids

    ex = apply_exercise_schema(ex, review_status="draft", review_provider="manual", ai_reviewed=False)

    doc = {
        "name": target.stem,
        "description": f"Neuer Inbox-Draft für: {display_name}",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "exercises": [ex],
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(yaml.safe_dump(doc, allow_unicode=True, sort_keys=False), encoding="utf-8")
    logger.success(f"Inbox-Draft angelegt: {target.name}")
    commit_inbox_draft(target)
    return target


def approve_inbox_entry(f: Path, ex: dict[str, Any]) -> str:
    """Approved einen Inbox-Draft -> `{ex_id}.yml` (Expert-Tier). Gibt die
    finale exercise_id zurueck. Wirft ValueError wenn keine exercise_id da ist.
    """
    ex = normalize_exercise_muscles(ex)
    ex_id = ex.get("exercise_id") or ex.get("id")
    if not ex_id:
        raise ValueError("keine exercise_id im Draft")

    if ex_id.startswith("inbox_"):
        ex_id = ex_id.replace("inbox_", "")
        ex["exercise_id"] = ex_id
        ex["id"] = ex_id

    # wger liefert nur numerische IDs (wger_1507). Die wger_id bleibt als
    # Referenz erhalten (_merge_source_refs unten liest sie u.a. aus f.stem),
    # aber beim Approven wird die coach-facing ID/Name - falls ein yuhonas-
    # Pendant per Name gefunden wird - auf den sprechenden yuhonas-Slug
    # umbenannt. Das schlaegt die Bruecke zwischen wger und yuhonas indirekt
    # ueber den Namen, da beide Quellen keine gemeinsame ID teilen.
    if re.fullmatch(r"wger_\d+", ex_id):
        # yuhonas-Namen sind reines Englisch — english zuerst probieren,
        # deutsche Felder scoren gegen einen englischen Korpus zu niedrig.
        name_for_match = ex.get("english") or ex.get("display_name") or ex.get("german") or ex.get("name") or ""
        yuhonas_match = _find_yuhonas_match(name_for_match)
        if yuhonas_match:
            if not ex.get("wger_id"):
                ex["wger_id"] = int(ex_id.removeprefix("wger_"))
            ex_id = yuhonas_match
            ex["exercise_id"] = ex_id
            ex["id"] = ex_id

    approved_at = datetime.now(timezone.utc).isoformat()
    ex["source"] = "expert"
    ex["approved_at"] = approved_at
    _merge_source_refs(f, ex)
    ex = _merge_missing_source_payload(ex, display_name_of(ex, ex_id), ex_id)
    ex = apply_exercise_schema(ex, review_status="approved", ai_reviewed=True)

    detail_path = exercises_dir() / f"{ex_id}.yml"
    if detail_path.exists():
        detail_path.with_suffix(".yml.bak").write_text(detail_path.read_text())

    display_name = display_name_of(ex, ex_id)
    detail_doc = {
        "exercise_id": ex_id,
        "description": f"Expert details for {display_name}",
        "approved_at": approved_at,
        "exercises": [ex],
    }
    detail_path.write_text(
        yaml.dump(detail_doc, allow_unicode=True, sort_keys=False, default_flow_style=False)
    )
    f.unlink()
    _git_commit_paths([detail_path, f], f"chore(catalog): approve {ex_id} ({display_name})")
    _rebuild_runtime_catalog()
    return ex_id


def demote_expert_entry(exercise_id: str) -> Path:
    """Gegenstueck zu approve_inbox_entry(): schickt eine vermeintliche
    Expert-Datei (`kb/exercises/{id}.yml`) zurueck nach `kb/inbox/inbox_{id}.yml`
    zum (erneuten) Review. Nicht destruktiv - alle vorhandenen Felder (auch
    rohe wger/yuhonas-Quelldaten) bleiben erhalten, nur die Approval-Marker
    werden zurueckgesetzt. Fuer Faelle, in denen eine Datei als "expert"
    getaggt wurde (source_tier in resolver.py haengt nur an der Ordner-
    Position, kb/exercises/ vs. kb/inbox/), ohne dass tatsaechlich je ein
    approve_inbox_entry()-Aufruf stattgefunden hat.
    """
    detail_path = exercises_dir() / f"{exercise_id}.yml"
    if not detail_path.exists():
        raise FileNotFoundError(f"Keine Expert-Datei gefunden: {detail_path}")

    doc = load_yaml(detail_path)
    exercises = doc.get("exercises") or [{}]
    ex = dict(exercises[0]) if exercises else {}
    ex.pop("approved_at", None)
    ex["source"] = "unreviewed"

    display_name = display_name_of(ex, exercise_id)
    inbox_path = inbox_dir() / f"inbox_{exercise_id}.yml"
    wrapper = {
        "name": inbox_path.stem,
        "description": f"Zurueck zur Review geschickt (war faelschlich als expert getaggt): {display_name}",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "exercises": [ex],
    }
    inbox_path.write_text(
        yaml.dump(wrapper, allow_unicode=True, sort_keys=False, default_flow_style=False)
    )
    detail_path.unlink()
    _git_commit_paths(
        [inbox_path, detail_path],
        f"chore(catalog): {exercise_id} ({display_name}) zurueck in Inbox — nie echt approved",
    )
    _rebuild_runtime_catalog()
    return inbox_path


def delete_inbox_entry(f: Path, ex: dict[str, Any] | None = None) -> None:
    write_inbox_tombstone(f, ex, reason="deleted_inbox")
    f.unlink()
    _git_commit_paths([tombstones_path(), f], f"chore(catalog): reject inbox draft {f.stem}")


def reenrich_inbox_entry(
    f: Path,
    ex: dict[str, Any],
    name: str,
    feedback: str | None = None,
    use_haiku_review: bool = True,
    provider: str = "gemini",
) -> dict[str, Any]:
    """Jagt einen bestehenden Inbox-Draft frisch durch Gemini (optional mit
    Coach-Feedback), laesst Haiku/Codex als zweite Meinung gegenpruefen
    (best-effort), und schreibt den Draft ueberschreibend
    zurueck (Backup vorher). Wirft RuntimeError bei Konfigurations-/API-Fehlern.

    Rueckgabe: {"enriched": dict, "haiku_applied": bool, "review_provider": str | None}
    """
    api_key = load_gemini_key() if provider == "gemini" else None

    ex_id = ex.get("exercise_id") or ex.get("id") or f.stem.replace("inbox_", "")
    safe_name = str(ex_id).lower().replace(" ", "_")

    enriched = call_enrichment(name, safe_name, existing_data=ex, feedback=feedback, provider=provider, api_key=api_key)
    if not enriched:
        raise RuntimeError(f"{provider}-Anreicherung fehlgeschlagen")
    enriched = preserve_reenrich_provenance(enriched, ex)

    review_provider = None
    if use_haiku_review:
        reviewed = review_with_haiku(enriched, feedback=feedback)
        if reviewed:
            enriched = reviewed
            review_provider = "haiku"
        else:
            reviewed = review_with_codex(enriched, feedback=feedback)
            if reviewed:
                enriched = reviewed
                review_provider = "codex"

    enriched = normalize_exercise_muscles(enriched, name)

    f.with_suffix(".yml.bak").write_text(f.read_text())

    if "stabilizers" not in enriched: enriched["stabilizers"] = []
    if "variations" not in enriched: enriched["variations"] = []
    enriched_at = datetime.now(timezone.utc).isoformat()
    enriched["source"] = "unreviewed"
    enriched["enriched_at"] = enriched_at
    enriched = apply_exercise_schema(
        enriched,
        review_status="draft",
        review_provider=review_provider,
        ai_reviewed=bool(review_provider),
    )

    description = (
        f"Reenriched (Coach-Feedback) fuer: {name}" if feedback
        else f"Neu angereichert (manueller Re-Enrich) fuer: {name}"
    )
    wrapper = {"name": f.stem, "description": description, "enriched_at": enriched_at, "exercises": [enriched]}
    f.write_text(yaml.dump(wrapper, allow_unicode=True, sort_keys=False))

    return {
        "enriched": enriched,
        "haiku_applied": review_provider == "haiku",
        "review_provider": review_provider,
    }


def reenrich_approved_entry(
    f: Path,
    ex: dict[str, Any],
    name: str,
    feedback: str | None = None,
    provider: str = "gemini",
    review_mode: str = "codex",
) -> dict[str, Any]:
    api_key = load_gemini_key() if provider == "gemini" else None
    ex_id = ex.get("exercise_id") or ex.get("id") or f.stem
    safe_name = str(ex_id).lower().replace(" ", "_")

    enriched = call_enrichment(name, safe_name, existing_data=ex, feedback=feedback, provider=provider, api_key=api_key)
    if not enriched:
        raise RuntimeError(f"{provider}-Anreicherung fehlgeschlagen")

    review_provider = None
    mode = str(review_mode or "none").strip().lower()
    if mode == "haiku":
        reviewed = review_with_haiku(enriched, feedback=feedback)
        if reviewed:
            enriched = reviewed
            review_provider = "haiku"
    elif mode == "codex":
        reviewed = review_with_codex(enriched, feedback=feedback)
        if reviewed:
            enriched = reviewed
            review_provider = "codex"
    elif mode == "auto":
        reviewed = review_with_haiku(enriched, feedback=feedback)
        if reviewed:
            enriched = reviewed
            review_provider = "haiku"
        else:
            reviewed = review_with_codex(enriched, feedback=feedback)
            if reviewed:
                enriched = reviewed
                review_provider = "codex"

    enriched = normalize_exercise_muscles(enriched, name)
    for key in ("exercise_id", "id", "source", "approved_at", "wger_id", "yuhonas_id", "external_ids", "search_aliases", "logged_by_uid"):
        if (key not in enriched or enriched.get(key) in (None, "", [])) and ex.get(key) not in (None, "", []):
            enriched[key] = ex.get(key)
    enriched.setdefault("exercise_id", ex_id)
    enriched.setdefault("id", ex.get("id") or ex_id)
    enriched = _merge_missing_source_payload(enriched, display_name_of(enriched, ex_id), ex_id)
    enriched = apply_exercise_schema(
        enriched,
        review_status="approved",
        review_provider=review_provider,
        ai_reviewed=(review_provider is not None),
    )

    doc = load_yaml(f)
    doc["description"] = f"Expert details for {display_name_of(enriched, ex_id)}"
    doc["exercises"] = [enriched]
    f.with_suffix(".yml.bak").write_text(f.read_text())
    f.write_text(yaml.dump(doc, allow_unicode=True, sort_keys=False, default_flow_style=False))
    return {
        "enriched": enriched,
        "review_provider": review_provider,
    }
