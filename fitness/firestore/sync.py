"""pull/push: Firestore ↔ ~/.aos/users/<uid>/ (one-shot)"""

import json
import os
import tempfile
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

from ._db import get_db, ts, UID, remote_wins, same_content
from fitness.catalog.core.session_signal import exercise_has_training_signal
from fitness.catalog.core.paths import runtime_root
from fitness.runtime.session_store import validate_runtime_uid, validate_session_id
from fitness.runtime.journal_store import upsert_entry as _journal_upsert

USERS_DIR = Path.home() / ".aos" / "users"
FITNESS_DIR = Path.home() / ".aos" / "fitness"
STATE_DIR = FITNESS_DIR / "agent-state"  # state bleibt kompatibel
_WORKOUT_PULL_LOCK = threading.Lock()


def pull_workout_logs(uid: str, *, db=None) -> dict[str, int]:
    """Mirror only Coach-relevant workout metadata from Firestore into local runtime.

    The Firebase ``workouts`` collection is distinct from ``wf_workouts`` (assigned
    WorkoutForge programs). Keep its projection in ``cloud-workouts/`` so it never
    overwrites local ``workouts.json`` or the existing ``workouts/`` assignment mirror.
    Exercise subcollections and set/event payloads are not copied.
    """
    uid = validate_runtime_uid(uid)
    db = db or get_db()
    users_root = (runtime_root() / "users").resolve()
    user_root = (users_root / uid).resolve()
    if not user_root.is_relative_to(users_root):
        raise ValueError("Invalid runtime UID path")
    target = user_root / "cloud-workouts"
    target.mkdir(parents=True, exist_ok=True)
    if not target.resolve().is_relative_to(user_root):
        raise ValueError("Cloud workout mirror must remain inside the user runtime")

    collection = db.collection("fitness").document(uid).collection("workouts")
    # Materialize the entire query before touching local files. A Firestore read
    # failure therefore preserves the last successful local projection.
    snapshots = list(collection.stream())
    projected: dict[str, dict[str, Any]] = {}
    for snapshot in snapshots:
        try:
            workout_id = validate_session_id(snapshot.id)
        except ValueError:
            continue
        if not workout_id:
            continue
        data = snapshot.to_dict() or {}
        if not isinstance(data, dict):
            continue
        events = data.get("eventLog") if isinstance(data.get("eventLog"), list) else []
        completed_sets = sum(
            1 for event in events
            if isinstance(event, dict) and event.get("setId")
        )
        try:
            exercise_count = max(0, int(data.get("exerciseCount") or 0))
        except (TypeError, ValueError, OverflowError):
            exercise_count = 0
        projection = {
            "id": workout_id,
            "sourceType": "firestore-workout",
            "name": str(data.get("name") or "Trainingseinheit"),
            "started_at": ts(data.get("started_at")),
            "finished_at": ts(data.get("finished_at")),
            "sessionState": str(data.get("sessionState") or ""),
            "routine_id": data.get("routine_id"),
            "sourcePlanId": data.get("sourcePlanId"),
            "sourcePlanRoutineId": data.get("sourcePlanRoutineId"),
            "exerciseCount": exercise_count,
            "completedSetCount": completed_sets,
        }
        projected[workout_id] = projection

    with _WORKOUT_PULL_LOCK:
        for workout_id, projection in projected.items():
            destination = target / f"{workout_id}.json"
            fd, temporary = tempfile.mkstemp(prefix=".cloud-workout-", dir=target)
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as stream:
                    json.dump(projection, stream, ensure_ascii=False, indent=2, allow_nan=False)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary, destination)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)

        removed = 0
        for existing in target.glob("*.json"):
            if existing.stem in projected:
                continue
            try:
                previous = json.loads(existing.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if isinstance(previous, dict) and previous.get("sourceType") == "firestore-workout":
                existing.unlink(missing_ok=True)
                removed += 1
    return {"workout_logs": len(projected), "workout_logs_removed": removed}


def _load_known(uid: str) -> set:
    state_file = STATE_DIR / f"fsm-known-journal-{uid}.json"
    return set(json.loads(state_file.read_text())) if state_file.exists() else set()

def _save_known(uid: str, ids: set):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    state_file = STATE_DIR / f"fsm-known-journal-{uid}.json"
    state_file.write_text(json.dumps(sorted(ids), indent=2))

def _load_known_habits(uid: str) -> set:
    state_file = STATE_DIR / f"fsm-known-habit-journal-{uid}.json"
    return set(json.loads(state_file.read_text())) if state_file.exists() else set()

def _save_known_habits(uid: str, ids: set):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    state_file = STATE_DIR / f"fsm-known-habit-journal-{uid}.json"
    state_file.write_text(json.dumps(sorted(ids), indent=2))


def _cleanup_inbox_files(inbox_dir: Path, doc_id: str) -> None:
    for local in inbox_dir.glob(f"{doc_id}_*.json"):
        local.unlink(missing_ok=True)


def pull(uid: str | None = None) -> dict:
    from tqdm import tqdm
    db = get_db()
    total_pulled = 0
    total_skipped = 0
    total_journal = 0
    total_habit_journal = 0
    total_inbox = 0
    total_workout_logs = 0

    _SKIP_UIDS = {"default", "kb", "_template"}
    if uid:
        all_refs = [db.collection("fitness").document(uid)]
    else:
        all_refs = [r for r in db.collection("fitness").list_documents()
                    if r.id not in _SKIP_UIDS]
    for user_ref in tqdm(all_refs, desc="Pull users", unit="user"):
        uid = user_ref.id
        user_dir = (USERS_DIR / uid / "fitness").resolve()
        sessions_dir = user_dir / "sessions"
        journal_dir = user_dir / "journal"
        inbox_dir = user_dir / "inbox"
        workouts_dir = user_dir / "workouts"
        
        sessions_dir.mkdir(parents=True, exist_ok=True)
        journal_dir.mkdir(parents=True, exist_ok=True)
        inbox_dir.mkdir(parents=True, exist_ok=True)
        workouts_dir.mkdir(parents=True, exist_ok=True)

        workout_result = pull_workout_logs(uid, db=db)
        total_workout_logs += workout_result["workout_logs"]

        # logger.info(f"Syncing user: {uid}")

        # Fetch Habits for name resolution
        habit_names = {}
        try:
            for hdoc in db.collection("fitness").document(uid).collection("habits").stream():
                hdata = hdoc.to_dict()
                habit_names[hdoc.id] = hdata.get("name", "Unknown Habit")
        except Exception:
            pass

        # Pull Sessions
        session_docs = list(db.collection("fitness").document(uid).collection("sessions").stream())
        for doc in tqdm(session_docs, desc=f"  {uid[:8]} sessions", unit="sess", leave=False):
            doc_id, data = doc.id, doc.to_dict()
            actual_date = data.get("date") or doc_id.split("__")[0]
            local = sessions_dir / f"{doc_id}.json"
            if local.exists():
                try:
                    local_data = json.loads(local.read_text())
                    if not remote_wins(local_data, data):
                        total_skipped += 1
                        continue
                except Exception: pass

            out = {k: (ts(v) if hasattr(v, "isoformat") else v) for k, v in data.items()}
            local.write_text(json.dumps(out, indent=2, ensure_ascii=False))
            total_pulled += 1
            day = doc_id.split("__")[0]
            sid = doc_id.split("__")[1] if "__" in doc_id else None
            try:
                from catalog.api.sync_gateway import sync_session as _gw_sync
                _gw_sync(day, out, session_id=sid)
            except Exception as exc:
                pass  # SQLite-Sync optional, JSON ist SOT

            # Session-Notizen als Eintrag ins Tages-Journal (JSONL-SOT)
            notes = data.get("notes", "").strip()
            if notes:
                block = data.get("block", "Training")
                _journal_upsert(journal_dir / f"{actual_date}.md", {
                    "id": doc_id, "source": "session_note",
                    "ts": (ts(data.get("date")) or actual_date or ""),
                    "body": f"**Session: {block}**\n{notes}",
                })

        # Pull Journal
        known = _load_known(uid)
        for doc in db.collection("fitness").document(uid).collection("journal").stream():
            if doc.id in known:
                continue
            data   = doc.to_dict()
            date   = data.get("date", "")
            text   = data.get("text", "").strip()
            time   = (ts(data.get("time")) or "")[:16]
            if not date or not text:
                continue
            
            _journal_upsert(journal_dir / f"{date}.md", {
                "id": doc.id, "source": "journal",
                "ts": (ts(data.get("time")) or ""),
                "body": f"**{time}** {text}",
            })
            known.add(doc.id)
            total_journal += 1

        # Pull Habit Journal (Memoirs — auch ohne Text-Body ziehen)
        known_habits = _load_known_habits(uid)
        for doc in db.collection("fitness").document(uid).collection("habitJournals").stream():
            if doc.id in known_habits:
                continue
            data = doc.to_dict()
            date = data.get("date", "")
            text = data.get("text", "").strip()
            coach_feedback = data.get("coachFeedback", "").strip()
            hid   = data.get("habitId", "")
            hname = habit_names.get(hid, f"Habit:{hid}")
            time  = (ts(data.get("recorded_at") or data.get("updated_at")) or "")[:16]

            if not date:
                continue

            body = f"**Habit: {hname}**" + (f" _{time}_" if time else "")
            body += f"\n{text}" if text else ""
            if coach_feedback:
                body += f"\n> **Coach Feedback:** {coach_feedback}"
            _journal_upsert(journal_dir / f"{date}.md", {
                "id": doc.id, "source": "habit_journals",
                "ts": (ts(data.get("recorded_at") or data.get("updated_at")) or ""),
                "body": body,
            })
            known_habits.add(doc.id)
            total_habit_journal += 1

        # Pull Habit Records (Completions → Journal-Eintrag pro Tag)
        state_file_hr = STATE_DIR / f"fsm-known-habit-records-{uid}.json"
        known_records = set(json.loads(state_file_hr.read_text())) if state_file_hr.exists() else set()
        for doc in db.collection("fitness").document(uid).collection("habitRecords").stream():
            if doc.id in known_records:
                continue
            data  = doc.to_dict()
            date  = data.get("date", "")
            hid   = data.get("habitId", "")
            hname = habit_names.get(hid, f"Habit:{hid}")
            rec_at = (ts(data.get("recorded_at")) or "")[:16]
            completion = data.get("completion", "DONE")
            if not date:
                continue
            body = f"**{hname}** {completion}" + (f" _{rec_at}_" if rec_at else "")
            _journal_upsert(journal_dir / f"{date}.md", {
                "id": doc.id, "source": "habit_records",
                "ts": (ts(data.get("recorded_at")) or ""),
                "body": body,
            })
            known_records.add(doc.id)
            total_habit_journal += 1
        state_file_hr.parent.mkdir(parents=True, exist_ok=True)
        state_file_hr.write_text(json.dumps(sorted(known_records), indent=2))
        
        # Pull Inbox
        for doc in db.collection("fitness").document(uid).collection("inbox").stream():
            data = doc.to_dict()
            status = str((data or {}).get("status") or "").strip().lower()
            if status in {"approved", "rejected", "resolved", "ai_enriched"}:
                _cleanup_inbox_files(inbox_dir, doc.id)
                continue
            name = data.get("name", "unknown").replace(" ", "_")
            local = inbox_dir / f"{doc.id}_{name}.json"
            _cleanup_inbox_files(inbox_dir, doc.id)
            out = {k: (ts(v) if hasattr(v, "isoformat") else v) for k, v in data.items()}
            local.write_text(json.dumps(out, indent=2, ensure_ascii=False))
            total_inbox += 1

        # Pull Workouts (WorkoutForge)
        for doc in db.collection("fitness").document(uid).collection("wf_workouts").stream():
            w_data = doc.to_dict()
            w_id = doc.id
            exercises = []
            try:
                for edoc in db.collection("fitness").document(uid).collection("wf_workouts").document(w_id).collection("exercises").stream():
                    ex_data = edoc.to_dict()
                    ex_data["id"] = edoc.id
                    exercises.append(ex_data)
            except Exception:
                pass
            
            # Sort exercises by order
            exercises.sort(key=lambda x: x.get("order", 0))
            w_data["id"] = w_id
            w_data["exercises"] = exercises
            
            local = workouts_dir / f"{w_id}.json"
            out = {k: (ts(v) if hasattr(v, "isoformat") else v) for k, v in w_data.items()}
            local.write_text(json.dumps(out, indent=2, ensure_ascii=False))

        _save_known(uid, known)
        _save_known_habits(uid, known_habits)

    return {"sessions": total_pulled, "skipped": total_skipped, "journal": total_journal, "habit_journal": total_habit_journal, "inbox": total_inbox, "workout_logs": total_workout_logs}


def push(uid: str | None = None, *, force: bool = False, dry_run: bool = False) -> dict:
    db = None if dry_run and force else get_db()
    pushed = skipped = 0
    users_dir = FITNESS_DIR / "users"
    if not users_dir.exists():
        return {"sessions": 0, "sessions_skipped": 0}

    user_folders = [users_dir / uid] if uid else sorted(users_dir.iterdir())
    for user_folder in user_folders:
        if not user_folder.is_dir(): continue
        uid = user_folder.name
        sessions_dir = user_folder / "sessions"
        if not sessions_dir.exists(): continue

        # logger.info(f"Pushing sessions for user: {uid}")

        for f in sorted(sessions_dir.glob("*.json")):
            doc_id     = f.stem
            actual_date = doc_id.split("__")[0]
            local_data = json.loads(f.read_text())
            ref = None if db is None else db.collection("fitness").document(uid).collection("sessions").document(doc_id)
            remote = None if ref is None else ref.get()
            if remote and remote.exists and not force:
                remote_dict = remote.to_dict()
                if remote_wins(local_data, remote_dict):
                    skipped += 1
                    continue
                # Gleichstand: nichts neu schreiben (sonst bei jedem Lauf alle Sessions)
                if same_content({**local_data, "date": actual_date}, remote_dict):
                    skipped += 1
                    continue
            if not dry_run:
                payload = {**local_data, "date": actual_date}
                if force:
                    payload["saved_at"] = datetime.utcnow().isoformat()
                ref.set(payload)
            pushed += 1

    return {"sessions": pushed, "sessions_skipped": skipped, "dry_run": dry_run, "force": force}


def _has_training_signal(session: dict[str, Any]) -> bool:
    return any(
        isinstance(exercise, dict) and exercise_has_training_signal(exercise)
        for exercise in (session.get("exercises") or [])
    )


def _is_activity_sidecar(doc_id: str, data: dict[str, Any]) -> bool:
    return "__" in doc_id and bool(data.get("activity")) and not _has_training_signal(data)


def prune_activity_sidecars(uid: str | None = None, *, dry_run: bool = True) -> dict[str, Any]:
    """Delete remote date__id docs that are pure activity add-ons, not main sessions."""
    db = get_db()
    users_dir = FITNESS_DIR / "users"
    local_uids = [uid] if uid else []
    if not local_uids and users_dir.exists():
        local_uids = [
            p.name for p in sorted(users_dir.iterdir())
            if p.is_dir() and p.name not in ("default", "kb", "_template")
        ]
    if not local_uids:
        local_uids = [UID]

    targets: list[dict[str, str]] = []
    for user_id in local_uids:
        col = db.collection("fitness").document(user_id).collection("sessions")
        canonical_ids = {
            doc.id for doc in col.stream()
            if "__" not in doc.id
        }
        for doc in col.stream():
            data = doc.to_dict() or {}
            if not _is_activity_sidecar(doc.id, data):
                continue
            day = doc.id.split("__", 1)[0]
            if day not in canonical_ids:
                continue
            targets.append({"uid": user_id, "doc_id": doc.id, "date": day})
            if not dry_run:
                doc.reference.delete()

    return {"dry_run": dry_run, "deleted": 0 if dry_run else len(targets), "targets": targets}
