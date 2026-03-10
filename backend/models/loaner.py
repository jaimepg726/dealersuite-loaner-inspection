from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text, Enum as SAEnum, Boolean
from utils.time import utcnow
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base
import enum

class LoanerStatus(str, enum.Enum):
    out = "Out"
    returned = "Returned"

class Loaner(Base):
    __tablename__ = "loaners"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    vehicle_id: Mapped[int] = mapped_column(Integer, ForeignKey("vehicles.id"), nullable=False, index=True)
    customer_name: Mapped[str] = mapped_column(String(100), nullable=False)
    customer_phone: Mapped[str | None] = mapped_column(String(20))
    customer_email: Mapped[str | None] = mapped_column(String(120))
    ro_number: Mapped[str | None] = mapped_column(String(30), index=True)
    advisor_name: Mapped[str | None] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(20), default="Out", nullable=False, index=True)
    mileage_out: Mapped[int | None] = mapped_column(Integer)
    mileage_in: Mapped[int | None] = mapped_column(Integer)
    fuel_out: Mapped[str | None] = mapped_column(String(10))
    fuel_in: Mapped[str | None] = mapped_column(String(10))
    checked_out_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    created_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"))
    vehicle = relationship("Vehicle", back_populates="loaners", lazy="selectin")
    created_by_user = relationship("User", lazy="selectin", foreign_keys=[created_by])
