"""Routinen (Plan-Vorlagen) + geloggte Workout-Instanzen (Calisthenics-Modell).

Portiert von server.mjs (Node) — dort war das der letzte Bereich ohne
Python-Äquivalent, der SPA-Fallback lieferte für diese Routen still
index.html statt JSON zurück, sobald nur noch fitness-api lief. Node bleibt
reiner Vite-Proxy/Frontend-Host; neue Backend-Logik kommt nur noch hierher.

Speicherort: ~/.aos/fitness/users/<uid>/routines.json bzw. workouts.json
(identisch zum bisherigen Node-Pfad ~/.aos/users/<uid>/fitness/*.json, der
per Symlink auf denselben Ordner zeigt).
"""
from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from fitness.api.config import SESS_ROOT, _read_json, _write_json, _uid_from_request

router = APIRouter()


def _routines_path(uid: str) -> Path:
    return SESS_ROOT / uid / "routines.json"


def _workouts_path(uid: str) -> Path:
    return SESS_ROOT / uid / "workouts.json"


def _new_id() -> str:
    return str(uuid.uuid4())


# ── Normalisierung (1:1 zu server.mjs) ──────────────────────────────────────

def _normalize_tracking_type(value: str | None) -> str:
    raw = (value or "").strip().lower()
    if raw in ("bodyweight_reps", "bodyweight", "bodyweight&reps"):
        return "bodyweight_reps"
    if raw in ("distance_time", "distance", "distance&time", "cardio"):
        return "distance_time"
    if raw in ("duration", "time", "timer"):
        return "duration"
    return "weight_reps"


def _default_template_set(index: int = 0, overrides: dict | None = None) -> dict:
    o = overrides or {}
    return {
        "id": o.get("id") or _new_id(),
        "setIndex": o.get("setIndex", index + 1),
        "setType": o.get("setType") or "normal",
        "targetReps": o.get("targetReps", "8-12"),
        "targetWeight": o.get("targetWeight"),
        "targetDistance": o.get("targetDistance"),
        "targetDuration": o.get("targetDuration"),
        "progressionStage": o.get("progressionStage"),
    }


def _normalize_template_sets(exercise: dict) -> list[dict]:
    raw = exercise.get("templateSets")
    if not isinstance(raw, list) or not raw:
        n = max(1, int(exercise.get("target_sets") or 3))
        set_type = "drop" if exercise.get("drop_set") else (
            "failure" if exercise.get("effort") in ("to_failure", "absolute_failure") else "normal"
        )
        raw = [
            _default_template_set(i, {
                "targetReps": exercise.get("target_reps", "8-12"),
                "targetWeight": exercise.get("target_weight"),
                "setType": set_type,
            })
            for i in range(n)
        ]
    return [_default_template_set(i, s) for i, s in enumerate(raw)]


def _derive_legacy_routine_fields(exercise: dict) -> dict:
    template_sets = _normalize_template_sets(exercise)
    return {
        "trackingType": _normalize_tracking_type(exercise.get("trackingType") or exercise.get("weight_type")),
        "templateSets": template_sets,
        "target_sets": len(template_sets),
        "target_reps": template_sets[0].get("targetReps", "8-12"),
        "target_weight": template_sets[0].get("targetWeight"),
        "drop_set": any(s.get("setType") == "drop" for s in template_sets),
        "effort": "to_failure" if any(s.get("setType") == "failure" for s in template_sets) else (exercise.get("effort") or "normal"),
        "weight_type": exercise.get("weight_type") or "kg",
    }


def _normalize_routine_exercise(exercise: dict, order: int = 0) -> dict:
    derived = _derive_legacy_routine_fields(exercise)
    return {
        **exercise,
        **derived,
        "id": exercise.get("id") or _new_id(),
        "name": exercise.get("name") or exercise.get("exercise_id") or "Übung",
        "primaryMuscles": exercise.get("primaryMuscles") if isinstance(exercise.get("primaryMuscles"), list) else [],
        "secondaryMuscles": exercise.get("secondaryMuscles") if isinstance(exercise.get("secondaryMuscles"), list) else [],
        "yuhonas_id": exercise.get("yuhonas_id"),
        "rest_seconds": exercise.get("rest_seconds") if exercise.get("rest_seconds") is not None else 90,
        "rir": exercise.get("rir"),
        "tempo": exercise.get("tempo"),
        "notes": exercise.get("notes"),
        "order": exercise.get("order") if isinstance(exercise.get("order"), int) else order,
    }


def _normalize_set_entry(s: dict, index: int = 0) -> dict:
    return {
        "id": s.get("id") or _new_id(),
        "order": s.get("order") if isinstance(s.get("order"), int) else index,
        "setIndex": s.get("setIndex", index + 1),
        "setType": s.get("setType") or "normal",
        "targetReps": s.get("targetReps"),
        "targetWeight": s.get("targetWeight"),
        "targetDistance": s.get("targetDistance"),
        "targetDuration": s.get("targetDuration"),
        "progressionStage": s.get("progressionStage"),
        "ghostReps": s.get("ghostReps"),
        "ghostWeight": s.get("ghostWeight"),
        "ghostDistance": s.get("ghostDistance"),
        "ghostDuration": s.get("ghostDuration"),
        "reps": s.get("reps"),
        "weight": s.get("weight"),
        "distance": s.get("distance"),
        "duration": s.get("duration"),
        "completed": bool(s.get("completed")),
    }


def _normalize_workout_exercise(exercise: dict, order: int = 0) -> dict:
    sets = exercise.get("sets")
    return {
        **exercise,
        "id": exercise.get("id") or _new_id(),
        "name": exercise.get("name") or exercise.get("exercise_id") or "Übung",
        "trackingType": _normalize_tracking_type(exercise.get("trackingType") or exercise.get("weight_type")),
        "primaryMuscles": exercise.get("primaryMuscles") if isinstance(exercise.get("primaryMuscles"), list) else [],
        "secondaryMuscles": exercise.get("secondaryMuscles") if isinstance(exercise.get("secondaryMuscles"), list) else [],
        "yuhonas_id": exercise.get("yuhonas_id"),
        "rest_seconds": exercise.get("rest_seconds") if exercise.get("rest_seconds") is not None else 90,
        "notes": exercise.get("notes"),
        "order": exercise.get("order") if isinstance(exercise.get("order"), int) else order,
        "sets": [_normalize_set_entry(s, i) for i, s in enumerate(sets)] if isinstance(sets, list) else [],
    }


def _read_routines(uid: str) -> list[dict]:
    return _read_json(_routines_path(uid)) or []


def _write_routines(uid: str, routines: list[dict]) -> None:
    normalized = [
        {**r, "exercises": [_normalize_routine_exercise(e, i) for i, e in enumerate(r.get("exercises") or [])]}
        for r in (routines or [])
    ]
    _write_json(_routines_path(uid), normalized)


def _read_workouts(uid: str) -> list[dict]:
    return _read_json(_workouts_path(uid)) or []


def _write_workouts(uid: str, workouts: list[dict]) -> None:
    normalized = [
        {**w, "exercises": [_normalize_workout_exercise(e, i) for i, e in enumerate(w.get("exercises") or [])]}
        for w in (workouts or [])
    ]
    _write_json(_workouts_path(uid), normalized)


def _extract_historical_sets(exercise: dict) -> list[dict]:
    sa = exercise.get("setsArray")
    if isinstance(sa, list) and sa:
        return sa
    s = exercise.get("sets")
    if isinstance(s, list) and s:
        return s
    return []


def _find_latest_exercise_performance(uid: str, exercise_id: str | None) -> dict | None:
    if not exercise_id:
        return None
    sess_dir = SESS_ROOT / uid / "sessions"
    files = sorted(sess_dir.glob("*.json"), reverse=True) if sess_dir.exists() else []
    for f in files:
        session = _read_json(f) or {}
        for ex in session.get("exercises") or []:
            if str(ex.get("exercise_id") or ex.get("id") or "") == str(exercise_id):
                hist_sets = [s for s in _extract_historical_sets(ex) if s]
                if hist_sets:
                    return {
                        "date": session.get("date") or f.name.removesuffix(".json").split("__")[0],
                        "exercise": ex,
                        "sets": hist_sets,
                    }

    workout_logs = [w for w in _read_workouts(uid) if w.get("finished_at")]
    workout_logs.sort(key=lambda w: str(w.get("finished_at") or w.get("started_at") or ""), reverse=True)
    for workout in workout_logs:
        for ex in workout.get("exercises") or []:
            if str(ex.get("exercise_id") or ex.get("id") or "") == str(exercise_id):
                hist_sets = [s for s in _extract_historical_sets(ex) if s]
                if hist_sets:
                    return {"date": workout.get("finished_at") or workout.get("started_at"), "exercise": ex, "sets": hist_sets}
    return None


def _build_workout_exercise_from_routine(uid: str, routine_exercise: dict) -> dict:
    template_sets = _normalize_template_sets(routine_exercise)
    history = _find_latest_exercise_performance(uid, routine_exercise.get("exercise_id"))
    hist_sets = (history or {}).get("sets") or []

    def _mk_set(template_set: dict, index: int) -> dict:
        previous = hist_sets[index] if index < len(hist_sets) else (hist_sets[0] if hist_sets else {})
        return _normalize_set_entry({
            "setType": template_set.get("setType"),
            "targetReps": template_set.get("targetReps"),
            "targetWeight": template_set.get("targetWeight"),
            "targetDistance": template_set.get("targetDistance"),
            "targetDuration": template_set.get("targetDuration"),
            "progressionStage": template_set.get("progressionStage") or routine_exercise.get("progressionStage"),
            "ghostReps": previous.get("reps", template_set.get("targetReps")),
            "ghostWeight": previous.get("weight", template_set.get("targetWeight")),
            "ghostDistance": previous.get("distance", template_set.get("targetDistance")),
            "ghostDuration": previous.get("duration", template_set.get("targetDuration")),
        }, index)

    return _normalize_workout_exercise({
        "exercise_id": routine_exercise.get("exercise_id"),
        "name": routine_exercise.get("name"),
        "primaryMuscles": routine_exercise.get("primaryMuscles"),
        "secondaryMuscles": routine_exercise.get("secondaryMuscles"),
        "yuhonas_id": routine_exercise.get("yuhonas_id"),
        "trackingType": routine_exercise.get("trackingType"),
        "rest_seconds": routine_exercise.get("rest_seconds"),
        "notes": routine_exercise.get("notes"),
        "equipment": routine_exercise.get("equipment") or [],
        "instructions": routine_exercise.get("instructions") or [],
        "order": routine_exercise.get("order"),
        "sets": [_mk_set(ts, i) for i, ts in enumerate(template_sets)],
        "lastPerformedAt": (history or {}).get("date"),
    })


# ── Routines ─────────────────────────────────────────────────────────────────

@router.get("/routines")
def list_routines(request: Request):
    uid = _uid_from_request(request)
    routines = sorted(_read_routines(uid), key=lambda r: r.get("created_at") or "", reverse=True)
    return {"routines": [
        {**{k: v for k, v in r.items() if k != "exercises"}, "exerciseCount": len(r.get("exercises") or [])}
        for r in routines
    ]}


@router.post("/routines")
async def create_routine(request: Request):
    uid = _uid_from_request(request)
    body: dict[str, Any] = await request.json()
    routines = _read_routines(uid)
    routine = {
        "id": _new_id(), "name": body.get("name"), "goal": body.get("goal"),
        "category": body.get("category"), "created_at": datetime.now().isoformat(), "exercises": [],
    }
    routines.append(routine)
    _write_routines(uid, routines)
    return {"id": routine["id"]}


@router.get("/routines/{routine_id}")
def get_routine(routine_id: str, request: Request):
    uid = _uid_from_request(request)
    routine = next((r for r in _read_routines(uid) if r.get("id") == routine_id), None)
    if not routine:
        raise HTTPException(404, detail="not_found")
    exercises = sorted(routine.get("exercises") or [], key=lambda e: e.get("order", 0))
    exercises = [_normalize_routine_exercise(e, i) for i, e in enumerate(exercises)]
    return {"routine": {**routine, "exercises": exercises}}


@router.patch("/routines/{routine_id}")
async def patch_routine(routine_id: str, request: Request):
    uid = _uid_from_request(request)
    body: dict[str, Any] = await request.json()
    routines = _read_routines(uid)
    routine = next((r for r in routines if r.get("id") == routine_id), None)
    if not routine:
        raise HTTPException(404, detail="not_found")
    routine.update(body)
    _write_routines(uid, routines)
    return {"ok": True}


@router.delete("/routines/{routine_id}")
def delete_routine(routine_id: str, request: Request):
    uid = _uid_from_request(request)
    routines = [r for r in _read_routines(uid) if r.get("id") != routine_id]
    _write_routines(uid, routines)
    return {"ok": True}


@router.post("/routines/{routine_id}/exercises")
async def add_routine_exercise(routine_id: str, request: Request):
    uid = _uid_from_request(request)
    body: dict[str, Any] = await request.json()
    routines = _read_routines(uid)
    routine = next((r for r in routines if r.get("id") == routine_id), None)
    if not routine:
        raise HTTPException(404, detail="not_found")
    order = len(routine.get("exercises") or [])
    exercise = _normalize_routine_exercise({
        "id": _new_id(), "exercise_id": body.get("exercise_id"), "name": body.get("name") or body.get("exercise_id"),
        "primaryMuscles": body.get("primaryMuscles") or [], "secondaryMuscles": body.get("secondaryMuscles") or [],
        "yuhonas_id": body.get("yuhonas_id"), "trackingType": body.get("trackingType") or "weight_reps",
        "templateSets": body.get("templateSets"), "target_sets": body.get("target_sets", 3), "target_reps": body.get("target_reps", "8-12"), "rest_seconds": body.get("rest_seconds", 90),
        "weight_type": "kg", "effort": "normal", "rir": body.get("rir"), "tempo": body.get("tempo"), "drop_set": False, "notes": body.get("notes"),
        "equipment": body.get("equipment") or [], "instructions": body.get("instructions") or [],
        "moduleId": body.get("moduleId"), "protocolType": body.get("protocolType"),
        "progressionStage": body.get("progressionStage"), "order": order,
    }, order)
    routine.setdefault("exercises", []).append(exercise)
    _write_routines(uid, routines)
    return {"id": exercise["id"]}


@router.patch("/routines/{routine_id}/exercises/{exercise_id}")
async def patch_routine_exercise(routine_id: str, exercise_id: str, request: Request):
    uid = _uid_from_request(request)
    body: dict[str, Any] = await request.json()
    routines = _read_routines(uid)
    routine = next((r for r in routines if r.get("id") == routine_id), None)
    exercise = next((e for e in (routine or {}).get("exercises") or [] if e.get("id") == exercise_id), None)
    if not exercise:
        raise HTTPException(404, detail="not_found")
    exercise.update(body)
    _write_routines(uid, routines)
    return {"ok": True}


@router.delete("/routines/{routine_id}/exercises/{exercise_id}")
def delete_routine_exercise(routine_id: str, exercise_id: str, request: Request):
    uid = _uid_from_request(request)
    routines = _read_routines(uid)
    routine = next((r for r in routines if r.get("id") == routine_id), None)
    if not routine:
        raise HTTPException(404, detail="not_found")
    routine["exercises"] = [e for e in routine.get("exercises") or [] if e.get("id") != exercise_id]
    _write_routines(uid, routines)
    return {"ok": True}


@router.put("/routines/{routine_id}/exercises/order")
async def reorder_routine_exercises(routine_id: str, request: Request):
    uid = _uid_from_request(request)
    body: dict[str, Any] = await request.json()
    routines = _read_routines(uid)
    routine = next((r for r in routines if r.get("id") == routine_id), None)
    if not routine:
        raise HTTPException(404, detail="not_found")
    order_by_id = {o["id"]: o["order"] for o in body.get("order") or []}
    for e in routine.get("exercises") or []:
        if e.get("id") in order_by_id:
            e["order"] = order_by_id[e["id"]]
    _write_routines(uid, routines)
    return {"ok": True}


# ── Workouts (geloggte Instanzen) ────────────────────────────────────────────

@router.get("/workouts")
def list_workouts(request: Request):
    uid = _uid_from_request(request)
    workouts = sorted(_read_workouts(uid), key=lambda w: w.get("started_at") or "", reverse=True)
    return {"workouts": [
        {**{k: v for k, v in w.items() if k != "exercises"}, "exerciseCount": len(w.get("exercises") or [])}
        for w in workouts
    ]}


@router.post("/workouts")
async def create_workout(request: Request):
    uid = _uid_from_request(request)
    body: dict[str, Any] = await request.json()
    workouts = _read_workouts(uid)
    exercises: list[dict] = []
    name = body.get("name")
    routine_id = body.get("routine_id")
    routine = body.get("routine_snapshot")
    if routine is None and routine_id:
        routine = next((r for r in _read_routines(uid) if r.get("id") == routine_id), None)
        if routine is None:
            raise HTTPException(404, detail="routine_not_found")
    if routine is not None:
        if not isinstance(routine, dict) or not isinstance(routine.get("exercises"), list):
            raise HTTPException(422, detail="invalid_routine_snapshot")
        name = name or routine.get("name")
        ordered = sorted(routine["exercises"], key=lambda e: e.get("order", 0))
        exercises = [
            _build_workout_exercise_from_routine(uid, _normalize_routine_exercise(e, e.get("order", i)))
            for i, e in enumerate(ordered)
        ]

    workout = {
        "id": _new_id(), "routine_id": routine_id, "sourceRoutineId": routine_id,
        "sourcePlanId": body.get("sourcePlanId"), "sourcePlanRoutineId": body.get("sourcePlanRoutineId"),
        "sourceAssignmentId": body.get("sourceAssignmentId"),
        "name": name or f"Workout {datetime.now().strftime('%d.%m.')}",
        "started_at": datetime.now().isoformat(), "finished_at": None, "sessionState": "work",
        "protocolMeta": {"moduleId": body.get("moduleId"), "protocolType": body.get("protocolType"), "requiresReview": True},
        "eventLog": [], "exercises": exercises,
    }
    workouts.append(workout)
    _write_workouts(uid, workouts)
    return {"id": workout["id"]}


@router.get("/workouts/{workout_id}")
def get_workout(workout_id: str, request: Request):
    uid = _uid_from_request(request)
    workout = next((w for w in _read_workouts(uid) if w.get("id") == workout_id), None)
    if not workout:
        raise HTTPException(404, detail="not_found")
    exercises = sorted(workout.get("exercises") or [], key=lambda e: e.get("order", 0))
    result = []
    for i, ex in enumerate(exercises):
        normalized = _normalize_workout_exercise(ex, i)
        normalized["sets"] = sorted(normalized["sets"], key=lambda s: s.get("order", 0))
        result.append(normalized)
    return {"workout": {**workout, "exercises": result}}


@router.patch("/workouts/{workout_id}")
async def patch_workout(workout_id: str, request: Request):
    uid = _uid_from_request(request)
    body: dict[str, Any] = await request.json()
    workouts = _read_workouts(uid)
    workout = next((w for w in workouts if w.get("id") == workout_id), None)
    if not workout:
        raise HTTPException(404, detail="not_found")
    workout.update(body)
    if isinstance(body.get("exercises"), list):
        workout["exercises"] = [_normalize_workout_exercise(e, i) for i, e in enumerate(body["exercises"])]
    _write_workouts(uid, workouts)
    return {"ok": True}


@router.delete("/workouts/{workout_id}")
def delete_workout(workout_id: str, request: Request):
    uid = _uid_from_request(request)
    workouts = [w for w in _read_workouts(uid) if w.get("id") != workout_id]
    _write_workouts(uid, workouts)
    return {"ok": True}


@router.post("/workouts/{workout_id}/exercises")
async def add_workout_exercise(workout_id: str, request: Request):
    uid = _uid_from_request(request)
    body: dict[str, Any] = await request.json()
    workouts = _read_workouts(uid)
    workout = next((w for w in workouts if w.get("id") == workout_id), None)
    if not workout:
        raise HTTPException(404, detail="not_found")
    order = len(workout.get("exercises") or [])
    exercise = _normalize_workout_exercise({
        "id": _new_id(), "exercise_id": body.get("exercise_id"), "name": body.get("name") or body.get("exercise_id"),
        "primaryMuscles": body.get("primaryMuscles") or [], "secondaryMuscles": body.get("secondaryMuscles") or [],
        "yuhonas_id": body.get("yuhonas_id"), "trackingType": body.get("trackingType") or "weight_reps",
        "rest_seconds": body.get("rest_seconds", 90), "weight_type": "kg", "notes": body.get("notes"), "order": order,
        "equipment": body.get("equipment") or [], "instructions": body.get("instructions") or [],
        "sets": [_normalize_set_entry({}, i) for i in range(3)],
    }, order)
    workout.setdefault("exercises", []).append(exercise)
    _write_workouts(uid, workouts)
    return {"id": exercise["id"]}


@router.delete("/workouts/{workout_id}/exercises/{exercise_id}")
def delete_workout_exercise(workout_id: str, exercise_id: str, request: Request):
    uid = _uid_from_request(request)
    workouts = _read_workouts(uid)
    workout = next((w for w in workouts if w.get("id") == workout_id), None)
    if not workout:
        raise HTTPException(404, detail="not_found")
    workout["exercises"] = [e for e in workout.get("exercises") or [] if e.get("id") != exercise_id]
    _write_workouts(uid, workouts)
    return {"ok": True}


@router.put("/workouts/{workout_id}/exercises/order")
async def reorder_workout_exercises(workout_id: str, request: Request):
    uid = _uid_from_request(request)
    body: dict[str, Any] = await request.json()
    workouts = _read_workouts(uid)
    workout = next((w for w in workouts if w.get("id") == workout_id), None)
    if not workout:
        raise HTTPException(404, detail="not_found")
    order_by_id = {o["id"]: o["order"] for o in body.get("order") or []}
    for e in workout.get("exercises") or []:
        if e.get("id") in order_by_id:
            e["order"] = order_by_id[e["id"]]
    _write_workouts(uid, workouts)
    return {"ok": True}


@router.post("/workouts/{workout_id}/exercises/{exercise_id}/sets")
def add_set(workout_id: str, exercise_id: str, request: Request):
    uid = _uid_from_request(request)
    workouts = _read_workouts(uid)
    workout = next((w for w in workouts if w.get("id") == workout_id), None)
    exercise = next((e for e in (workout or {}).get("exercises") or [] if e.get("id") == exercise_id), None)
    if not exercise:
        raise HTTPException(404, detail="not_found")
    last_template = exercise["sets"][-1] if exercise.get("sets") else {}
    new_set = _normalize_set_entry({
        "setType": last_template.get("setType") or "normal",
        "targetReps": last_template.get("targetReps"), "targetWeight": last_template.get("targetWeight"),
        "targetDistance": last_template.get("targetDistance"), "targetDuration": last_template.get("targetDuration"),
        "progressionStage": last_template.get("progressionStage"),
    }, len(exercise.get("sets") or []))
    exercise.setdefault("sets", []).append(new_set)
    _write_workouts(uid, workouts)
    return {"id": new_set["id"]}


@router.patch("/workouts/{workout_id}/exercises/{exercise_id}/sets/{set_id}")
async def patch_set(workout_id: str, exercise_id: str, set_id: str, request: Request):
    uid = _uid_from_request(request)
    body: dict[str, Any] = await request.json()
    workouts = _read_workouts(uid)
    workout = next((w for w in workouts if w.get("id") == workout_id), None)
    exercise = next((e for e in (workout or {}).get("exercises") or [] if e.get("id") == exercise_id), None)
    s = next((s for s in (exercise or {}).get("sets") or [] if s.get("id") == set_id), None)
    if not s:
        raise HTTPException(404, detail="not_found")
    s.update(body)
    _write_workouts(uid, workouts)
    return {"ok": True}


@router.delete("/workouts/{workout_id}/exercises/{exercise_id}/sets/{set_id}")
def delete_set(workout_id: str, exercise_id: str, set_id: str, request: Request):
    uid = _uid_from_request(request)
    workouts = _read_workouts(uid)
    workout = next((w for w in workouts if w.get("id") == workout_id), None)
    exercise = next((e for e in (workout or {}).get("exercises") or [] if e.get("id") == exercise_id), None)
    if not exercise:
        raise HTTPException(404, detail="not_found")
    exercise["sets"] = [s for s in exercise.get("sets") or [] if s.get("id") != set_id]
    _write_workouts(uid, workouts)
    return {"ok": True}
