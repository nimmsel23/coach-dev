from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from fuel.db.database import Base

class SupplementLog(Base):
    __tablename__ = "supplement_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    name = Column(String(255), nullable=False, index=True)
    dose = Column(Float, nullable=False)
    unit = Column(String(50), nullable=False)
    time_of_day = Column(String(50), nullable=True)
