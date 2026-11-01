"""Firestore transport for the hosted Coach inbox; Python remains the executor."""

from __future__ import annotations

import threading
from datetime import date, datetime, timezone

import httpx
from loguru import logger

from fitness.api.config import INBOX_DIR, PORT
from fitness.firestore._db import get_db


POLL_SECONDS = 5
COMMANDS = "coachCommands"
INBOX = "coachInbox"
STATE = "coachState"
ALLOWED_ACTIONS = {
    "approve", "reenrich", "delete", "link-source",
    "duplicates", "merge-duplicates",
}


def _publish_collection(db, collection_name: str, items: dict[str, dict]) -> None:
    collection = db.collection(collection_name)
    existing = {doc.id: doc.to_dict() for doc in collection.stream()}
    batch = db.batch()
    changes = 0
    for item_id, item in items.items():
        if existing.get(item_id) != item:
            batch.set(collection.document(item_id), item)
            changes += 1
    for item_id in existing.keys() - items.keys():
        batch.delete(collection.document(item_id))
        changes += 1
    if changes:
        batch.commit()


def _to_firestore(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _to_firestore(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_to_firestore(item) for item in value]
    return value


def publish_inbox(db) -> None:
    if not INBOX_DIR.exists():
        return
    from fitness.api.routers.exercises_inbox import inbox_list, inbox_merge_candidates

    items = {
        item["id"]: _to_firestore({**item, "file_id": item["id"], "cache_source": "local_prod"})
        for item in inbox_list()["items"]
    }
    _publish_collection(db, INBOX, items)
    candidates = inbox_merge_candidates()["candidates"]
    ref = db.collection(STATE).document("mergeCandidates")
    if (ref.get().to_dict() or {}).get("candidates") != candidates:
        ref.set({"candidates": candidates})


def _execute_command(command: dict, client=None) -> dict:
    """`client`: optionaler httpx-kompatibler Client (coach-sync übergibt einen Starlette-TestClient →
    Ausführung im Prozess ohne Port). Ohne Client wie bisher HTTP gegen 127.0.0.1:PORT."""
    action = command.get("action")
    item_id = command.get("item_id")
    if action not in ALLOWED_ACTIONS or not isinstance(item_id, str) or not item_id or "/" in item_id:
        raise ValueError("invalid_coach_command")
    uid = command.get("uid")
    if uid is not None and (not isinstance(uid, str) or "/" in uid):
        raise ValueError("invalid_uid")
    payload = command.get("payload") or {}
    if not isinstance(payload, dict):
        raise ValueError("invalid_payload")

    route = f"/fitness/inbox/{item_id}"
    method = "POST"
    params = None
    body = {**payload, "uid": uid, "doc_id": item_id}
    if action == "approve":
        route += "/approve"
    elif action == "reenrich":
        route += "/reenrich"
    elif action == "delete":
        method = "DELETE"
    elif action == "link-source":
        route += "/link-source"
    elif action == "duplicates":
        method = "GET"
        route += "/duplicates"
        params = {"uid": uid} if uid else None
    elif action == "merge-duplicates":
        route += "/merge-duplicates"

    if client is not None:
        response = client.request(method, route, json=body if method == "POST" else None, params=params)
    else:
        with httpx.Client(base_url=f"http://127.0.0.1:{PORT}", timeout=180) as http_client:
            response = http_client.request(method, route, json=body if method == "POST" else None, params=params)
    if response.status_code >= 400:
        raise RuntimeError(f"{response.status_code} {response.text[:300]}")
    return response.json()


def process_commands(db) -> None:
    for doc in db.collection(COMMANDS).where("status", "==", "queued").stream():
        ref = doc.reference
        command = doc.to_dict() or {}
        # Only this watcher-owned API process consumes commands. Mark first so a
        # restart never silently repeats a potentially destructive approval.
        ref.update({"status": "processing", "started_at": datetime.now(timezone.utc)})
        try:
            result = _execute_command(command)
            if command.get("action") not in {"duplicates"} and (command.get("payload") or {}).get("operation") not in {"search", "inspect"}:
                try:
                    publish_inbox(db)
                except Exception as exc:
                    logger.warning(f"Coach snapshot after {doc.id} failed: {exc}")
            ref.update({"status": "done", "result": result, "finished_at": datetime.now(timezone.utc)})
        except Exception as exc:
            logger.exception(f"Coach command {doc.id} failed: {exc}")
            ref.update({"status": "error", "error": str(exc)[:500], "finished_at": datetime.now(timezone.utc)})


def _run(stop_event: threading.Event) -> None:
    db = get_db()
    while not stop_event.is_set():
        try:
            process_commands(db)
            publish_inbox(db)
        except Exception as exc:
            logger.warning(f"Coach Firebase bridge: {exc}")
        stop_event.wait(POLL_SECONDS)


def start_coach_bridge() -> tuple[threading.Thread, threading.Event]:
    get_db()
    stop_event = threading.Event()
    thread = threading.Thread(target=_run, args=(stop_event,), name="coach-firebase-bridge", daemon=True)
    thread.start()
    return thread, stop_event
