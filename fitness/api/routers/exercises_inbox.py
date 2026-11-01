from __future__ import annotations

from datetime import datetime
import uuid

import yaml
from fastapi import APIRouter, HTTPException, Request

from fitness.api.config import INBOX_DIR

router = APIRouter()


def _source_entry_by_id(source: str, source_id: str):
    from fitness.catalog.core.source_merge import _entries_from_file

    if source == "wger":
        for entry in _entries_from_file("unreviewed_wger.yml"):
            if str(entry.get("wger_id") or entry.get("exercise_id") or "") == str(source_id):
                return entry
    elif source == "yuhonas":
        wanted = str(source_id or "").casefold()
        for entry in _entries_from_file("unreviewed_yuhonas.yml"):
            candidates = [
                entry.get("yuhonas_id"),
                entry.get("exercise_id"),
                entry.get("id"),
                entry.get("display_name"),
            ]
            if any(str(value or "").casefold() == wanted for value in candidates):
                return entry
    return None


def _draft_path_for(id: str, data: dict | None = None):
    candidates = [id]
    if isinstance(data, dict):
        candidates.extend([
            data.get("exercise_id"),
            data.get("id"),
        ])
    for candidate in candidates:
        text = str(candidate or "").strip()
        if not text or "/" in text or "\\" in text or text in {".", ".."}:
            continue
        stem = text if text.startswith("inbox_") else f"inbox_{text}"
        path = INBOX_DIR / f"{stem}.yml"
        if path.exists():
            return path
    return None


def _link_source(ex: dict, source: str, entry: dict | None) -> dict:
    from fitness.catalog.core.source_selection import apply_source_selection
    selection = dict(ex.get("source_selection") or {})
    selection[source] = entry.get(f"{source}_id") if entry else None
    linked = apply_source_selection(ex, selection)
    linked["source_review_required"] = True
    if entry:
        linked["origin"][source] = entry
    if entry and source == "wger" and entry.get("wger_muscle_ids"):
        linked["wger_muscle_ids"] = entry["wger_muscle_ids"]
    return linked


def _publish_source_edit(exercise: dict) -> None:
    from fitness.firestore._db import get_db
    exercise_id = exercise.get("exercise_id") or exercise.get("id")
    get_db().collection("fitness").document("kb").collection("exercises").document(exercise_id).set({
        **exercise, "source": "approved",
    })


def _write_back_to_firestore(uid: str | None, doc_id: str | None, enriched_data: dict, status: str = "source_linked") -> None:
    if not uid or not doc_id:
        return
    try:
        from fitness.firestore.kb import get_db

        db = get_db()
        ref = db.collection("fitness").document(uid).collection("inbox").document(doc_id)
        if not ref.get().exists:
            return
        ref.update({
            "status": status,
            "enriched": enriched_data,
        })
    except Exception:
        pass


def _write_approved_to_firestore(uid: str | None, doc_id: str | None, exercise_id: str, exercise: dict) -> None:
    if not uid or not doc_id:
        return
    try:
        from google.cloud.firestore_v1 import SERVER_TIMESTAMP
        from fitness.firestore.kb import get_db

        db = get_db()
        batch = db.batch()
        inbox_ref = db.collection("fitness").document(uid).collection("inbox").document(doc_id)
        kb_ref = db.collection("fitness").document("kb").collection("exercises").document(exercise_id)
        batch.set(kb_ref, {
            **exercise,
            "source": "approved",
            "approved_at": SERVER_TIMESTAMP,
        })
        batch.update(inbox_ref, {
            "status": "approved",
            "approved_at": SERVER_TIMESTAMP,
            "enriched": exercise,
        })
        batch.commit()
    except Exception:
        pass


@router.get("/fitness/inbox")
def inbox_list():
    if not INBOX_DIR.exists():
        return {"ok": True, "items": []}
    items = []
    for f in sorted(INBOX_DIR.glob("inbox_*.yml")):
        try:
            data = yaml.safe_load(f.read_text()) or {}
            items.append({"id": f.stem, "file": f.name, **data})
        except Exception as exc:
            from fitness.api.config import logger
            logger.warning(f"inbox_list {f.name}: {exc}")
    return {"ok": True, "items": items}


@router.get("/fitness/inbox/merge-candidates")
def inbox_merge_candidates():
    from fitness.catalog.core.merge_candidates import list_inbox_merge_candidates
    return {"ok": True, "candidates": list_inbox_merge_candidates()}


@router.post("/fitness/inbox/{id}/link-source")
async def inbox_link_source(id: str, request: Request):
    from fitness.catalog.agent.inbox_actions import _git_commit_paths, _rebuild_runtime_catalog
    from fitness.catalog.core.source_merge import search_source_entries
    from fitness.catalog.core.paths import DATA_DIR

    body = await request.json()
    operation = body.get("operation", "set")
    source = str(body.get("source") or "").strip()
    target = body.get("target", "inbox")
    if not id or "/" in id or "\\" in id or id in {".", ".."}:
        raise HTTPException(400, detail="invalid_exercise_id")
    if operation == "search":
        if source not in {"wger", "yuhonas"}:
            raise HTTPException(400, detail="invalid_source")
        return {"ok": True, "results": search_source_entries(source, str(body.get("query") or "")[:200])}
    if operation not in {"set", "inspect"} or target not in {"inbox", "approved"}:
        raise HTTPException(400, detail="invalid_source_operation")
    current_data = body.get("current_data") if isinstance(body.get("current_data"), dict) else {}
    draft_path = DATA_DIR / "exercises" / f"{id}.yml" if target == "approved" else _draft_path_for(id, current_data)
    if not draft_path or not draft_path.exists():
        raise HTTPException(404, detail="exercise_file_not_found")
    doc = yaml.safe_load(draft_path.read_text()) or {}
    exercises = doc.get("exercises") if isinstance(doc, dict) else None
    ex = exercises[0] if isinstance(exercises, list) and exercises else doc
    if not isinstance(ex, dict):
        raise HTTPException(400, detail="invalid_inbox_entry")
    if target == "approved" and (len(exercises or []) != 1 or str(ex.get("exercise_id") or ex.get("id")) != id):
        raise HTTPException(400, detail="ambiguous_catalog_file")
    if operation == "inspect":
        return {"ok": True, "exercise": ex}
    if source not in {"wger", "yuhonas"}:
        raise HTTPException(400, detail="invalid_source")
    if "source_id" not in body:
        raise HTTPException(400, detail="missing_source_id")
    source_id = body["source_id"]
    entry = _source_entry_by_id(source, str(source_id)) if source_id is not None else None
    if source_id is not None and not entry:
        raise HTTPException(404, detail="source_not_found")
    linked = _link_source(ex, source, entry)
    doc["exercises"] = [linked]
    draft_path.with_suffix(".yml.bak").write_text(draft_path.read_text())
    draft_path.write_text(yaml.safe_dump(doc, allow_unicode=True, sort_keys=False))
    _git_commit_paths([draft_path], f"fix(catalog): correct {source} source for {id}")
    if target == "approved":
        _publish_source_edit(linked)
        _rebuild_runtime_catalog()
    else:
        _write_back_to_firestore(body.get("uid"), body.get("doc_id") or id, linked)
    return {"ok": True, "id": id, "source": source, "source_id": source_id,
            "exercise": linked, "draft_path": str(draft_path)}


@router.post("/fitness/inbox/queue")
async def inbox_queue(request: Request):
    body = await request.json()
    from fitness.catalog.core.exercise_schema import apply_exercise_schema
    from fitness.catalog.core.inbox_pipeline import build_inbox_draft_seed

    display_name = body.get("display_name") or body.get("name") or ""
    exercise_id = body.get("exercise_id") or body.get("id")
    seed = build_inbox_draft_seed(display_name, exercise_id, body, restart=False)
    seed = apply_exercise_schema(seed, review_status="draft", ai_reviewed=False)

    INBOX_DIR.mkdir(parents=True, exist_ok=True)
    item_id = f"inbox_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    f = INBOX_DIR / f"{item_id}.yml"
    f.write_text(yaml.dump({
        "name": item_id,
        "description": f"Inbox queued for: {seed.get('display_name') or display_name or item_id}",
        "queued_at": datetime.utcnow().isoformat(),
        "exercises": [seed],
    }, allow_unicode=True, sort_keys=False))
    from fitness.catalog.agent.inbox_actions import commit_inbox_draft
    commit_inbox_draft(f)
    return {"ok": True, "id": item_id}


@router.post("/fitness/inbox/{id}/approve")
async def inbox_approve(id: str, request: Request):
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    current_data = body.get("current_data") if isinstance(body.get("current_data"), dict) else {}

    f = _draft_path_for(id, current_data)
    if f is None and current_data:
        INBOX_DIR.mkdir(parents=True, exist_ok=True)
        f = INBOX_DIR / f"{id if id.startswith('inbox_') else f'inbox_{id}'}.yml"
        f.write_text(yaml.dump({
            "name": f.stem,
            "description": f"Firestore inbox approve for: {current_data.get('display_name') or current_data.get('name') or id}",
            "queued_at": datetime.utcnow().isoformat(),
            "exercises": [current_data],
        }, allow_unicode=True, sort_keys=False))
    if f is None or not f.exists():
        raise HTTPException(404, detail="not_found")
    data = yaml.safe_load(f.read_text()) or {}
    exercises = data.get("exercises") if isinstance(data, dict) else None
    ex = exercises[0] if isinstance(exercises, list) and exercises else data
    if not isinstance(ex, dict):
        raise HTTPException(400, detail="invalid_inbox_entry")
    from fitness.catalog.agent.inbox_actions import approve_inbox_entry
    approved_id = approve_inbox_entry(f, ex)
    _write_approved_to_firestore(body.get("uid") or body.get("userId"), body.get("doc_id") or id, approved_id, ex)
    return {"ok": True, "id": id, "exercise_id": approved_id}


@router.get("/fitness/inbox/{id}/duplicates")
def inbox_duplicates(id: str, uid: str | None = None):
    from fitness.catalog.agent.inbox_dedup import find_merge_plan_for_doc, describe_merge_plan

    plan = find_merge_plan_for_doc(id, uid=uid)
    if not plan:
        return {"ok": True, "has_duplicates": False, "plan": None}
    return {"ok": True, "has_duplicates": True, "plan": describe_merge_plan(plan)}


@router.post("/fitness/inbox/{id}/merge-duplicates")
async def inbox_merge_duplicates(id: str, request: Request):
    from fitness.catalog.agent.inbox_dedup import find_merge_plan_for_doc, describe_merge_plan, apply_merge

    body = await request.json()
    uid = body.get("uid")
    plan = find_merge_plan_for_doc(id, uid=uid)
    if not plan:
        raise HTTPException(404, detail="no_duplicate_group")
    apply_merge(plan)
    return {"ok": True, "merged": True, "plan": describe_merge_plan(plan)}


@router.delete("/fitness/inbox/{id}")
def inbox_delete(id: str):
    f = INBOX_DIR / f"{id}.yml"
    if f.exists():
        data = yaml.safe_load(f.read_text()) or {}
        exercises = data.get("exercises") if isinstance(data, dict) else None
        ex = exercises[0] if isinstance(exercises, list) and exercises else data
        from fitness.catalog.agent.inbox_actions import delete_inbox_entry
        delete_inbox_entry(f, ex if isinstance(ex, dict) else None)
    return {"ok": True}


@router.post("/fitness/inbox/{id}/reenrich")
async def inbox_reenrich(id: str, request: Request):
    from fitness.catalog.agent.gemini import load_gemini_key
    from fitness.catalog.api.watcher import process_inbox_file_virtual, _write_back_to_firestore_inbox
    from fitness.catalog.core.resolver import resolve_query

    body = await request.json()
    display_name = body.get("display_name") or body.get("name") or id
    exercise_id = body.get("exercise_id") or body.get("id")
    uid = body.get("uid")
    doc_id = body.get("doc_id")
    feedback = body.get("feedback")
    current_data = body.get("current_data")

    if not exercise_id:
        resolution = resolve_query(display_name)
        exercise_id = resolution.canonical_id if resolution.matched else display_name

    # Re-enrich the selected local entry, preserving its identity in coachInbox.
    if not id or "/" in id or "\\" in id or id in {".", ".."}:
        raise HTTPException(400, detail="invalid_inbox_id")
    target_file = INBOX_DIR / f"{id}.yml"
    api_key = load_gemini_key()
    draft_path = process_inbox_file_virtual(
        exercise_id,
        display_name,
        api_key,
        force=True,
        feedback=feedback,
        current_data=current_data if isinstance(current_data, dict) else None,
        restart_pipeline=True,
        target_file=target_file,
    )

    if draft_path is None or not draft_path.exists():
        raise HTTPException(502, detail="gemini_enrichment_failed")

    enriched_doc = yaml.safe_load(draft_path.read_text()) or {}
    enriched_data = (enriched_doc.get("exercises") or [{}])[0]

    if uid and doc_id:
        _write_back_to_firestore_inbox(uid, doc_id, enriched_data)

    return {
        "ok": True,
        "id": id,
        "exercise_id": exercise_id,
        "enriched": enriched_data,
        "draft_path": str(draft_path),
    }
