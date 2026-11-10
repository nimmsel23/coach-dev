from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from fuel.db.database import get_db
from fuel.db.models.journal import DailyJournal
from datetime import date, timedelta

router = APIRouter()

@router.get("/range")
def get_journal_range(
    start: str = Query(..., description="Start date in YYYY-MM-DD"),
    end: str = Query(..., description="End date in YYYY-MM-DD"),
    db: Session = Depends(get_db)
):
    journals = db.query(DailyJournal).filter(
        DailyJournal.date >= start,
        DailyJournal.date <= end
    ).all()
    
    # Return array of daily documents (matching Firestore concept)
    return {
        "status": "success",
        "data": [
            {
                "date": j.date,
                "food_logs": j.food_logs,
                "habits": j.habits,
                "notes": j.notes,
                "water_ml": j.water_ml,
                "micros_sum": j.micros_sum
            } for j in journals
        ]
    }
