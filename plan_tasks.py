"""Taskwarrior als Task-DB pro Klient: geplante Plan-Einheiten (Vorkommen) als Tasks.

Die neue lokale Coach-Ansicht legt Vorkommen lokaler Pläne in
~/.local/Klienten/<client-id>/tw-data/ ab. Der vorhandene Runtime-Sync behält
bis zur kontrollierten Migration seine DB unter ~/.aos/fitness/users/<uid>/taskwarrior/.
Beide Wege sind einseitig (lokal → Taskwarrior), idempotent und schreiben nicht
nach Firestore. Die Vorkommen-Logik spiegelt
src/views/Plan/lib/occurrences.js (±1-Tag-Fenster, Offenes bleibt offen, Nachholen).

  scheduled = Vortag 00:00 · due = Plantag 23:59 · erledigt = `task done` mit Abschlusszeit
  UDAs: occkey (Plan:Einheit:Datum, Schlüssel), planid, routineid, workoutid
"""
from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any

import typer
from loguru import logger

WINDOW = 1
BACKLOG_DAYS = 28
PROJECT = "fitness.plan"
WORKOUT_PROJECT = "fitness.workout"
TAGS = {"fitness", "plan"}

app = typer.Typer(help="Plan-Einheiten eines Klienten nach Taskwarrior synchronisieren.")


def _read(path: Path) -> Any:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def _local_day(value: str) -> date:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone().date()


def _is_finished(w: dict[str, Any]) -> bool:
    return bool(w.get("finished_at")) and w.get("sessionState") != "work"


def _matches(routine: dict[str, Any], w: dict[str, Any]) -> bool:
    if w.get("sourcePlanRoutineId"):
        return w["sourcePlanRoutineId"] == routine.get("id")
    return bool(routine.get("sourceTemplateId")) and w.get("routine_id") == routine["sourceTemplateId"]


def status_for(offset: int, done: bool) -> str:
    """offset = heute − Plantag."""
    if done:
        return "done"
    if offset < -WINDOW:
        return "upcoming"
    if offset == -WINDOW:
        return "scheduled"
    if offset == 0:
        return "due"
    return "overdue"


def occurrences(routines: list[dict[str, Any]], workouts: list[dict[str, Any]], today: date, since: date | None = None,
                until: date | None = None) -> list[dict[str, Any]]:
    """Vorkommen eines Zeitfensters mit Zuordnung der Abschlüsse."""
    floor = since or today - timedelta(days=BACKLOG_DAYS)
    last = until or today + timedelta(days=WINDOW)
    out: list[dict[str, Any]] = []
    for routine in routines:
        weekdays = routine.get("weekdays") or []
        if not weekdays:
            continue
        lst, d = [], floor - timedelta(days=2 * WINDOW)
        while d <= last + timedelta(days=2 * WINDOW):
            if d.weekday() in weekdays:
                lst.append({"routine": routine, "date": d, "doneAt": None, "workoutId": None})
            d += timedelta(days=1)
        finished = sorted((w for w in workouts if _is_finished(w) and _matches(routine, w)), key=lambda w: w["finished_at"])
        for w in finished:
            wd = _local_day(w["finished_at"])
            occ = next((o for o in lst if not o["doneAt"] and abs((wd - o["date"]).days) <= WINDOW), None)
            if not occ:  # Nachholen: ältestes offenes Vorkommen vor dem Fenster
                occ = next((o for o in lst if not o["doneAt"] and (wd - o["date"]).days > WINDOW), None)
            if occ:
                occ["doneAt"], occ["workoutId"] = w["finished_at"], w.get("id")
        for o in lst:
            if floor <= o["date"] <= last:
                o["offset"] = (today - o["date"]).days
                o["status"] = status_for(o["offset"], bool(o["doneAt"]))
                out.append(o)
    return sorted(out, key=lambda o: o["date"])


def _published_plans(runtime: Path, uid: str) -> list[dict[str, Any]]:
    plans = []
    for f in sorted((runtime / "users" / uid / "macrocycles").glob("*.json")):
        m = _read(f)
        if m and m.get("status") == "published" and m.get("published"):
            plans.append(m)
    return plans


def desired(runtime: Path, uid: str, today: date) -> dict[str, dict[str, Any]]:
    workouts = _read(runtime / "users" / uid / "workouts.json") or []
    want: dict[str, dict[str, Any]] = {}
    for m in _published_plans(runtime, uid):
        since = None
        if m.get("publishedAt"):
            try:
                since = _local_day(m["publishedAt"])
            except ValueError:
                since = None
        snap = m["published"]
        for o in occurrences(snap.get("routines") or [], workouts, today, since):
            r = o["routine"]
            key = f"{m['id']}:{r.get('id')}:{o['date'].isoformat()}"
            want[key] = {**o, "key": key, "planId": m["id"], "planName": snap.get("name") or m.get("name") or "Plan", "version": m.get("headVersion")}
    return want


def _taskwarrior_at(base: Path):
    from tasklib import TaskWarrior

    (base / "data").mkdir(parents=True, exist_ok=True)
    rc = base / "taskrc"
    if not rc.exists():
        rc.write_text(
            f"data.location={base / 'data'}\nconfirmation=off\nverbose=nothing\nhooks=off\n"
            + "".join(f"uda.{n}.type=string\nuda.{n}.label={n}\n" for n in ("occkey", "planid", "routineid", "workoutid"))
        )
    return TaskWarrior(data_location=str(base / "data"), create=True, taskrc_location=str(rc))


def _taskwarrior(runtime: Path, uid: str):
    # Existing Runtime sync stays in its current per-UID DB until that client's
    # legacy tasks are deliberately migrated into the shared workspace DB.
    return _taskwarrior_at(runtime / "users" / uid / "taskwarrior")


def _workspace_taskwarrior(workspace: Path):
    # New local Coach plans share the client's existing Taskwarrior database.
    return _taskwarrior_at(workspace / "tw-data")


def _at(d: date, t: time) -> datetime:
    return datetime.combine(d, t).astimezone()


def _sync_want(want: dict[str, dict[str, Any]], tw, today: date, plan_scope: str | None = None) -> dict[str, int]:
    from tasklib import Task

    existing: dict[str, Any] = {}
    for t in tw.tasks.all():
        if (t["occkey"] and t["status"] != "deleted"
                and (plan_scope is None or t["planid"] == plan_scope)):
            existing[t["occkey"]] = t
    report = {"created": 0, "updated": 0, "completed": 0, "deleted": 0}
    for key, o in want.items():
        desc = f"{o['routine'].get('label') or 'Einheit'} · {o['planName']}" + (f" (v{o['version']})" if o.get("version") else "")
        task = existing.get(key)
        if task is None:
            if o["status"] == "done" and o["date"] < today - timedelta(days=WINDOW):
                continue  # alte, bereits erledigte Vorkommen nicht nachträglich anlegen
            task = Task(tw, description=desc, project=PROJECT, tags=TAGS)
            task["occkey"], task["planid"], task["routineid"] = key, o["planId"], str(o["routine"].get("id") or "")
            task["scheduled"] = _at(o["date"] - timedelta(days=WINDOW), time.min)
            task["due"] = _at(o["date"], time(23, 59))
            task.save()
            report["created"] += 1
        elif task["description"] != desc:
            task["description"] = desc
            task.save()
            report["updated"] += 1
        if o["status"] == "done":
            workout_id = str(o.get("workoutId") or "")
            if task["status"] == "pending":
                task["workoutid"] = workout_id
                task.save()
                task.done()
                report["completed"] += 1
            elif task["status"] == "completed" and workout_id and not task["workoutid"]:
                # A coach may have checked the task manually before Fitness synced
                # its session. Attach the later evidence without reopening the task.
                task["workoutid"] = workout_id
                task.save()
                report["updated"] += 1
    for key, task in existing.items():
        if key not in want and task["status"] == "pending":
            task.delete()
            report["deleted"] += 1
    return report


def sync(uid: str, runtime: Path, now: datetime | None = None) -> dict[str, int]:
    """Gleicht die Taskwarrior-DB des Klienten mit Runtime-Vorkommen ab."""
    today = (now or datetime.now().astimezone()).astimezone().date()
    report = _sync_want(desired(runtime, uid, today), _taskwarrior(runtime, uid), today)
    logger.info("plan_tasks {} {}", uid, report)
    return report


def sync_workspace_plan(workspace: Path, plan: dict[str, Any], now: datetime | None = None,
                       workouts: list[dict[str, Any]] | None = None) -> dict[str, int]:
    """Gleicht Vorkommen eines lokalen Coach-Plans ab, ohne Firebase-I/O."""
    today = (now or datetime.now().astimezone()).astimezone().date()
    plan_id = str(plan.get("id") or "").strip()
    if not plan_id:
        raise ValueError("Der lokale Trainingsplan hat keine ID.")
    start = today
    if plan.get("createdAt"):
        try:
            start = _local_day(plan["createdAt"])
        except (TypeError, ValueError):
            pass
    released_snapshot = plan.get("published") if isinstance(plan.get("published"), dict) else plan
    try:
        weeks = int(released_snapshot.get("totalWeeks") or plan.get("totalWeeks") or 10)
    except (TypeError, ValueError):
        weeks = 10
    if not 1 <= weeks <= 104:
        raise ValueError("Die Planlänge muss zwischen 1 und 104 Wochen liegen.")
    end = start + timedelta(weeks=weeks) - timedelta(days=1)
    routines = [r for r in released_snapshot.get("routines") or [] if r.get("weekdays")]
    delivery = plan.get("delivery") if isinstance(plan.get("delivery"), dict) else {}
    remote_plan_id = delivery.get("remotePlanId")
    delivered_current = delivery.get("localVersion") == plan.get("headVersion")
    matching_workouts = [
        workout for workout in (workouts or [])
        if delivered_current and remote_plan_id and isinstance(workout, dict)
        and workout.get("sourcePlanId") == remote_plan_id
    ]
    items = occurrences(routines, matching_workouts, today, since=start, until=end)
    want: dict[str, dict[str, Any]] = {}
    for item in items:
        routine = item["routine"]
        key = f"{plan_id}:{routine.get('id')}:{item['date'].isoformat()}"
        want[key] = {
            **item,
            "key": key,
            "planId": plan_id,
            "planName": released_snapshot.get("name") or plan.get("name") or "Trainingsplan",
            "version": plan.get("headVersion"),
        }
    return _sync_want(want, _workspace_taskwarrior(workspace), today, plan_scope=plan_id)


def sync_workspace_workouts(workspace: Path, workouts: list[dict[str, Any]] | None = None) -> dict[str, int]:
    """Record each completed Fitness log unless a scheduled task already links it."""
    from tasklib import Task

    tw = _workspace_taskwarrior(workspace)
    linked = {
        str(task["workoutid"])
        for task in tw.tasks.all()
        if task["workoutid"] and task["status"] != "deleted"
    }
    report = {"created": 0, "skipped": 0}
    for workout in workouts or []:
        if not isinstance(workout, dict):
            report["skipped"] += 1
            continue
        workout_id = str(workout.get("id") or "").strip()
        finished_at = workout.get("finished_at")
        if not workout_id or not finished_at or workout.get("sessionState") == "work":
            report["skipped"] += 1
            continue
        if workout_id in linked:
            continue
        name = " ".join(str(workout.get("name") or "Trainingseinheit").split())[:180]
        task = Task(tw, description=f"Workout · {name}", project=WORKOUT_PROJECT,
                    tags={"fitness", "workout"})
        task["workoutid"] = workout_id
        if workout.get("sourcePlanId"):
            task["planid"] = str(workout["sourcePlanId"])
        if workout.get("sourcePlanRoutineId"):
            task["routineid"] = str(workout["sourcePlanRoutineId"])
        task.save()
        task.done()
        try:
            finished = datetime.fromisoformat(str(finished_at).replace("Z", "+00:00"))
            task["end"] = finished.astimezone() if finished.tzinfo else finished.astimezone()
            task.save()
        except (TypeError, ValueError, OverflowError):
            pass  # Taskwarrior's completion time is a valid fallback for malformed source time.
        linked.add(workout_id)
        report["created"] += 1
    return report


def workspace_tasks(workspace: Path) -> list[dict[str, Any]]:
    """Tasks aus dem gemeinsamen Klienten-Taskwarrior für Pläne und Workouts."""
    if not (workspace / "tw-data" / "taskrc").is_file():
        return []
    tw = _workspace_taskwarrior(workspace)
    result = []
    for project in (PROJECT, WORKOUT_PROJECT):
        for task in tw.tasks.filter(project=project):
            result.append({
                "uuid": str(task["uuid"]),
                "description": task["description"],
                "status": task["status"],
                "project": task["project"],
                "due": task["due"].isoformat() if task["due"] else None,
                "scheduled": task["scheduled"].isoformat() if task["scheduled"] else None,
                "end": task["end"].isoformat() if task["end"] else None,
                "occkey": task["occkey"],
                "planid": task["planid"],
                "workoutid": task["workoutid"],
            })
    return sorted(result, key=lambda task: (task["status"] != "pending", task["due"] or "", task["description"]))


def complete_workspace_occurrence(workspace: Path, occurrence_key: str) -> bool:
    """Markiert einen offenen Plan-Task im Klienten-Taskwarrior als erledigt."""
    if not (workspace / "tw-data" / "taskrc").is_file():
        return False
    tw = _workspace_taskwarrior(workspace)
    matches = list(tw.tasks.filter(occkey=occurrence_key))
    if not matches:
        return False
    for task in matches:
        if task["status"] == "pending":
            task.done()
    return True


def pending(uid: str, runtime: Path) -> list[dict[str, Any]]:
    tw = _taskwarrior(runtime, uid)
    return [
        {"description": t["description"], "due": t["due"].isoformat() if t["due"] else None, "scheduled": t["scheduled"].isoformat() if t["scheduled"] else None, "occkey": t["occkey"]}
        for t in tw.tasks.pending() if t["project"] == PROJECT
    ]


@app.command("sync")
def cli_sync(uid: str, runtime: Path = typer.Option(Path.home() / ".aos" / "fitness", help="Runtime-Wurzel")):
    """Vorkommen von UID als Taskwarrior-Tasks abgleichen."""
    typer.echo(json.dumps(sync(uid, runtime)))


@app.command("pending")
def cli_pending(uid: str, runtime: Path = typer.Option(Path.home() / ".aos" / "fitness", help="Runtime-Wurzel")):
    """Offene Tasks der Klienten-DB anzeigen."""
    for t in pending(uid, runtime):
        typer.echo(f"{t['due'] or '-':26} {t['description']}")


if __name__ == "__main__":
    app()
