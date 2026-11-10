"""Makrozyklen: Coach baut Klienten einen rotierenden Trainingszyklus
(z.B. Push/Pull/Legs) mit sichtbarer Progression — kein Kalender/Wochentage.

Struktur:
  Makrozyklus → Routinen (z.B. Push, Pull, Legs), fest geordnet, rotieren
  endlos. Jede Routine hat eine Ziel-Übungsliste (sets/reps/weight, vom Coach
  von Hand gepflegt). Der Klient arbeitet sie der Reihe nach ab; jede
  abgeschlossene Einheit wird als Completion samt tatsächlicher Leistung
  gespeichert — daraus ergibt sich "letztes Mal"-Referenz für Progression,
  ohne dass irgendwas automatisch hochgerechnet wird.

Speicherort: ~/.aos/fitness/users/<client_uid>/macrocycles/<id>.json
Completions: .../macrocycles/<id>/completions/<timestamp>.json
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from loguru import logger

from fitness.api.config import RUNTIME, _read_json, _write_json

router = APIRouter(prefix="/fitness/coach/macrocycles")


def _dir(client_uid: str) -> Path:
    return RUNTIME / "users" / client_uid / "macrocycles"


def _path(client_uid: str, cycle_id: str) -> Path:
    return _dir(client_uid) / f"{cycle_id}.json"


def _completions_dir(client_uid: str, cycle_id: str) -> Path:
    return _dir(client_uid) / cycle_id / "completions"


def _load(client_uid: str, cycle_id: str) -> dict[str, Any]:
    m = _read_json(_path(client_uid, cycle_id))
    if not m:
        raise HTTPException(404, detail="Zyklus nicht gefunden")
    return m


def _save(client_uid: str, macrocycle: dict[str, Any]) -> dict[str, Any]:
    macrocycle["updatedAt"] = datetime.now().isoformat()
    _write_json(_path(client_uid, macrocycle["id"]), macrocycle)
    return macrocycle


def _completions(client_uid: str, cycle_id: str) -> list[dict[str, Any]]:
    dir_ = _completions_dir(client_uid, cycle_id)
    if not dir_.exists():
        return []
    items = [c for f in sorted(dir_.glob("*.json")) if (c := _read_json(f))]
    items.sort(key=lambda c: c.get("completedAt", ""))
    return items


@router.get("/{client_uid}")
def list_macrocycles(client_uid: str):
    dir_ = _dir(client_uid)
    if not dir_.exists():
        return {"ok": True, "macrocycles": []}
    items = []
    for f in sorted(dir_.glob("*.json")):
        m = _read_json(f)
        if m:
            items.append({k: v for k, v in m.items() if k != "routines"} | {"routineCount": len(m.get("routines") or [])})
    items.sort(key=lambda m: m.get("createdAt", ""), reverse=True)
    return {"ok": True, "macrocycles": items}


@router.get("/{client_uid}/{cycle_id}")
def get_macrocycle(client_uid: str, cycle_id: str):
    m = _load(client_uid, cycle_id)
    completions = _completions(client_uid, cycle_id)
    next_index = len(completions) % len(m["routines"]) if m["routines"] else 0

    # Nur eine Anzeige-Info, keine Sperre — der Coach/Klient entscheidet
    # trotzdem selbst, die App schlägt nur "noch nicht dran" vor.
    resting_until = None
    if completions:
        last = completions[-1]
        last_routine = next((r for r in m["routines"] if r["id"] == last["routineId"]), None)
        rest_hours = (last_routine or {}).get("restHoursAfter") or 0
        if rest_hours:
            completed_at = datetime.fromisoformat(last["completedAt"])
            ready_at = completed_at.timestamp() + rest_hours * 3600
            if ready_at > datetime.now().timestamp():
                resting_until = datetime.fromtimestamp(ready_at).isoformat()

    total_weeks = m.get("totalWeeks") or 10
    elapsed_weeks = int((datetime.now() - datetime.fromisoformat(m["createdAt"])).days // 7)
    current_week = min(elapsed_weeks + 1, total_weeks)

    return {
        "ok": True,
        "macrocycle": m,
        "completions": completions,
        "nextRoutineIndex": next_index,
        "restingUntil": resting_until,
        "currentWeek": current_week,
        "totalWeeks": total_weeks,
        "finished": elapsed_weeks >= total_weeks,
    }


@router.post("/{client_uid}")
async def create_macrocycle(client_uid: str, request: Request):
    body: dict[str, Any] = await request.json()
    name = (body.get("name") or "").strip()
    coach_uid = body.get("coachUid")
    if not name or not coach_uid:
        raise HTTPException(400, detail="name und coachUid erforderlich")

    cycle_id = f"mc_{uuid4().hex[:12]}"
    record = {
        "id": cycle_id,
        "name": name,
        "clientUid": client_uid,
        "coachUid": coach_uid,
        "createdAt": datetime.now().isoformat(),
        "updatedAt": datetime.now().isoformat(),
        # Ein Makrozyklus hat einen Rahmen (z.B. 10 Wochen) — die Rotation
        # (Push/Pull/Legs/...) läuft flexibel innerhalb davon, ohne an
        # Wochentage gebunden zu sein, aber der Zyklus selbst hat Anfang+Ende.
        "totalWeeks": int(body.get("totalWeeks") or 10),
        "routines": [],
        "status": body.get("status", "published"),
    }
    _write_json(_path(client_uid, cycle_id), record)
    logger.info(f"macrocycles: {coach_uid} → {client_uid} '{name}' angelegt")
    return {"ok": True, "macrocycle": record}


@router.delete("/{client_uid}/{cycle_id}")
def delete_macrocycle(client_uid: str, cycle_id: str):
    path = _path(client_uid, cycle_id)
    if path.exists():
        path.unlink()
    return {"ok": True}


# ── Routinen (Push/Pull/Legs/...) ───────────────────────────────────────────

@router.post("/{client_uid}/{cycle_id}/routines")
async def add_routine(client_uid: str, cycle_id: str, request: Request):
    body: dict[str, Any] = await request.json()
    label = (body.get("label") or "").strip()
    if not label:
        raise HTTPException(400, detail="label erforderlich")

    m = _load(client_uid, cycle_id)
    m["routines"].append({
        "id": f"rt_{uuid4().hex[:8]}",
        "label": label,
        "isDeload": bool(body.get("isDeload", False)),
        # Pflicht-Pause NACH dieser Routine, bevor die nächste fällig wird —
        # pro Routine frei wählbar (Push→24h, Pull→48h, Legs→72h o.ä.), kein
        # globales Fenster für den ganzen Zyklus.
        "restHoursAfter": int(body.get("restHoursAfter") or 0),
        # Plan-Ziel pro Routine: x-mal in y Tagen (rollierendes Fenster),
        # unabhängig von der Rotation-Reihenfolge — beides kann parallel
        # existieren (Rotation sagt "was ist dran", Ziel sagt "reicht das").
        "targetCount": int(body.get("targetCount") or 0),
        "targetPeriodDays": int(body.get("targetPeriodDays") or 0),
        # Verweis auf das Template (routines.json-Eintrag), aus dem diese
        # Plan-Routine erzeugt wurde — Fortschritt wird darüber gegen die
        # echten Workout-Completions gezählt (workouts.routine_id), nicht
        # gegen einen separaten /complete-Aufruf. Optional: von Hand
        # angelegte Plan-Routinen ohne Template-Bezug bleiben None.
        "sourceTemplateId": body.get("sourceTemplateId"),
        "exercises": body.get("exercises") or [],
    })
    _save(client_uid, m)
    return {"ok": True, "macrocycle": m}


@router.put("/{client_uid}/{cycle_id}/routines/{routine_id}")
async def update_routine(client_uid: str, cycle_id: str, routine_id: str, request: Request):
    body: dict[str, Any] = await request.json()
    m = _load(client_uid, cycle_id)
    routine = next((r for r in m["routines"] if r["id"] == routine_id), None)
    if not routine:
        raise HTTPException(404, detail="Routine nicht gefunden")
    if "label" in body:
        routine["label"] = body["label"]
    if "isDeload" in body:
        routine["isDeload"] = bool(body["isDeload"])
    if "restHoursAfter" in body:
        routine["restHoursAfter"] = int(body["restHoursAfter"] or 0)
    if "targetCount" in body:
        routine["targetCount"] = int(body["targetCount"] or 0)
    if "targetPeriodDays" in body:
        routine["targetPeriodDays"] = int(body["targetPeriodDays"] or 0)
    if "exercises" in body and isinstance(body["exercises"], list):
        routine["exercises"] = body["exercises"]
    _save(client_uid, m)
    return {"ok": True, "macrocycle": m}


@router.delete("/{client_uid}/{cycle_id}/routines/{routine_id}")
def delete_routine(client_uid: str, cycle_id: str, routine_id: str):
    m = _load(client_uid, cycle_id)
    m["routines"] = [r for r in m["routines"] if r["id"] != routine_id]
    _save(client_uid, m)
    return {"ok": True, "macrocycle": m}


# ── Completions (Klient hakt ab, mit tatsächlicher Leistung) ───────────────

@router.post("/{client_uid}/{cycle_id}/complete")
async def complete_routine(client_uid: str, cycle_id: str, request: Request):
    body: dict[str, Any] = await request.json()
    routine_id = body.get("routineId")
    performed = body.get("exercises") or []  # [{exercise_id, sets, reps, weight}]
    if not routine_id:
        raise HTTPException(400, detail="routineId erforderlich")

    m = _load(client_uid, cycle_id)
    if not any(r["id"] == routine_id for r in m["routines"]):
        raise HTTPException(404, detail="Routine nicht gefunden")

    record = {
        "id": f"cmp_{uuid4().hex[:10]}",
        "routineId": routine_id,
        "completedAt": datetime.now().isoformat(),
        "exercises": performed,
    }
    dir_ = _completions_dir(client_uid, cycle_id)
    dir_.mkdir(parents=True, exist_ok=True)
    _write_json(dir_ / f"{record['id']}.json", record)
    logger.info(f"macrocycles: {client_uid} completed {routine_id} in {cycle_id}")
    return {"ok": True, "completion": record}


@router.get("/{client_uid}/{cycle_id}/routines/{routine_id}/last")
def last_performance(client_uid: str, cycle_id: str, routine_id: str):
    """Letzte Completion dieser Routine — Referenz für Progression im Client-UI."""
    completions = [c for c in _completions(client_uid, cycle_id) if c.get("routineId") == routine_id]
    return {"ok": True, "last": completions[-1] if completions else None}


@router.patch("/{client_uid}/{cycle_id}")
async def publish_macrocycle(client_uid: str, cycle_id: str, request: Request):
    body = await request.json()
    m = _load(client_uid, cycle_id)
    if body.get("status") != "published":
        raise HTTPException(422, detail="unsupported_status")
    if not m.get("routines") or any(not r.get("exercises") for r in m["routines"]):
        raise HTTPException(422, detail="Jede Einheit braucht Übungen.")
    m["status"] = "published"
    m["publishedAt"] = datetime.now().isoformat()
    _save(client_uid, m)
    return {"ok": True, "macrocycle": m}
