from fuel.omega3 import normalize_omega3
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from pydantic import BaseModel
from fuel.db.database import get_db
from fuel.db.models.journal import DailyJournal
from fuel.db.models.catalog import MealCatalogItem
from fuel.core.llm import extract_macros_from_text
from fuel.core.catalog import find_meal, resolve_catalog_item, generate_meal_id
from fuel.schemas.catalog import MealCatalogUpsert, MealCatalogItemOut
from datetime import date, datetime, timezone
from uuid import uuid4

router = APIRouter()

class FoodLogRequest(BaseModel):
    text: str | None = None
    date: str | None = None
    catalog_item_id: str | None = None
    catalog_addon_ids: list[str] | None = None
    meal: dict | None = None
    save_catalog: bool = False
    delete_meal_id: str | None = None
    water_ml: float | None = None

class FoodLogPatchRequest(BaseModel):
    date: str | None = None
    meal_id: str  # Eindeutige ID des Meal-Eintrags
    meal: dict | None = None  # Teilweise Updates erlaubt
    new_date: str | None = None  # Auf ein anderes Datum verschieben

class JournalRequest(BaseModel):
    date: str | None = None
    content: str = ""

class NutritionCatalogPost(BaseModel):
    item: MealCatalogUpsert


def _adjust_micros_sum(journal: DailyJournal, before: dict, after: dict) -> None:
    # Apply a delta so aggregate-only legacy entries retain their contribution.
    totals = dict(journal.micros_sum or {})
    for key in set(before) | set(after):
        totals[key] = max(0, totals.get(key, 0) - (before.get(key) or 0) + (after.get(key) or 0))
    journal.micros_sum = totals
    flag_modified(journal, "micros_sum")


def _normalize_catalog_name(name: str | None) -> str:
    return " ".join(str(name or "").strip().lower().split())


def _clean_micros(profile: object) -> dict[str, float]:
    if not isinstance(profile, dict):
        return {}
    return normalize_omega3({
        key: value
        for key, value in profile.items()
        if isinstance(key, str) and isinstance(value, (int, float)) and not isinstance(value, bool)
    })


def _save_logged_meal_to_catalog(db: Session, meal: dict) -> None:
    """Create a catalog item only on explicit request; never rewrite an existing one."""
    meal_name = (meal.get("description") or meal.get("name") or "").strip()
    if not meal_name or meal.get("catalog_id") or meal.get("catalog_item_id"):
        return

    normalized_name = _normalize_catalog_name(meal_name)
    if any(_normalize_catalog_name(row.name) == normalized_name for row in db.query(MealCatalogItem).all()):
        return
    now = datetime.now(timezone.utc)
    db.add(MealCatalogItem(
        id=generate_meal_id(meal_name, db),
        kind="meal",
        category=meal.get("type") or "meal",
        name=meal_name,
        description=meal.get("description") or meal_name,
        notes=meal.get("notes") or "",
        kcal=meal.get("kcal", meal.get("calories", 0)) or 0,
        protein=meal.get("protein", 0) or 0,
        carbs=meal.get("carbs", 0) or 0,
        fat=meal.get("fat", 0) or 0,
        micros=_clean_micros(meal.get("micros")),
        micros_meta=meal.get("micros_meta") or {},
        components=meal.get("components") or [],
        source=meal.get("source") or "logged",
        created_at=now,
        updated_at=now,
    ))


def _retime_meal_for_date(meal: dict, target_date: str) -> dict:
    timestamp = meal.get("logged_at") or meal.get("time")
    if not timestamp:
        return meal
    try:
        parsed = datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
        target = date.fromisoformat(target_date)
        adjusted = datetime.combine(target, parsed.timetz())
    except (TypeError, ValueError):
        return meal
    value = adjusted.isoformat()
    meal["logged_at"] = value
    meal["time"] = value
    return meal


def _normalize_meal_for_client(meal: dict) -> dict:
    kcal = meal.get("kcal", meal.get("calories", 0)) or 0
    logged_at = meal.get("logged_at") or meal.get("time")
    return {
        **meal,
        "kcal": kcal,
        "calories": kcal,
        "time": meal.get("time") or logged_at,
        "logged_at": logged_at,
    }

@router.post("/log")
def log_food(request: FoodLogRequest, db: Session = Depends(get_db)):
    target_date = request.date or date.today().isoformat()
    journal = db.query(DailyJournal).filter(DailyJournal.date == target_date).first()

    micros: dict = {}

    if request.delete_meal_id:
        if not journal:
            raise HTTPException(status_code=404, detail="Meal not found")
        journal.food_logs = journal.food_logs or []
        before = len(journal.food_logs)
        remaining = [meal for meal in journal.food_logs if meal.get("id") != request.delete_meal_id]
        if len(remaining) == before:
            raise HTTPException(status_code=404, detail="Meal not found")
        removed = next(meal for meal in journal.food_logs if meal.get("id") == request.delete_meal_id)
        _adjust_micros_sum(journal, removed.get("micros") or {}, {})
        journal.food_logs = remaining
        flag_modified(journal, "food_logs")
        db.commit()
        db.refresh(journal)
        return {"ok": True, "data": {"meals": journal.food_logs, "water_ml": journal.water_ml or 0}}

    if request.water_ml is not None:
        if not journal:
            journal = DailyJournal(date=target_date, food_logs=[], habits=[], notes=[], micros_sum={})
            db.add(journal)
        journal.water_ml = int(request.water_ml)
        db.commit()
        db.refresh(journal)
        return {"ok": True, "data": {"meals": journal.food_logs, "water_ml": journal.water_ml or 0}}

    if request.catalog_item_id:
        # Stammdaten-Treffer: Makros direkt aus dem Katalog übernehmen, kein Gemini-Call.
        item = db.query(MealCatalogItem).filter(MealCatalogItem.id == request.catalog_item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Catalog item not found")
        resolved = resolve_catalog_item(item, request.catalog_addon_ids)
        micros = _clean_micros(resolved.get("micros"))
        meal_dict = {
            "id": f"meal_{uuid4().hex}",
            "original_text": resolved["description"],
            "name": resolved["description"],
            "description": resolved["description"],
            "ingredients": [],
            "calories": resolved["kcal"],
            "kcal": resolved["kcal"],
            "protein": resolved["protein"],
            "carbs": resolved["carbs"],
            "fat": resolved["fat"],
            "fiber": None,
            "sugar": None,
            "catalog_id": resolved["catalog_id"],
            "micros": micros,
            "micros_meta": resolved.get("micros_meta") or {},
            "logged_at": datetime.now(timezone.utc).isoformat(),
            "time": datetime.now(timezone.utc).isoformat(),
        }
    elif request.meal:
        meal = request.meal
        meal_dict = {
            "id": meal.get("id") or f"meal_{uuid4().hex}",
            "original_text": meal.get("description") or meal.get("name") or "",
            "name": meal.get("description") or meal.get("name") or "",
            "description": meal.get("description") or meal.get("name") or "",
            "ingredients": meal.get("ingredients") or [],
            "calories": meal.get("kcal", meal.get("calories", 0)) or 0,
            "kcal": meal.get("kcal", meal.get("calories", 0)) or 0,
            "protein": meal.get("protein", 0) or 0,
            "carbs": meal.get("carbs", 0) or 0,
            "fat": meal.get("fat", 0) or 0,
            "fiber": meal.get("fiber"),
            "sugar": meal.get("sugar"),
            "catalog_id": meal.get("catalog_id") or meal.get("catalog_item_id"),
            "notes": meal.get("notes", ""),
            "logged_at": meal.get("logged_at") or meal.get("time") or datetime.now(timezone.utc).isoformat(),
            "time": meal.get("time") or meal.get("logged_at") or datetime.now(timezone.utc).isoformat(),
        }
        # Keep the scan profile with its portion and provenance on the entry.
        # Daily totals alone cannot survive portion edits or a move to another day.
        for key in ("grams", "micros", "micros_meta", "components", "source", "source_url", "barcode"):
            if key in meal:
                meal_dict[key] = _clean_micros(meal[key]) if key == "micros" else meal[key]
        micros = meal_dict.get("micros") or {}
    else:
        if not request.text or not request.text.strip():
            raise HTTPException(status_code=400, detail="text or catalog_item_id required")

        # Fuzzy-Catalog-Lookup vor jedem Gemini-Call — spart Calls bei wiederkehrenden Eingaben.
        hit = find_meal(request.text, db)
        if hit:
            resolved = resolve_catalog_item(hit)
            micros = _clean_micros(resolved.get("micros"))
            meal_dict = {
                "id": f"meal_{uuid4().hex}",
                "original_text": request.text,
                "name": resolved["description"],
                "description": resolved["description"],
                "ingredients": [],
                "calories": resolved["kcal"],
                "kcal": resolved["kcal"],
                "protein": resolved["protein"],
                "carbs": resolved["carbs"],
                "fat": resolved["fat"],
                "fiber": None,
                "sugar": None,
                "catalog_id": resolved["catalog_id"],
                "micros": micros,
                "micros_meta": resolved.get("micros_meta") or {},
                "logged_at": datetime.now(timezone.utc).isoformat(),
                "time": datetime.now(timezone.utc).isoformat(),
            }
        else:
            try:
                meal_entry = extract_macros_from_text(request.text)
            except Exception as e:
                from fuel.core.llm import LLMUnavailableError

                if isinstance(e, LLMUnavailableError):
                    raise HTTPException(status_code=503, detail=str(e))
                raise HTTPException(status_code=502, detail=f"Gemini-Anfrage fehlgeschlagen: {e}")

            meal_dict = {
                "id": f"meal_{uuid4().hex}",
                "original_text": request.text,
                "name": meal_entry.name,
                "description": meal_entry.description,
                "ingredients": meal_entry.ingredients,
                "calories": meal_entry.macros.calories,
                "kcal": meal_entry.macros.calories,
                "protein": meal_entry.macros.protein,
                "carbs": meal_entry.macros.carbs,
                "fat": meal_entry.macros.fat,
                "fiber": meal_entry.macros.fiber,
                "sugar": meal_entry.macros.sugar,
                "logged_at": datetime.now(timezone.utc).isoformat(),
                "time": datetime.now(timezone.utc).isoformat(),
            }
            if meal_entry.micros:
                micros = _clean_micros(meal_entry.micros.model_dump())
                meal_dict["micros"] = micros

    # anfügen und flaggen
    if not journal:
        journal = DailyJournal(date=target_date, food_logs=[], habits=[], notes=[], micros_sum={})
        db.add(journal)
    journal.food_logs = journal.food_logs or []
    journal.food_logs.append(meal_dict)
    flag_modified(journal, "food_logs")
    if request.save_catalog:
        _save_logged_meal_to_catalog(db, meal_dict)

    # Update the day aggregate as an index; each meal retains its own profile.
    if not journal.micros_sum:
        journal.micros_sum = {}

    for k, v in micros.items():
        if v:
            journal.micros_sum[k] = journal.micros_sum.get(k, 0) + v
    flag_modified(journal, "micros_sum")

    db.commit()
    db.refresh(journal)

    return {"ok": True, "meal": meal_dict, "data": {"meals": journal.food_logs, "water_ml": journal.water_ml or 0}}

@router.get("/log")
def get_food_logs(date: str = Query(default_factory=lambda: date.today().isoformat()), db: Session = Depends(get_db)):
    journal = db.query(DailyJournal).filter(DailyJournal.date == date).first()

    meals = [_normalize_meal_for_client(meal) for meal in (journal.food_logs if journal else [])]
    water = journal.water_ml if journal else 0

    # The frontend expects { data: { meals: [...] } } based on `const meals = nutrition?.meals || [];`
    return {"status": "success", "data": {"meals": meals, "water_ml": water}}


@router.get("/catalog")
def list_meal_catalog(db: Session = Depends(get_db)):
    items = db.query(MealCatalogItem).order_by(MealCatalogItem.updated_at.desc(), MealCatalogItem.name.asc()).all()
    return {"ok": True, "items": [MealCatalogItemOut.model_validate(i).model_dump() for i in items]}


@router.post("/catalog")
def upsert_meal_catalog(request: NutritionCatalogPost, db: Session = Depends(get_db)):
    data = request.item
    fields = data.model_dump(exclude_unset=True)
    item_id = fields.pop("id", None) or None
    item = db.query(MealCatalogItem).filter(MealCatalogItem.id == item_id).first() if item_id else None
    if item is None and not item_id:
        normalized_name = _normalize_catalog_name(data.name)
        item = next(
            (row for row in db.query(MealCatalogItem).all()
             if _normalize_catalog_name(row.name) == normalized_name),
            None,
        )

    now = datetime.now(timezone.utc)
    if item is None:
        item = MealCatalogItem(
            id=item_id or generate_meal_id(data.name, db),
            kind="meal",
            category=None,
            name=data.name,
            description=data.description or data.name,
            kcal=0,
            protein=0,
            carbs=0,
            fat=0,
            components=[],
            addons=[],
            default_addon_ids=[],
            micros={},
            micros_meta={},
            source="manual",
            created_at=now,
            updated_at=now,
        )
        db.add(item)

    for field, value in fields.items():
        setattr(item, field, value)
    item.updated_at = now
    db.commit()
    db.refresh(item)
    return {"ok": True, "item": MealCatalogItemOut.model_validate(item).model_dump()}


@router.delete("/catalog/{item_id}")
def delete_meal_catalog(item_id: str, db: Session = Depends(get_db)):
    item = db.query(MealCatalogItem).filter(MealCatalogItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


# ============ Phase 2a: Meal-Editing (PATCH) ============

@router.patch("/log")
def patch_meal_log(request: FoodLogPatchRequest, db: Session = Depends(get_db)):
    """PATCH /nutrition/log

    Bestehenden Food-Log-Eintrag bearbeiten oder auf ein anderes Datum verschieben.
    Request: {date?, meal_id, meal?, new_date?}
    Response: {ok, meal}
    """
    target_date = request.date or date.today().isoformat()
    new_date = request.new_date or target_date

    journal = db.query(DailyJournal).filter(DailyJournal.date == target_date).first()
    if not journal:
        raise HTTPException(status_code=404, detail="Journal for date not found")

    # Meal in der bestehenden Liste finden
    meal_idx = None
    for idx, meal in enumerate(journal.food_logs):
        if meal.get("id") == request.meal_id:
            meal_idx = idx
            break

    if meal_idx is None:
        raise HTTPException(status_code=404, detail="Meal not found")

    # Update durchführen
    previous_micros = journal.food_logs[meal_idx].get("micros") or {}
    updated_meal = journal.food_logs[meal_idx].copy()
    if request.meal:
        updated_meal.update(request.meal)

    # Falls new_date != target_date: Meal auf ein anderes Datum verschieben
    if new_date != target_date:
        # Auf das neue Datum-Journal verweisen
        new_journal = db.query(DailyJournal).filter(DailyJournal.date == new_date).first()
        if not new_journal:
            new_journal = DailyJournal(date=new_date, food_logs=[], habits=[], notes=[], micros_sum={})
            db.add(new_journal)

        updated_meal = _retime_meal_for_date(updated_meal, new_date)
        _adjust_micros_sum(journal, previous_micros, {})
        _adjust_micros_sum(new_journal, {}, updated_meal.get("micros") or {})
        # Von altem Datum entfernen
        journal.food_logs.pop(meal_idx)
        flag_modified(journal, "food_logs")

        # Zum neuen Datum hinzufügen
        new_journal.food_logs = new_journal.food_logs or []
        new_journal.food_logs.append(updated_meal)
        flag_modified(new_journal, "food_logs")
    else:
        _adjust_micros_sum(journal, previous_micros, updated_meal.get("micros") or {})
        # Im gleichen Datum-Journal updaten
        journal.food_logs[meal_idx] = updated_meal
        flag_modified(journal, "food_logs")

    db.commit()
    return {"ok": True, "meal": updated_meal}


# ============ Phase 1a+1b: Freitext-Tagebuch (nutrition/journal) ============

@router.get("/journal")
def get_journal(date_str: str = Query(default_factory=lambda: date.today().isoformat()), db: Session = Depends(get_db)):
    """GET /nutrition/journal?date=YYYY-MM-DD

    Freitext-Tagebucheintrag für einen Tag auslesen.
    Response: {ok, date, content} — content ist leerer String falls kein Eintrag vorhanden.
    """
    journal = db.query(DailyJournal).filter(DailyJournal.date == date_str).first()
    content = journal.journal_text if journal and journal.journal_text else ""
    return {"ok": True, "date": date_str, "content": content}


@router.get("/notes")
def get_notes(date: str = Query(default_factory=lambda: date.today().isoformat()), db: Session = Depends(get_db)):
    return get_journal(date, db)


@router.post("/journal")
def post_journal(request: JournalRequest, db: Session = Depends(get_db)):
    """POST /nutrition/journal

    Freitext-Tagebucheintrag für einen Tag speichern.
    Request: {date?, content}
    Response: {ok, date}
    """
    target_date = request.date or date.today().isoformat()

    journal = db.query(DailyJournal).filter(DailyJournal.date == target_date).first()
    if not journal:
        journal = DailyJournal(date=target_date, food_logs=[], habits=[], notes=[])
        db.add(journal)
        db.commit()
        db.refresh(journal)

    journal.journal_text = request.content or ""
    flag_modified(journal, "journal_text")
    db.commit()

    return {"ok": True, "date": target_date}


@router.post("/notes")
def post_notes(request: JournalRequest, db: Session = Depends(get_db)):
    return post_journal(request, db)


@router.get("/journal/list")
def list_journal_entries(db: Session = Depends(get_db)):
    """GET /nutrition/journal/list

    Alle vorhandenen Tagebucheinträge auflisten (neueste zuerst).
    Response: {ok, entries: [{name, date}, ...]}
    """
    journals = db.query(DailyJournal)\
        .filter(DailyJournal.journal_text != '')\
        .order_by(DailyJournal.date.desc())\
        .all()

    entries = [{"name": f"{j.date}.md", "date": j.date} for j in journals]
    return {"ok": True, "entries": entries}
