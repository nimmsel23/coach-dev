from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from fitness.catalog.agent.inbox_actions import _git_commit_paths
from fitness.catalog.agent.teaching import find_lesson

from .exercise_store import save_lesson_document

router = APIRouter()


@router.get("/exercise/{id}/teaching")
def exercise_teaching(id: str):
    lesson = find_lesson(id)
    if not lesson:
        raise HTTPException(404, detail="no_lesson")
    return {"ok": True, "lesson": lesson}


@router.post("/exercise/{id}/teaching")
async def exercise_teaching_save(id: str, request: Request):
    body = await request.json()
    exercise_id = body.get("exercise_id") or body.get("id") or id
    lesson_path, lesson = save_lesson_document(exercise_id, body)
    _git_commit_paths([lesson_path], f"chore(catalog): update lesson {exercise_id} via coach sheet")
    return {"ok": True, "exercise_id": exercise_id, "lesson": lesson}
