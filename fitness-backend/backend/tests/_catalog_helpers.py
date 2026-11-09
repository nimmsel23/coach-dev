"""Gemeinsame Helfer für test_catalog_*: synthetischer yuhonas-Klon und lokale Records."""
from __future__ import annotations

import json
from pathlib import Path

from fitness.catalog.core.resolver import ExerciseRecord

ENTRIES = [
    {"id": "Chin-Up", "name": "Chin-Up", "category": "strength", "equipment": "body only", "level": "beginner",
     "force": "pull", "mechanic": "compound", "primaryMuscles": ["lats"], "secondaryMuscles": ["biceps"],
     "instructions": ["Greife die Stange.", "Zieh dich hoch."], "images": ["Chin-Up/0.jpg", "Chin-Up/1.jpg"]},
    {"id": "Face_Pull", "name": "Face Pull", "category": "strength", "equipment": "cable",
     "primaryMuscles": ["shoulders"], "secondaryMuscles": [], "instructions": ["Zieh zum Gesicht."],
     "images": ["Face_Pull/0.jpg"]},
    {"id": "Push-Up_Wide", "name": "Push-Up Wide", "category": "strength", "equipment": "body only",
     "primaryMuscles": ["chest"], "secondaryMuscles": ["triceps"], "instructions": [], "images": ["Push-Up_Wide/0.jpg"]},
]


def make_clone(root: Path, entries=None) -> Path:
    entries = ENTRIES if entries is None else entries
    (root / "dist").mkdir(parents=True, exist_ok=True)
    (root / "dist" / "exercises.json").write_text(json.dumps(entries), encoding="utf-8")
    for e in (x for x in entries if isinstance(x, dict)):
        for img in e.get("images", []):
            f = root / "exercises" / img
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_bytes(b"\xff\xd8\xff" + b"JPEG")
    return root


def rec(exercise_id: str, name: str, *, source="expert", source_file="a.yml", **kw) -> ExerciseRecord:
    return ExerciseRecord(exercise_id=exercise_id, display_name=name, source_file=source_file, source=source, **kw)
