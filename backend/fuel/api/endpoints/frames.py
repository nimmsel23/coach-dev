"""Phase 4a: Frame-Snapshots (Ernährungs-Anamnese).

Konzept-Referenz: ~/dev/fuel-dev/src/server/routes/nutrition/frames.mjs — dort
laufen Frame-Snapshots über Firestore (Cloud-Channel-only). Diese
Python-Implementierung portiert NICHT die Firestore-Logik, sondern das
Konzept: unveränderliche Snapshots, die per POST angelegt und per GET
paginiert (neueste zuerst) gelesen werden — hier persistiert in einer
eigenen Postgres/SQLite-Tabelle (FuelFrame, siehe
backend/db/models/journal.py) statt in Firestore.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from fuel.db.database import get_db
from fuel.db.models.journal import FuelFrame

router = APIRouter()


class FrameRequest(BaseModel):
    frame: dict


@router.post("/frame")
def post_frame(request: FrameRequest, db: Session = Depends(get_db)):
    """POST /nutrition/frame

    Legt einen neuen, unveränderlichen Frame-Snapshot an (kein Update, nur Insert).
    Request: {frame: {...}}
    Response: {ok, id}
    """
    if not request.frame or not isinstance(request.frame, dict):
        raise HTTPException(status_code=400, detail="frame required")

    frame_id = str(uuid.uuid4())
    frame = FuelFrame(
        id=frame_id,
        created_at=datetime.now(timezone.utc),
        data=request.frame,
    )
    db.add(frame)
    db.commit()

    return {"ok": True, "id": frame_id}


@router.get("/frames")
def get_frames(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    """GET /nutrition/frames?limit=20

    Letzte N Frame-Snapshots, neueste zuerst.
    Response: {ok, frames: [{id, created_at, ...data}, ...]}
    """
    frames = (
        db.query(FuelFrame)
        .order_by(FuelFrame.created_at.desc())
        .limit(limit)
        .all()
    )

    result = [
        {"id": f.id, "created_at": f.created_at.isoformat(), **f.data}
        for f in frames
    ]

    return {"ok": True, "frames": result}
