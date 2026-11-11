"""Modul-Workouts (6Pack-Tage, Calisthenics-Skills) als Workout-Vorlagen ("routines").

Datenbestand: `fitness/catalog/kb/exercises/6pack/*` und `.../calisthenics/*.yml`. Daraus entstehen Routinen im
Schema von `src/lib/db/firestore/routines.js`, die der Plan-Editor ("Aus Vorlage starten"), der Session-Tab
(Vorlagen-Launcher) und `fitness/{uid}/routines` ohnehin laden. Ein 6Pack-Tag ist ein Workout (Zirkel aus Zeit-Sätzen,
als ganzer Satz loggbar), ein Skill ist ein Workout mit der Progressionsstufe im Feld `progressionStage`.

Regeln wie bei coach_plan_push: deterministische IDs (`mod-6pack-w<Woche>-d<Tag>`, `mod-skill-<id>`), erneutes Pushen
überschreibt statt zu duplizieren, nur Routinen mit `source` `module-6pack` bzw. `module-skills` werden angelegt,
aktualisiert oder entfernt, fremde (in der App angelegte) Routinen bleiben unangetastet.

CLI (System-Python mit firebase_admin):
    python3 plan_runtime/module_templates.py <firebase-uid> [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

KB = Path(__file__).resolve().parents[1] / "fitness" / "catalog" / "kb" / "exercises"
SRC_6PACK, SRC_SKILLS = "module-6pack", "module-skills"
SOURCES = (SRC_6PACK, SRC_SKILLS)
# Skills, deren Stufen gehalten (Sekunden) statt wiederholt werden.
HOLD_SKILLS = {"back-lever", "front-lever", "planche", "human-flag", "v-sit", "one-arm-handstand", "hefesto"}


def _yaml(path: Path) -> Any:
    import yaml
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-") or "x"


def _exercise_doc(order: int, exid: str, name: str, *, tracking: str, sets: list[dict], rest: int, notes: str | None,
                  stage: str | None, module: str, protocol: str, primary: list | None = None,
                  secondary: list | None = None, instructions: list | None = None) -> dict[str, Any]:
    return {
        "id": f"{order:02d}-{_slug(exid)}", "exercise_id": exid, "name": name,
        "primaryMuscles": primary or [], "secondaryMuscles": secondary or [], "yuhonas_id": None,
        "equipment": ["bodyweight"], "instructions": instructions or [], "trackingType": tracking,
        "templateSets": [{"id": f"{order:02d}-{_slug(exid)}-s{i}", "setIndex": i, "setType": "normal",
                          "targetReps": s.get("reps"), "targetWeight": None, "targetDistance": None,
                          "targetDuration": s.get("seconds"), "progressionStage": stage} for i, s in enumerate(sets, 1)],
        "target_sets": len(sets), "target_reps": str(sets[0].get("reps") or "") if sets else "",
        "rest_seconds": rest, "weight_type": "bodyweight", "effort": "normal", "rir": None, "tempo": None,
        "drop_set": False, "notes": notes, "moduleId": module, "protocolType": protocol,
        "progressionStage": stage, "order": order,
    }


def build_6pack(kb: Path = KB) -> list[dict[str, Any]]:
    """Jeder verifizierte 6Pack-Tag → ein Workout. Gleiche aufeinanderfolgende Übungen werden zu Sätzen."""
    program = _yaml(kb / "6pack" / "week1_workouts.yml")
    names: dict[str, dict] = {}
    for path in (kb / "6pack").glob("*.yml"):
        if path.name.endswith("_workouts.yml"):
            continue
        for ex in (_yaml(path) or {}).get("exercises", []):
            names[ex["exercise_id"]] = ex
    week = int(re.search(r"week(\d+)", program["program_id"]).group(1)) if re.search(r"week(\d+)", program["program_id"]) else 1
    routines = []
    for day, spec in sorted((program.get("verified_days") or {}).items()):
        exercises: list[dict] = []
        pending: list[tuple[str, int]] = []  # (exercise_id, seconds) fortlaufend
        for item in spec["items"] + [{"type": "end"}]:
            if item["type"] == "exercise":
                if pending and pending[-1][0] == item["exercise_id"] and pending[-1][1] == item["duration_seconds"]:
                    pending.append((item["exercise_id"], item["duration_seconds"]))
                    continue
            if pending:
                exid, seconds = pending[0]
                meta = names.get(exid, {})
                rest = int(item["duration_seconds"]) if item["type"] == "rest" else 0
                exercises.append(_exercise_doc(
                    len(exercises), exid, meta.get("display_name") or meta.get("name") or exid.replace("_", " ").title(),
                    tracking="duration", sets=[{"seconds": seconds}] * len(pending), rest=rest,
                    notes=" ".join(meta.get("coaching_notes", [])[:1]) or None, stage=None, module="6pack",
                    protocol="timed-circuit", primary=meta.get("primary_muscles"), secondary=meta.get("secondary_muscles"),
                    instructions=meta.get("coaching_notes")))
                pending = []
            if item["type"] == "exercise":
                pending.append((item["exercise_id"], item["duration_seconds"]))
        routines.append({
            "id": f"mod-6pack-w{week}-d{day}",
            "meta": {"name": f"6Pack · Woche {week} · Tag {day}", "goal": f"{spec.get('total_seconds', 0) // 60} Min Rumpf-Zirkel",
                     "category": "6Pack", "source": SRC_6PACK, "exerciseCount": len(exercises),
                     "module": {"id": "6pack", "week": week, "day": int(day)}},
            "exercises": exercises})
    return routines


def build_skills(kb: Path = KB) -> list[dict[str, Any]]:
    """Jeder Calisthenics-Skill → ein Workout mit der ersten Progressionsstufe; die Stufen stehen in den Hinweisen."""
    routines = []
    for path in sorted((kb / "calisthenics").glob("*.yml")):
        skill = _yaml(path)
        if not skill or not skill.get("progressions"):
            continue
        stages = list(skill["progressions"])
        hold = skill["id"] in HOLD_SKILLS
        sets = [{"seconds": 10}] * 3 if hold else [{"reps": 5}] * 3
        ladder = " → ".join(stages)
        exercise = _exercise_doc(
            0, skill["id"], skill["name"], tracking="duration" if hold else "bodyweight_reps", sets=sets, rest=120,
            notes=f"Aktuelle Stufe im Feld 'Stufe' wählen. Leiter: {ladder}", stage=stages[0], module="skills",
            protocol="hold" if hold else "reps", instructions=[f"Progression: {ladder}"])
        routines.append({
            "id": f"mod-skill-{skill['id']}",
            "meta": {"name": f"Skill · {skill['name']}", "goal": f"{len(stages)} Stufen: {stages[0]} bis {stages[-1]}",
                     "category": "Skill", "source": SRC_SKILLS, "exerciseCount": 1,
                     "module": {"id": "skills", "skill": skill["id"], "stages": stages}},
            "exercises": [exercise]})
    return routines


def build_all(kb: Path = KB) -> list[dict[str, Any]]:
    return build_6pack(kb) + build_skills(kb)


def sync(db, uid: str, routines: list[dict[str, Any]], now: str | None = None) -> dict[str, Any]:
    """Schreibt die Vorlagen nach `fitness/{uid}/routines`; entfernt veraltete Modul-Routinen."""
    now = now or datetime.now(timezone.utc).isoformat()
    col = db.collection("fitness").document(uid).collection("routines")
    summary = {"written": [], "skipped_foreign": [], "removed": []}
    wanted = set()
    for routine in routines:
        rid = routine["id"]
        wanted.add(rid)
        ref = col.document(rid)
        existing = ref.get()
        if existing.exists and (existing.to_dict() or {}).get("source") not in SOURCES:
            summary["skipped_foreign"].append(rid)
            continue
        created = (existing.to_dict() or {}).get("created_at") if existing.exists else None
        ref.set({**routine["meta"], "created_at": created or now, "updated_at": now})
        keep = set()
        for ex in routine["exercises"]:
            keep.add(ex["id"])
            ref.collection("exercises").document(ex["id"]).set(ex)
        for old in ref.collection("exercises").stream():
            if old.id not in keep:
                old.reference.delete()
        summary["written"].append(rid)
    for doc in col.stream():
        if doc.id not in wanted and (doc.to_dict() or {}).get("source") in SOURCES:
            for old in doc.reference.collection("exercises").stream():
                old.reference.delete()
            doc.reference.delete()
            summary["removed"].append(doc.id)
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("uid")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    routines = build_all()
    if args.dry_run:
        print(json.dumps([{"id": r["id"], "name": r["meta"]["name"], "exercises": [e["name"] for e in r["exercises"]]} for r in routines], ensure_ascii=False, indent=2))
        return 0
    sys.path.insert(0, str(Path.home() / "dev" / "coach-dev"))
    from coach_plan_push import get_db  # gleiche Service-Account-Anbindung wie die Plan-Zustellung
    print(json.dumps(sync(get_db(), args.uid, routines), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
