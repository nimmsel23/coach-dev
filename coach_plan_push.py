#!/usr/bin/env python3
"""Klienten-Plan (plan.json, ClientForge-Format) -> Firestore-Routinen.

Quelle der Wahrheit ist `<CLIENTS_ROOT>/<client>/data/plan.json` (`{einheiten:[…]}`),
das der Coach im PlanEditor pflegt. Jede Einheit wird zu einer Routine unter
`fitness/<firebase_uid>/routines/<routineId>` mit Übungen in der Subcollection
`exercises` (gleiches Schema wie `src/lib/db/firestore/routines.js`), die die
Klienten-App im Plan-Tab liest.

Regeln:
- IDs sind deterministisch (`plan-<einheit>`, `<nn>-<übung>`), ein erneuter Push
  überschreibt statt zu duplizieren.
- Nur Routinen mit `source == "klienten-plan"` werden von uns angelegt, aktualisiert
  oder entfernt (wenn die Einheit aus dem Plan verschwindet). In der App selbst
  angelegte Routinen bleiben unangetastet.
- Übungen einer gepushten Routine, die im Plan fehlen, werden entfernt (Plan ist Quelle).

CLI (läuft im System-Python, das hat firebase_admin):
    python3 coach_plan_push.py <client-id> [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SOURCE = "klienten-plan"
CLIENTS_ROOT = Path(os.environ.get("CLIENTS_ROOT", Path.home() / ".local" / "Klienten"))
CRED_PATH = Path.home() / ".env" / "firebase-fitness.json"
PROJECT = os.environ.get("FIREBASE_FITNESS_PROJECT", "fitness-aos")


def slug(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "x"


def _int(value: Any, default: int | None = None) -> int | None:
    try:
        return int(float(str(value).replace(",", ".").strip()))
    except (TypeError, ValueError):
        return default


def _float(value: Any) -> float | None:
    try:
        text = str(value).replace(",", ".").strip()
        return float(text) if text else None
    except ValueError:
        return None  # z. B. "BW"


def _rest_seconds(value: Any) -> int:
    text = str(value or "").strip().lower()
    m = re.fullmatch(r"(\d+)\s*(min|m)", text)
    if m:
        return int(m.group(1)) * 60
    return _int(re.sub(r"[^\d.]", "", text), 90) if text else 90


def _single_reps(wdh: Any) -> int | None:
    text = str(wdh or "").strip()
    return int(text) if text.isdigit() else None


def build_routines(plan: dict[str, Any]) -> list[dict[str, Any]]:
    """einheiten -> [{id, meta, exercises:[{id, …}]}] (rein, ohne I/O)."""
    routines = []
    for einheit in plan.get("einheiten") or []:
        name = (einheit.get("name") or "").strip()
        if not name:
            continue
        exercises = []
        for abschnitt in einheit.get("abschnitte") or []:
            for u in abschnitt.get("übungen") or []:
                uname = (u.get("name") or "").strip()
                if not (uname or u.get("id")):
                    continue
                order = len(exercises)
                sets = _int(u.get("sätze"), 3) or 3
                reps = u.get("wdh") if u.get("wdh") not in (None, "") else "8-12"
                weight = _float(u.get("gewicht"))
                exid = f"{order:02d}-{slug(u.get('id') or uname)}"
                exercises.append({
                    "id": exid,
                    "exercise_id": u.get("id"),
                    "name": uname or u.get("id"),
                    "primaryMuscles": [],
                    "secondaryMuscles": [],
                    "yuhonas_id": None,
                    "equipment": [],
                    "instructions": [],
                    "trackingType": "bodyweight_reps" if str(u.get("gewicht", "")).strip().upper() == "BW" else "weight_reps",
                    "templateSets": [
                        {"id": f"{exid}-s{n}", "setIndex": n, "setType": "normal",
                         "targetReps": _single_reps(reps), "targetWeight": weight,
                         "targetDistance": None, "targetDuration": None, "progressionStage": None}
                        for n in range(1, sets + 1)
                    ],
                    "target_sets": sets,
                    "target_reps": str(reps),
                    "rest_seconds": _rest_seconds(u.get("pause")),
                    "weight_type": "kg", "effort": "normal", "rir": None, "tempo": None, "drop_set": False,
                    "notes": u.get("notiz") or u.get("notes") or (abschnitt.get("name") or None),
                    "moduleId": None, "protocolType": None, "progressionStage": None,
                    "order": order,
                })
        routines.append({
            "id": f"plan-{slug(name)}",
            "meta": {"name": name, "goal": einheit.get("ziel") or None, "category": einheit.get("frequenz") or None,
                     "source": SOURCE, "exerciseCount": len(exercises)},
            "exercises": exercises,
        })
    return routines


def sync_routines(db, uid: str, routines: list[dict[str, Any]], now: str | None = None) -> dict[str, Any]:
    """Schreibt `routines` nach Firestore (`db` = firestore.Client oder kompatibel)."""
    now = now or datetime.now(timezone.utc).isoformat()
    col = db.collection("fitness").document(uid).collection("routines")
    summary = {"written": [], "removed_exercises": 0, "removed_routines": [], "skipped_foreign": []}
    wanted = set()
    for routine in routines:
        rid = routine["id"]
        wanted.add(rid)
        ref = col.document(rid)
        existing = ref.get()
        if existing.exists and (existing.to_dict() or {}).get("source") != SOURCE:
            summary["skipped_foreign"].append(rid)  # gleiche ID, aber nicht von uns: nicht überschreiben
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
                summary["removed_exercises"] += 1
        summary["written"].append(rid)
    for doc in col.stream():
        if doc.id not in wanted and (doc.to_dict() or {}).get("source") == SOURCE:
            for old in doc.reference.collection("exercises").stream():
                old.reference.delete()
            doc.reference.delete()
            summary["removed_routines"].append(doc.id)
    return summary


def load_client(client: str) -> tuple[str, dict[str, Any]]:
    root = CLIENTS_ROOT / client
    info = json.loads((root / "client.json").read_text(encoding="utf-8"))
    uid = info.get("firebase_uid")
    if not uid:
        raise SystemExit(f"{client}: keine firebase_uid in client.json — Plan nicht app-sichtbar")
    plan_file = root / "data" / "plan.json"
    plan = json.loads(plan_file.read_text(encoding="utf-8")) if plan_file.exists() else {"einheiten": []}
    return uid, plan


def get_db():
    import firebase_admin
    from firebase_admin import credentials, firestore
    if not CRED_PATH.exists():
        raise FileNotFoundError(f"Service-Account fehlt: {CRED_PATH}")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(str(CRED_PATH)), {"projectId": PROJECT})
    return firestore.client()


def push(client: str, dry_run: bool = False, db=None) -> dict[str, Any]:
    uid, plan = load_client(client)
    routines = build_routines(plan)
    if dry_run:
        return {"client": client, "uid": uid, "dry_run": True,
                "routines": [{"id": r["id"], "name": r["meta"]["name"], "exercises": [e["name"] for e in r["exercises"]]}
                             for r in routines]}
    return {"client": client, "uid": uid, **sync_routines(db or get_db(), uid, routines)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("client")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    print(json.dumps(push(args.client, args.dry_run), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
