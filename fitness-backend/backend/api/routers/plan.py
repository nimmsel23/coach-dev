from __future__ import annotations

from fastapi import APIRouter

from backend.services import plan

router = APIRouter(prefix="/plan", tags=["plan"])


@router.get("/templates")
def templates():
    return plan.list_templates()


@router.get("")
def build_plan(template: str = "", split: str = "", day: str = "", goal: str = ""):
    return plan.build(template, split, day, goal)
