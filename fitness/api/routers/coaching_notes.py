from __future__ import annotations

from fastapi import APIRouter, HTTPException

from fitness.catalog.agent.coaching_notes import (
    find_note,
    find_notes_by_tag,
    load_all_notes,
    load_open_product_signals,
)

router = APIRouter()


@router.get("/coaching-notes")
def coaching_notes_list(tag: str | None = None):
    notes = find_notes_by_tag(tag) if tag else load_all_notes()
    return {"ok": True, "notes": notes}


@router.get("/coaching-notes/product-signals")
def coaching_notes_product_signals():
    return {"ok": True, "signals": load_open_product_signals()}


@router.get("/coaching-notes/{note_id}")
def coaching_notes_get(note_id: str):
    note = find_note(note_id)
    if not note:
        raise HTTPException(404, detail="not_found")
    return {"ok": True, "note": note}
