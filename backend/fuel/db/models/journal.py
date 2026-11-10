from sqlalchemy import Column, String, Date, Integer, DateTime, Text, func
from sqlalchemy.types import JSON
from fuel.db.database import Base
from datetime import datetime

class DailyJournal(Base):
    __tablename__ = "daily_journals"

    date = Column(String, primary_key=True, index=True) # Format: YYYY-MM-DD

    # Store daily events as JSON arrays
    food_logs = Column(JSON, default=list, nullable=False)
    habits = Column(JSON, default=list, nullable=False)
    notes = Column(JSON, default=list, nullable=False)

    # Simple top-level fields
    water_ml = Column(Integer, default=0, nullable=False)

    # Freitext-Tagebuch pro Tag (Markdown)
    # Hinweis: DailyJournal.notes ist ein JSON-Array für strukturierte Notizen,
    # journal_text ist der Freitext-String für /nutrition/journal Endpoints
    journal_text = Column(Text, default='', nullable=True)

    # Firestore-Optimierung: Vorberechnete Nährstoff-Summen auf Dokumentebene
    micros_sum = Column(JSON, default=dict, nullable=False)


class FuelFrame(Base):
    """Frame-Snapshots für Ernährungs-Anamnese (unveränderlich nach Erstellung)."""
    __tablename__ = "fuel_frames"

    id = Column(String, primary_key=True, index=True)  # UUID oder timestamp-basiert
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    data = Column(JSON, nullable=False)  # Anamnese-Felder als JSON-Blob (Schema flexibel)
