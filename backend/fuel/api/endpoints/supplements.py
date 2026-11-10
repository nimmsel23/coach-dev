from fuel.omega3 import normalize_omega3
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from fuel.db.database import get_db
from fuel.db.models.journal import DailyJournal
from fuel.db.models.catalog import SupplementCatalogItem
from fuel.core.catalog import generate_supplement_id
from fuel.core.llm import estimate_supplement_from_text
from fuel.schemas.catalog import SupplementCatalogUpsert, SupplementCatalogItemOut, SupplementEstimateRequest
from datetime import date, datetime, timezone, timedelta
from pydantic import BaseModel
from uuid import uuid4
from fuel.core.dach import MICRO_KEYS

router = APIRouter()


def _adjust_micros_sum(journal: DailyJournal, before: dict, after: dict) -> None:
    totals = dict(journal.micros_sum or {})
    for key in set(before) | set(after):
        totals[key] = max(0, (totals.get(key) or 0) - (before.get(key) or 0) + (after.get(key) or 0))
    journal.micros_sum = totals
    flag_modified(journal, "micros_sum")


def _catalog_item_for_intake(db: Session, intake: dict) -> SupplementCatalogItem | None:
    item_id = intake.get("supplement_id")
    if item_id:
        item = db.query(SupplementCatalogItem).filter(SupplementCatalogItem.id == item_id).first()
        if item:
            return item
    name = intake.get("name")
    if name:
        return db.query(SupplementCatalogItem).filter(SupplementCatalogItem.name == name).first()
    return None


def _micros_for_intake(intake: dict, item: SupplementCatalogItem | None) -> dict[str, float]:
    if item is None or not item.micros:
        return {}
    default_dose = item.default_dose or 0
    dose = intake.get("dose")
    dose = default_dose if dose is None else dose
    try:
        dose_value = float(dose if dose is not None else default_dose)
        default_value = float(default_dose)
    except (TypeError, ValueError):
        return {}
    if not default_value or not dose_value:
        return {}
    scale = dose_value / default_value
    scaled = {}
    for key, value in normalize_omega3(item.micros).items():
        if key not in MICRO_KEYS or value is None:
            continue
        try:
            amount = float(value) * scale
        except (TypeError, ValueError):
            continue
        if amount >= 0:
            scaled[key] = round(amount, 3)
    return scaled


class SupplementLogRequest(BaseModel):
    date: str | None = None
    intake: dict | None = None
    delete_id: str | None = None
    supplement_id: str | None = None
    name: str | None = None
    dose: float | None = None
    unit: str | None = None
    time_of_day: str | None = None
    notes: str | None = None


class SupplementLogPatchRequest(BaseModel):
    date: str | None = None
    intake_id: str  # ID des Habit-Eintrags
    updates: dict  # Teilweise Updates: {name?, dose?, unit?, time_of_day?, notes?}


@router.post("/log")
def log_supplement(request: SupplementLogRequest, db: Session = Depends(get_db)):
    target_date = request.date or date.today().isoformat()
    intake_input = request.intake or {
        "supplement_id": request.supplement_id,
        "name": request.name,
        "dose": request.dose,
        "unit": request.unit,
        "time_of_day": request.time_of_day,
        "notes": request.notes,
    }

    if request.delete_id:
        journal = db.query(DailyJournal).filter(DailyJournal.date == target_date).first()
        if journal:
            before = len(journal.habits)
            removed = next((h for h in journal.habits if h.get("id") == request.delete_id), None)
            journal.habits = [h for h in journal.habits if h.get("id") != request.delete_id]
            if len(journal.habits) != before:
                flag_modified(journal, "habits")
                _adjust_micros_sum(journal, (removed or {}).get("micros") or {}, {})
                db.commit()
                db.refresh(journal)
                intakes = [h for h in journal.habits if h.get("type") == "supplement"]
                return {"ok": True, "data": {"date": target_date, "intakes": intakes}}

        journals = db.query(DailyJournal).all()
        for journal in journals:
            before = len(journal.habits)
            removed = next((h for h in journal.habits if h.get("id") == request.delete_id), None)
            journal.habits = [h for h in journal.habits if h.get("id") != request.delete_id]
            if len(journal.habits) != before:
                flag_modified(journal, "habits")
                _adjust_micros_sum(journal, (removed or {}).get("micros") or {}, {})
                db.commit()
                db.refresh(journal)
                intakes = [h for h in journal.habits if h.get("type") == "supplement"]
                return {"ok": True, "data": {"date": journal.date, "intakes": intakes}}
        raise HTTPException(status_code=404, detail="Intake not found")

    if not intake_input.get("supplement_id") and not intake_input.get("name"):
        raise HTTPException(status_code=400, detail="intake missing")

    journal = db.query(DailyJournal).filter(DailyJournal.date == target_date).first()

    if not journal:
        journal = DailyJournal(date=target_date, food_logs=[], habits=[], notes=[])
        db.add(journal)
        db.commit()
        db.refresh(journal)

    catalog_item = _catalog_item_for_intake(db, intake_input)

    habit_dict = {
        "id": f"supp_{uuid4().hex}",
        "type": "supplement",
        "supplement_id": intake_input.get("supplement_id") or (catalog_item.id if catalog_item else None),
        "name": intake_input.get("name") or (catalog_item.name if catalog_item else None),
        "dose": intake_input.get("dose") if intake_input.get("dose") is not None else (catalog_item.default_dose if catalog_item else 0),
        "unit": intake_input.get("unit") or (catalog_item.unit if catalog_item else "mg"),
        "time_of_day": intake_input.get("time_of_day") or "any",
        "notes": intake_input.get("notes") or "",
    }
    habit_dict["micros"] = _micros_for_intake(habit_dict, catalog_item)
    journal.habits.append(habit_dict)
    flag_modified(journal, "habits")

    _adjust_micros_sum(journal, {}, habit_dict["micros"])

    db.commit()
    db.refresh(journal)

    intakes = [h for h in journal.habits if h.get("type") == "supplement"]
    return {"ok": True, "supplement": habit_dict, "data": {"date": target_date, "intakes": intakes}}


@router.get("/log")
def get_supplement_logs(date: str = Query(default_factory=lambda: date.today().isoformat()), db: Session = Depends(get_db)):
    journal = db.query(DailyJournal).filter(DailyJournal.date == date).first()

    habits = journal.habits if journal else []
    intakes = [h for h in habits if h.get("type") == "supplement"]

    return {"ok": True, "data": {"date": date, "intakes": intakes}}


@router.delete("/log/{delete_id}")
def delete_supplement_log(delete_id: str, db: Session = Depends(get_db)):
    # Frontend schickt kein Datum mit (deleteJson(`/supplements/log/${delete_id}`)) —
    # ueber alle Journale suchen, ids sind Millisekunden-Timestamps und damit
    # praktisch eindeutig; Datenmenge pro Nutzer ist klein genug fuer Full-Scan.
    journals = db.query(DailyJournal).all()
    for journal in journals:
        before = len(journal.habits)
        remaining = [h for h in journal.habits if h.get("id") != delete_id]
        if len(remaining) != before:
            removed = next(h for h in journal.habits if h.get("id") == delete_id)
            journal.habits = remaining
            flag_modified(journal, "habits")
            _adjust_micros_sum(journal, removed.get("micros") or {}, {})
            db.commit()
            return {"ok": True}
    raise HTTPException(status_code=404, detail="Intake not found")


# ============ Phase 2b: Supplement-Editing (PATCH) ============

@router.patch("/log")
def patch_supplement_log(request: SupplementLogPatchRequest, db: Session = Depends(get_db)):
    """PATCH /supplements/log

    Bestehenden Supplement-Log-Eintrag bearbeiten.
    Request: {date?, intake_id, updates: {name?, dose?, ...}}
    Response: {ok, data: {...updated journal}}
    """
    target_date = request.date or date.today().isoformat()

    journal = db.query(DailyJournal).filter(DailyJournal.date == target_date).first()
    if not journal:
        raise HTTPException(status_code=404, detail="Journal for date not found")

    # Habit in der bestehenden Liste finden
    habit_idx = None
    for idx, habit in enumerate(journal.habits):
        if habit.get("id") == request.intake_id and habit.get("type") == "supplement":
            habit_idx = idx
            break

    if habit_idx is None:
        raise HTTPException(status_code=404, detail="Intake not found")

    # Update durchführen
    previous_habit = journal.habits[habit_idx]
    updated_habit = previous_habit.copy()
    updated_habit.update(request.updates)
    catalog_item = _catalog_item_for_intake(db, updated_habit)
    if catalog_item:
        updated_habit["supplement_id"] = catalog_item.id
        if "name" not in request.updates:
            updated_habit["name"] = catalog_item.name
        if "unit" not in request.updates:
            updated_habit["unit"] = catalog_item.unit
        updated_habit["micros"] = _micros_for_intake(updated_habit, catalog_item)
    else:
        updated_habit["micros"] = previous_habit.get("micros") or {}
    _adjust_micros_sum(journal, previous_habit.get("micros") or {}, updated_habit["micros"])
    journal.habits[habit_idx] = updated_habit
    flag_modified(journal, "habits")

    db.commit()
    db.refresh(journal)

    intakes = [h for h in journal.habits if h.get("type") == "supplement"]
    return {"ok": True, "data": {"date": target_date, "intakes": intakes}}


@router.get("/catalog")
def list_supplement_catalog(db: Session = Depends(get_db)):
    items = db.query(SupplementCatalogItem).order_by(SupplementCatalogItem.name).all()
    return {"ok": True, "items": [SupplementCatalogItemOut.model_validate(i).model_dump() for i in items]}


@router.post("/catalog")
def upsert_supplement_catalog(request: SupplementCatalogUpsert, db: Session = Depends(get_db)):
    fields = request.model_dump(exclude_unset=True)
    item_id = fields.pop("id", None) or None
    item = db.query(SupplementCatalogItem).filter(SupplementCatalogItem.id == item_id).first() if item_id else None
    if item is None and not item_id:
        normalized_name = " ".join(request.name.strip().lower().split())
        item = next(
            (row for row in db.query(SupplementCatalogItem).all()
             if " ".join((row.name or "").strip().lower().split()) == normalized_name),
            None,
        )

    now = datetime.now(timezone.utc)
    if item is None:
        item = SupplementCatalogItem(
            id=item_id or generate_supplement_id(request.name, db),
            name=request.name,
            product=request.product,
            unit=request.unit,
            default_dose=request.default_dose,
            default_time_of_day=request.default_time_of_day,
            micros=request.micros,
            notes=request.notes,
            created_at=now,
            updated_at=now,
        )
        db.add(item)
    else:
        for field, value in fields.items():
            setattr(item, field, value)
        item.updated_at = now

    db.commit()
    db.refresh(item)
    return {"ok": True, "item": SupplementCatalogItemOut.model_validate(item).model_dump()}


# ============ Phase 2c: Delete Supplement Catalog ============

@router.delete("/catalog/{item_id}")
def delete_supplement_catalog(item_id: str, db: Session = Depends(get_db)):
    """DELETE /supplements/catalog/{id}

    Supplement aus dem Katalog löschen.
    """
    item = db.query(SupplementCatalogItem).filter(SupplementCatalogItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.post("/catalog/estimate")
def estimate_supplement(request: SupplementEstimateRequest, db: Session = Depends(get_db)):
    if not request.description.strip():
        raise HTTPException(status_code=400, detail="description fehlt")
    try:
        estimate = estimate_supplement_from_text(request.description)
    except Exception as e:
        from fuel.core.llm import LLMUnavailableError

        if isinstance(e, LLMUnavailableError):
            raise HTTPException(status_code=503, detail=str(e))
        raise HTTPException(status_code=502, detail=f"Gemini-Anfrage fehlgeschlagen: {e}")

    item = estimate.model_dump()
    item["id"] = generate_supplement_id(estimate.name, db)
    return {"ok": True, "item": item}


# ============ Phase 1c: Supplement-Stats & Streaks ============

@router.get("/stats")
def get_supplement_stats(
    days: int = Query(30, ge=1, le=365),
    anchor: str = Query(default_factory=lambda: date.today().isoformat()),
    db: Session = Depends(get_db)
):
    """GET /supplements/stats?days=30&anchor=YYYY-MM-DD

    Supplement-Konsumstatistiken über einen Zeitraum: wie viele Tage genommen,
    aktuelle Streak (rückwärts vom anchor).

    `days_taken` zählt pro Supplement und Kalendertag höchstens einmal.
    Ein Intake ohne Katalog-ID wird über den normalisierten Namen gruppiert.
    Streaks zählen rückwärts vom anchor und brechen heute nicht, wenn noch kein
    Intake geloggt wurde.

    Response: {ok, anchor, days, stats: [{supplement: {...}, days_taken, current_streak}, ...]}
    """
    today = date.today().isoformat()
    anchor_date = datetime.fromisoformat(anchor).date() if anchor else datetime.fromisoformat(today).date()
    start_date = anchor_date - timedelta(days=days - 1)

    journals = (
        db.query(DailyJournal)
        .filter(DailyJournal.date >= start_date.isoformat(), DailyJournal.date <= anchor_date.isoformat())
        .all()
    )
    catalog_by_id = {item.id: item for item in db.query(SupplementCatalogItem).all()}
    date_keys: dict[str, set[str]] = {}
    stats: dict[str, dict] = {}

    def stats_key(habit: dict) -> str:
        supplement_id = habit.get("supplement_id")
        if supplement_id:
            return f"id:{supplement_id}"
        normalized_name = " ".join(str(habit.get("name") or "Unknown").strip().lower().split())
        return f"name:{normalized_name}"

    for journal in journals:
        keys_for_day = date_keys.setdefault(journal.date, set())
        for habit in journal.habits or []:
            if habit.get("type") != "supplement":
                continue
            key = stats_key(habit)
            keys_for_day.add(key)
            if key in stats:
                continue
            supp_id = habit.get("supplement_id")
            cat_item = catalog_by_id.get(supp_id)
            stats[key] = {
                "supplement": {
                    "id": supp_id,
                    "name": habit.get("name") or (cat_item.name if cat_item else "Unknown"),
                    **({"product": cat_item.product} if cat_item and cat_item.product else {}),
                },
                "days_taken": 0,
                "current_streak": 0,
            }

    for key, entry in stats.items():
        entry["days_taken"] = sum(key in keys for keys in date_keys.values())
        streak = 0
        for i in range(days):
            day_str = (anchor_date - timedelta(days=i)).isoformat()
            if key in date_keys.get(day_str, set()):
                streak += 1
            elif day_str == today:
                continue
            else:
                break
        entry["current_streak"] = streak

    return {
        "ok": True,
        "anchor": anchor_date.isoformat(),
        "days": days,
        "stats": list(stats.values()),
    }
