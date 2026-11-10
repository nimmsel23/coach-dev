"""Coach-Plan-Zuweisung: Coach weist Klienten einen Plan zu, Klient trackt Completions.

Speicherort: ~/.aos/fitness/users/<uid>/plans/*.json (ein File pro Plan) +
~/.aos/fitness/users/<uid>/plans/<planId>/completions/<date>.json.
Portiert von server.mjs (Node) — dort fehlte das Python-Äquivalent komplett,
der SPA-Fallback lieferte für diese Routen still index.html statt JSON zurück.
"""
from __future__ import annotations

from datetime import date as date_cls, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from loguru import logger

from fitness.api.config import RUNTIME, _read_json, _write_json, _uid_from_request

router = APIRouter(prefix="/fitness")


def _client_plans_dir(uid: str) -> Path:
    return RUNTIME / "users" / uid / "plans"


@router.get("/coach/plans/{client_uid}")
def list_client_plans(client_uid: str, coach_uid: str = Query("", alias="coachUid")):
    dir_ = _client_plans_dir(client_uid)
    if not dir_.exists():
        return {"ok": True, "plans": []}
    plans = []
    for f in sorted(dir_.glob("*.json")):
        p = _read_json(f)
        if p and (not coach_uid or p.get("createdBy") == coach_uid):
            plans.append(p)
    return {"ok": True, "plans": plans}


@router.post("/coach/plans/{client_uid}")
async def assign_plan(client_uid: str, request: Request):
    body: dict[str, Any] = await request.json()
    coach_uid = body.get("coachUid")
    plan = body.get("plan")
    if not coach_uid or not plan:
        raise HTTPException(400, detail="missing fields")

    dir_ = _client_plans_dir(client_uid)
    plan_id = plan.get("id") or f"plan_{int(datetime.now().timestamp() * 1000)}"
    record = {
        **plan,
        "id": plan_id,
        "createdBy": coach_uid,
        "assignedTo": client_uid,
        "assignedAt": datetime.now().isoformat(),
    }
    _write_json(dir_ / f"{plan_id}.json", record)
    logger.info(f"coach_plans: {coach_uid} → {client_uid} plan {plan_id} zugewiesen")
    return {"ok": True, "plan": record}


@router.get("/coach/plans/{client_uid}/{plan_id}/progress")
def plan_progress(client_uid: str, plan_id: str, date: str = Query("")):
    plan = _read_json(_client_plans_dir(client_uid) / f"{plan_id}.json")
    if not plan:
        return {"ok": True, "progress": None}

    target_date = date or date_cls.today().isoformat()
    completion = _read_json(_client_plans_dir(client_uid) / plan_id / "completions" / f"{target_date}.json")
    exercises = plan.get("exercises") or []
    done_count = len((completion or {}).get("doneExerciseIds") or [])

    return {
        "ok": True,
        "progress": {
            "planId": plan_id,
            "planName": plan.get("name") or "Unnamed Plan",
            "totalExercises": len(exercises),
            "doneExercises": done_count,
            "completionPercentage": round(done_count / len(exercises) * 100) if exercises else 0,
            "lastUpdate": (completion or {}).get("completedAt"),
        },
    }


@router.get("/plans/assigned")
def assigned_plans(request: Request, uid: str = Query("")):
    resolved_uid = uid or _uid_from_request(request)
    dir_ = _client_plans_dir(resolved_uid)
    if not dir_.exists():
        return {"ok": True, "plans": []}
    plans = [p for f in sorted(dir_.glob("*.json")) if (p := _read_json(f))]
    return {"ok": True, "plans": plans}


@router.post("/plans/{plan_id}/completions")
async def toggle_completion(plan_id: str, request: Request, uid: str = Query("")):
    resolved_uid = uid or _uid_from_request(request)
    body: dict[str, Any] = await request.json()
    target_date = body.get("date") or date_cls.today().isoformat()

    file = _client_plans_dir(resolved_uid) / plan_id / "completions" / f"{target_date}.json"
    current = _read_json(file) or {"date": target_date, "doneExerciseIds": []}
    done = set(current.get("doneExerciseIds") or [])

    if isinstance(body.get("doneExerciseIds"), list):
        done = set(body["doneExerciseIds"])
    elif body.get("exerciseId"):
        ex_id = body["exerciseId"]
        done.discard(ex_id) if ex_id in done else done.add(ex_id)

    record = {
        "date": target_date,
        "doneExerciseIds": sorted(done),
        "completedAt": datetime.now().isoformat(),
    }
    _write_json(file, record)
    return {"ok": True, "completion": record}
