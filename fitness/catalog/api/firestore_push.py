"""
KB Sync — catalog/kb/ → Firestore fitness/kb/

Orchestriert den Sync ALLER Katalog-Daten nach Firestore, nicht nur Exercises/
Anatomy. Firestore-Infrastruktur: firestore.kb
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

from loguru import logger
from tqdm import tqdm

from fitness.firestore.kb import get_db, fetch_hashes, batch_write
from fitness.catalog.core.loader import catalog_path, load_catalog_directory_yaml, load_catalog_yaml
from fitness.catalog.core.muscles import iter_muscle_documents
from fitness.catalog.core.yaml_utils import load_yaml

GENERIC_REGION_REASSIGNMENT = [
    (re.compile(r"external rotation|internal rotation|au(ss|ß)enrotation|innenrotation|rotator ?cuff", re.I), "304_rotator_cuff"),
    (re.compile(r"rear|reverse|posterior|face.?pull|hintere schulter|vorgebeugt", re.I), "303_posterior_deltoid"),
    (re.compile(r"lateral raise|side raise|seitheben", re.I), "302_lateral_deltoid"),
    (re.compile(r"front raise|frontheben", re.I), "301_anterior_deltoid"),
]


def sync_exercises(db: Any, dry_run: bool = False) -> dict[str, int]:
    col = db.collection("fitness").document("kb").collection("exercises")

    exercise_docs = load_catalog_directory_yaml("exercises")
    reviewed_refs = _reviewed_external_refs(exercise_docs)

    # Alle exercises aggregieren + mergen (Expert gewinnt bei Konflikt)
    all_exercises: dict[str, dict[str, Any]] = {}
    for path, doc in exercise_docs:
        if not isinstance(doc, dict):
            continue
        for exercise in doc.get("exercises", []):
            if path.name.startswith("unreviewed_") and _is_superseded_external_exercise(exercise, reviewed_refs):
                continue
            ex_id = str(exercise.get("exercise_id") or exercise.get("id") or "")
            if not ex_id:
                continue
            if ex_id not in all_exercises:
                all_exercises[ex_id] = exercise
            else:
                _merge_exercise(all_exercises[ex_id], exercise)

    remote_hashes = fetch_hashes(col)
    counts = batch_write(db, col, tqdm(all_exercises.items(), desc="Exercises", unit="ex"),
                         dry_run=dry_run, use_hash=True, remote_hashes=remote_hashes)

    # Verwaiste Docs löschen
    if not dry_run:
        orphans = {doc.id for doc in col.stream()} - set(all_exercises)
        if orphans:
            b = db.batch()
            for oid in orphans:
                b.delete(col.document(oid))
            b.commit()
            counts["deleted"] = len(orphans)
            logger.info(f"{len(orphans)} verwaiste Exercises gelöscht")

    return counts


def _reviewed_external_refs(exercise_docs: list[tuple[Path, Any]]) -> dict[str, set[str]]:
    refs: dict[str, set[str]] = {
        "wger": set(),
        "yuhonas": set(),
        "names": set(),
    }
    for path, doc in exercise_docs:
        if path.name.startswith("unreviewed_") or not isinstance(doc, dict):
            continue
        for exercise in doc.get("exercises", []):
            if not isinstance(exercise, dict):
                continue
            wger_id = exercise.get("wger_id")
            if wger_id:
                refs["wger"].add(str(wger_id))
            external_ids = exercise.get("external_ids") or {}
            if isinstance(external_ids, dict):
                for value in _as_text_list(external_ids.get("wger")):
                    refs["wger"].add(value)
                for value in _as_text_list(external_ids.get("yuhonas")):
                    refs["yuhonas"].add(value)
            for value in _as_text_list(exercise.get("search_aliases")):
                refs["names"].add(_norm_text(value))
    return refs


def _is_superseded_external_exercise(exercise: Any, refs: dict[str, set[str]]) -> bool:
    if not isinstance(exercise, dict):
        return False
    wger_id = exercise.get("wger_id")
    if wger_id and str(wger_id) in refs["wger"]:
        return True
    yuhonas_id = exercise.get("yuhonas_id")
    if yuhonas_id and str(yuhonas_id) in refs["yuhonas"]:
        return True
    for key in ("display_name", "german", "english", "name", "exercise_id", "id"):
        value = exercise.get(key)
        if isinstance(value, str) and _norm_text(value) in refs["names"]:
            return True
    return False


def _as_text_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item)]
    if value:
        return [str(value)]
    return []


def _norm_text(value: str) -> str:
    return value.strip().casefold().replace("-", " ").replace("_", " ")


def _merge_exercise(base: dict, incoming: dict) -> None:
    for key, val in incoming.items():
        old = base.get(key)
        if not old:
            base[key] = val
        elif isinstance(val, list) and isinstance(old, list):
            def has_prefix(l):
                return any(isinstance(x, str) and x[:1].isdigit() for x in l)
            if len(val) > len(old) or (len(val) == len(old) and has_prefix(val) and not has_prefix(old)):
                base[key] = val
        elif isinstance(val, str) and isinstance(old, str) and len(val) > len(old):
            base[key] = val
        elif isinstance(val, dict) and isinstance(old, dict):
            old.update(val)


def push_changed_exercises(
    since_ref: str = "HEAD~1",
    until_ref: str = "HEAD",
    dry_run: bool = False,
    extra_paths: list[str] | None = None,
) -> dict[str, int]:
    """Nur git-diff geänderte Exercises pushen — quota-schonend."""
    repo_root = Path(__file__).resolve().parents[3]
    proc = subprocess.run(
        ["git", "diff", "--name-only", since_ref, until_ref, "--", "fitness/catalog/kb/exercises/"],
        capture_output=True, text=True, cwd=repo_root, check=True,
    )
    changed_files = {Path(p).name for p in proc.stdout.strip().splitlines() if p.endswith(".yml")}
    for extra in (extra_paths or []):
        changed_files.add(Path(extra).name)

    counts = {"changed_files": len(changed_files), "ok": 0, "skip": 0, "error": 0}
    if not changed_files:
        logger.info("Keine Exercise-YAMLs im Range geändert.")
        return counts

    logger.info(f"Geänderte Files: {sorted(changed_files)}")

    targets: dict[str, dict[str, Any]] = {}
    for path, doc in load_catalog_directory_yaml("exercises"):
        if path.name not in changed_files or not isinstance(doc, dict):
            continue
        for exercise in doc.get("exercises", []):
            ex_id = str(exercise.get("exercise_id") or exercise.get("id") or "")
            if ex_id:
                targets[ex_id] = exercise

    logger.info(f"Zu pushende Exercises: {len(targets)}")
    if dry_run:
        for ex_id in sorted(targets):
            logger.info(f"DRY {ex_id}")
        counts["ok"] = len(targets)
        return counts

    db = get_db()
    col = db.collection("fitness").document("kb").collection("exercises")
    result = batch_write(db, col, targets.items(), dry_run=False, use_hash=True)
    counts.update(result)
    return counts


def sync_anatomy(db: Any, dry_run: bool = False) -> dict[str, int]:
    col = db.collection("fitness").document("kb").collection("anatomy")

    def _records():
        for _path, doc in load_catalog_directory_yaml("anatomy_teaching"):
            if not isinstance(doc, dict):
                continue
            lessons = doc.get("lessons") or ([doc] if "exercise_id" in doc else [])
            for lesson in lessons:
                ex_id = str(lesson.get("exercise_id") or "")
                if ex_id:
                    yield ex_id, lesson

    return batch_write(db, col, tqdm(_records(), desc="Anatomy", unit="lesson"),
                       dry_run=dry_run, use_hash=True)


def sync_muscles(
    db: Any,
    dry_run: bool = False,
    since_ref: str | None = None,
    until_ref: str = "HEAD",
) -> dict[str, int]:
    """
    1:1 Sync der KB-Muskeln nach Firestore (kb/muscles/**/*.yml).
    Reichert wger_id/parent aus muscle_index.yml an, wo nötig, damit Firestore
    die vollständigen Daten für das Frontend bereitstellt.
    """
    col = db.collection("fitness").document("kb").collection("muscles")

    # Geänderte Dateien via Git-Diff ermitteln, falls since_ref angegeben ist.
    # Relative Pfade behalten die KB-Ebene bei: `chest.yml` und
    # `chest/101_pectoralis_major.yml` sind verschiedene Dokumente.
    changed_files: set[str] | None = None
    if since_ref:
        repo_root = Path(__file__).resolve().parents[3]
        proc = subprocess.run(
            ["git", "diff", "--name-only", since_ref, until_ref, "--", "fitness/catalog/kb/muscles/"],
            capture_output=True, text=True, cwd=repo_root, check=True,
        )
        prefix = Path("fitness/catalog/kb/muscles")
        changed_files = {
            Path(p).relative_to(prefix).as_posix()
            for p in proc.stdout.strip().splitlines()
            if p.endswith(".yml") and Path(p).is_relative_to(prefix)
        }
        logger.info(f"Git-Diff ({since_ref}..{until_ref}): {len(changed_files)} geänderte Muskel-YAMLs")

    all_muscles: dict[str, dict[str, Any]] = {}
    for doc_id, merged in iter_muscle_documents(only_relative_paths=changed_files):
        all_muscles[doc_id] = merged

    remote_hashes = fetch_hashes(col)
    counts = batch_write(db, col, tqdm(all_muscles.items(), desc="Muscles", unit="muscle"),
                         dry_run=dry_run, use_hash=True, remote_hashes=remote_hashes)

    # Bei Voll-Sync (kein since_ref Filter): Verwaiste / alte Docs in Firestore löschen
    if not dry_run and since_ref is None:
        orphans = {doc.id for doc in col.stream()} - set(all_muscles)
        if orphans:
            b = db.batch()
            for oid in orphans:
                b.delete(col.document(oid))
            b.commit()
            counts["deleted"] = len(orphans)
            logger.info(f"{len(orphans)} verwaiste Muscles aus Firestore gelöscht")

    return counts


def push_changed_muscle_files(relative_paths: set[str], dry_run: bool = False) -> dict[str, int]:
    """Pusht genau die übergebenen kb/muscles/-Dateien (relative Pfade unter
    kb/muscles/) nach Firestore — kein Git-Diff nötig, für den Live-
    Filesystem-Watcher (siehe catalog/api/muscle_watcher.py). Kein
    FITNESS_ENV=prod-Gate: kb/muscles/ ist rein lokal->Firestore (push-only,
    kein Firestore->lokal-Pfad, der überschrieben werden könnte)."""
    if not relative_paths:
        return {"changed_files": 0, "ok": 0, "unchanged": 0, "error": 0}
    db = get_db()
    col = db.collection("fitness").document("kb").collection("muscles")
    targets = dict(iter_muscle_documents(only_relative_paths=relative_paths))
    counts: dict[str, int] = {"changed_files": len(relative_paths)}
    counts.update(batch_write(db, col, targets.items(), dry_run=dry_run, use_hash=True))
    return counts


def sync_yuhonas(db: Any, dry_run: bool = False) -> dict[str, int]:
    col = db.collection("fitness").document("kb").collection("exercises")
    yuhonas_dir = catalog_path("../yuhonas")
    if not yuhonas_dir.exists():
        logger.warning("catalog/yuhonas nicht gefunden, übersprungen")
        return {"ok": 0, "unchanged": 0, "error": 0}

    try:
        muscle_index = load_catalog_yaml("muscle_index.yml")
        string_aliases = muscle_index.get("string_aliases", {}) if isinstance(muscle_index, dict) else {}
    except Exception:
        string_aliases = {}

    reviewed_refs = _reviewed_external_refs(load_catalog_directory_yaml("exercises"))

    def _resolve(names: list) -> list:
        return [string_aliases.get(m, m) for m in names]

    def _refine_generic_region_labels(muscles: list[str], exercise_name: str) -> list[str]:
        generic_shoulders = {"shoulders", "300_shoulders"}
        if not generic_shoulders.intersection(muscles):
            return muscles
        for pattern, replacement in GENERIC_REGION_REASSIGNMENT:
            if pattern.search(exercise_name or ""):
                return [replacement if m in generic_shoulders else m for m in muscles]
        return muscles

    def _records():
        for json_file in sorted(yuhonas_dir.glob("*.json")):
            try:
                raw = json.loads(json_file.read_text())
            except Exception:
                continue
            raw_id = str(raw.get("id") or json_file.stem)
            if raw_id in reviewed_refs["yuhonas"] or _norm_text(raw.get("name", "")) in reviewed_refs["names"]:
                continue
            ex_id = f"yuhonas_{raw.get('id', json_file.stem)}"
            primary = _refine_generic_region_labels(_resolve(raw.get("primaryMuscles", [])), raw.get("name", ""))
            secondary = _refine_generic_region_labels(_resolve(raw.get("secondaryMuscles", [])), raw.get("name", ""))
            yield ex_id, {
                "exercise_id": ex_id,
                "id": ex_id,
                "display_name": raw.get("name", ""),
                "source": "yuhonas",
                "tags": ["yuhonas", "unreviewed"],
                "category": raw.get("category", ""),
                "equipment": [raw.get("equipment")] if raw.get("equipment") else [],
                "primary_muscles": primary,
                "secondary_muscles": secondary,
                "instructions": raw.get("instructions", []),
                "images": raw.get("images", []),
            }

    remote_hashes = fetch_hashes(col)
    return batch_write(db, col, tqdm(_records(), desc="Yuhonas", unit="ex"),
                       dry_run=dry_run, use_hash=True, remote_hashes=remote_hashes)


# Dateien, die reine Rohdaten-Lookups sind (>500 Einträge) — als Referenz
# nützlich, aber nicht als Live-KB für die App relevant. Bewusst NICHT nach
# Firestore geschrieben, um Doc-Größe/Quota nicht sinnlos zu belasten.
_REGISTRY_SKIP = {"wger_exercises_id.yml", "yuhano_exercises_id.yml"}


def sync_rules(db: Any, dry_run: bool = False) -> dict[str, int]:
    """kb/rules/*.yml — Programm-/Progressions-/Sicherheits-/Coverage-Regeln."""
    col = db.collection("fitness").document("kb").collection("rules")

    def _records():
        for path in sorted(catalog_path("rules").glob("*.yml")):
            doc = load_yaml(path)
            if isinstance(doc, dict):
                yield path.stem, doc

    return batch_write(db, col, tqdm(list(_records()), desc="Rules", unit="file"),
                       dry_run=dry_run, use_hash=True)


def sync_registry(db: Any, dry_run: bool = False) -> dict[str, int]:
    """kb/registry/*.yml — Alias-/wger-/external-db-Mapping-Tabellen."""
    col = db.collection("fitness").document("kb").collection("registry")

    def _records():
        for path in sorted(catalog_path("registry").glob("*.yml")):
            if path.name in _REGISTRY_SKIP:
                continue
            doc = load_yaml(path)
            if isinstance(doc, (dict, list)):
                payload = doc if isinstance(doc, dict) else {"items": doc}
                yield path.stem, payload

    return batch_write(db, col, tqdm(list(_records()), desc="Registry", unit="file"),
                       dry_run=dry_run, use_hash=True)


def sync_activities(db: Any, dry_run: bool = False) -> dict[str, int]:
    """kb/activities.yml — Aktivitäts-Typen (Cardio etc.), eigenes Top-Level-Doc."""
    col = db.collection("fitness").document("kb").collection("meta")

    def _records():
        try:
            doc = load_catalog_yaml("activities.yml")
        except Exception as exc:
            logger.warning(f"activities.yml nicht lesbar: {exc}")
            return
        if isinstance(doc, dict):
            yield "activities", doc

    return batch_write(db, col, list(_records()), dry_run=dry_run, use_hash=True)


def _is_prod_context() -> bool:
    """FITNESS_ENV=prod wird ausschliesslich vom systemd-Unit fitness.service
    gesetzt (Environment=-Zeile, siehe ops/fitness.service) - eine Dev-Shell
    unter ~/dev/fitness-dev hat das nie gesetzt, es sei denn jemand exportiert es
    manuell. Dient als expliziter Marker, WO ein KB-Push laeuft."""
    return os.environ.get("FITNESS_ENV") == "prod"


def run_kb_sync(dry_run: bool = False, *, force: bool = False) -> None:
    """KB-Push (lokal -> Firestore) ist bewusst auf Prod-Kontext beschraenkt
    (FITNESS_ENV=prod): laeuft dieselbe Aktion aus einer Dev-Checkout-Shell,
    kann ein aelterer lokaler kb/-Stand einen frischeren Firestore-Stand
    (z.B. von der anderen Richtung, dem on_kb_exercises-Watcher, gemergt)
    ueberschreiben - genau das Multi-Writer-Problem, das Session-uebergreifend
    schon zu falscher Attribution/verlorenen Aenderungen gefuehrt hat. Mit
    force=True (CLI: --force) bewusst uebersteuerbar fuer den Notfall."""
    if not force and not _is_prod_context():
        raise RuntimeError(
            "KB-Push (lokal -> Firestore) ist auf Prod-Kontext beschraenkt "
            "(FITNESS_ENV=prod, nur vom fitness.service-Unit gesetzt). "
            "Von einer Dev-Shell aus laeuft das nicht, um zu verhindern dass "
            "ein aelterer Dev-Stand einen frischeren Firestore-Stand "
            "ueberschreibt. Mit --force explizit erzwingen, wenn das hier "
            "wirklich gewollt ist."
        )
    db = get_db()
    results = {
        "exercises":  sync_exercises(db, dry_run),
        "anatomy":    sync_anatomy(db, dry_run),
        "muscles":    sync_muscles(db, dry_run),
        "yuhonas":    sync_yuhonas(db, dry_run),
        "rules":      sync_rules(db, dry_run),
        "registry":   sync_registry(db, dry_run),
        "activities": sync_activities(db, dry_run),
    }
    total_ok  = sum(r.get("ok", 0) for r in results.values())
    total_err = sum(r.get("error", 0) for r in results.values())
    logger.info(f"=== Fertig: {total_ok} geschrieben, {total_err} Fehler ===")
    for k, v in results.items():
        logger.info(f"  {k}: {v}")
