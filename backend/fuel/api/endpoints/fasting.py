"""Phase 4b: Fasting-Erkennung.

Dünner Endpoint-Wrapper um core/fasting.py::compute_fasting_windows() —
lädt die letzten days+1 Tage aus DailyJournal (für Vortags-Kontext beim
ersten angeforderten Tag) und ruft die reine Berechnungsfunktion auf.
Datenquelle: DailyJournal.food_logs, meal["logged_at"] (ISO-Timestamp,
ergänzt in food.py::log_food seit Phase 2d). Bestandsdaten ohne logged_at
werden beim Filtern in compute_fasting_windows() übersprungen — kein Backfill.
"""

from datetime import date as date_cls, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from fuel.core.fasting import compute_fasting_windows
from fuel.db.database import get_db
from fuel.db.models.journal import DailyJournal

router = APIRouter()


def _recent_dates(days_back: int) -> list[str]:
    today = date_cls.today()
    return [(today - timedelta(days=i)).isoformat() for i in range(days_back, -1, -1)]


@router.get("/fasting")
def get_fasting_windows(days: int = Query(14, ge=1, le=90), db: Session = Depends(get_db)):
    """GET /nutrition/fasting?days=14

    Response: {ok, windows: [...]}
    """
    # Lade days + 1 Tage (damit der erste angeforderte Tag einen Vortag zum
    # Vergleich hat), gib danach nur die letzten `days` Einträge zurück.
    all_dates = _recent_dates(days)

    day_logs = []
    for d in all_dates:
        journal = db.query(DailyJournal).filter(DailyJournal.date == d).first()
        meals = journal.food_logs if journal else []
        day_logs.append({"date": d, "meals": meals})

    windows = compute_fasting_windows(day_logs)
    windows = windows[-days:]

    return {"ok": True, "windows": windows}
