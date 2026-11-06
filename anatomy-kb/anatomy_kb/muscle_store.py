"""
Muscle Store — Interface zu muscles/*.yml + muscle-index.json

Kanonische Muscle-IDs entsprechen wger /api/v2/muscle/ (snake_case).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import yaml

ROOT = Path(__file__).parent.parent
MUSCLES_DIR = ROOT / "muscles"
INDEX_FILE = ROOT / "muscle-index.json"


def load_index() -> dict[str, dict]:
    """Gibt {muscle_id: meta} zurück."""
    if not INDEX_FILE.exists():
        return {}
    return json.loads(INDEX_FILE.read_text())


def _z_c_variants(key: str) -> list[str]:
    """Deutsche Eindeutschungen (Bizeps, Trizeps, Quadrizeps) nutzen 'z' wo
    Latein/Englisch 'c' schreibt. Beide Richtungen generieren, damit z.B.
    'quadrizeps' -> 'quadriceps' matcht und umgekehrt."""
    variants = {key}
    variants.add(key.replace("z", "c"))
    variants.add(key.replace("c", "z"))
    return list(variants)


def canonical_id(name: str) -> Optional[str]:
    """Findet kanonische muscle_id für einen beliebigen Namen (fuzzy).
    Deckt ab: exakte ID, Substring-Match auf latin/name_en/name_de,
    sowie deutsche z/c-Schreibvarianten (Quadrizeps <-> Quadriceps)."""
    index = load_index()
    key = name.lower().strip()
    if key in index:
        return key
    for candidate in _z_c_variants(key):
        for mid, meta in index.items():
            haystacks = (
                meta.get("latin", ""), meta.get("name_en", ""), meta.get("name_de", ""),
            )
            if any(candidate in h.lower() for h in haystacks if h):
                return mid
    return None


def load_muscle(muscle_id: str) -> Optional[dict]:
    yml = MUSCLES_DIR / f"{muscle_id}.yml"
    if not yml.exists():
        return None
    return yaml.safe_load(yml.read_text(encoding="utf-8"))


def save_muscle(muscle_id: str, data: dict) -> Path:
    MUSCLES_DIR.mkdir(exist_ok=True)
    yml = MUSCLES_DIR / f"{muscle_id}.yml"
    yml.write_text(yaml.dump(data, allow_unicode=True, default_flow_style=False, sort_keys=False), encoding="utf-8")
    return yml


def update_muscle(muscle_id: str, anatomy: dict, exercise_id: str, force: bool = False) -> tuple[Path, bool]:
    """
    Mergt Anatomy-Daten in muscles/{muscle_id}.yml.
    anatomy: {origin, insertion, innervation, function_in_exercise, latin}
    Gibt (path, created) zurück.
    """
    existing = load_muscle(muscle_id)
    index = load_index()
    meta = index.get(muscle_id, {})

    if existing is None:
        doc: dict = {
            "muscle_id": muscle_id,
            "wger_id": meta.get("wger_id"),
            "latin": anatomy.get("latin") or meta.get("latin", ""),
            "name_en": meta.get("name_en", ""),
            "is_front": meta.get("is_front"),
            "origin": None,
            "insertion": None,
            "innervation": None,
            "function": None,
            "exercises": {},
        }
        created = True
    else:
        doc = existing
        created = False

    if force or not doc.get("origin"):
        doc["origin"] = anatomy.get("origin")
        doc["insertion"] = anatomy.get("insertion")
        doc["innervation"] = anatomy.get("innervation")
        doc["function"] = anatomy.get("function_in_exercise")
        if anatomy.get("latin") and not doc.get("latin"):
            doc["latin"] = anatomy["latin"]

    if "exercises" not in doc:
        doc["exercises"] = {}
    doc["exercises"][exercise_id] = {
        "function_in_exercise": anatomy.get("function_in_exercise")
    }

    return save_muscle(muscle_id, doc), created


def push_to_teaching(exercise_id: str, teaching_dir: Path, extra: dict | None = None) -> Path | None:
    """
    Bettet muscle_anatomy aus muscles/*.yml in anatomy_teaching/{exercise_id}.yml ein.
    Unterstützt beide Formate:
      - lessons: [{exercise_id, ...}]  (fitness-dev Agent Format)
      - flaches Dict mit exercise_id    (anatomy-kb Format)
    extra: zusätzliche Felder (z.B. common_errors_explained, vault_tags)
    """
    muscles = muscles_for_exercise(exercise_id)
    if not muscles and not extra:
        return None

    muscle_anatomy: dict = {}
    for mid in muscles:
        doc = load_muscle(mid)
        if not doc:
            continue
        muscle_anatomy[mid] = {
            "latin": doc.get("latin"),
            "origin": doc.get("origin"),
            "insertion": doc.get("insertion"),
            "innervation": doc.get("innervation"),
            "function_in_exercise": (doc.get("exercises", {}).get(exercise_id, {}) or {}).get("function_in_exercise"),
        }

    teaching_dir.mkdir(parents=True, exist_ok=True)
    teaching_file = teaching_dir / f"{exercise_id}.yml"

    if teaching_file.exists():
        try:
            doc = yaml.safe_load(teaching_file.read_text(encoding="utf-8")) or {}
        except Exception:
            doc = {}
    else:
        doc = {}

    # lessons-Format (fitness-dev Agent)
    if "lessons" in doc:
        lesson = next((l for l in doc["lessons"] if l.get("exercise_id") == exercise_id), None)
        if lesson is None:
            doc["lessons"].append({"exercise_id": exercise_id})
            lesson = doc["lessons"][-1]
        if muscle_anatomy:
            lesson["muscle_anatomy"] = muscle_anatomy
        if extra:
            lesson.update(extra)
    else:
        # Flaches Format
        if not doc.get("exercise_id"):
            doc["exercise_id"] = exercise_id
        if muscle_anatomy:
            doc["muscle_anatomy"] = muscle_anatomy
        if extra:
            doc.update(extra)

    teaching_file.write_text(yaml.dump(doc, allow_unicode=True, default_flow_style=False, sort_keys=False), encoding="utf-8")
    return teaching_file


def list_muscles() -> list[str]:
    return sorted(p.stem for p in MUSCLES_DIR.glob("*.yml"))


def muscles_for_exercise(exercise_id: str) -> list[str]:
    """Alle muscle_ids die diese Übung in exercises-Block haben."""
    result = []
    for muscle_id in list_muscles():
        doc = load_muscle(muscle_id)
        if doc and exercise_id in doc.get("exercises", {}):
            result.append(muscle_id)
    return result
