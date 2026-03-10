# vehicle.py
from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base
import enum

class VehicleStatus(str, enum.Enum):
    active = "Active"; in_service = "In Service"; retired = "Returned"

class VehicleType(str, enum.Enum):
    loaner = "Loaner"; inventory = "Inventory"; sales = "Sales"

class Vehicle(Base):
    __tablename__ = "vehicles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    loaner_number: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    vin: Mapped[str] = mapped_column(String(17), unique=True, index=True)
    year: Mapped[int | None] = mapped_column(Integer)
    make: Mapped[str | None] = mapped_column(String(50))
    model: Mapped[str | None] = mapped_column(String(50))
    plate: Mapped[str | None] = mapped_column(String(20))
    mileage: Mapped[int | None] = mapped_column(Integer)
    color: Mapped[str | None] = mapped_column(String(30))
    fuel_level: Mapped[str | None] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(20), default="Active", nullable=False)
    vehicle_type: Mapped[str] = mapped_column(String(20), default="Loaner", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    drive_folder_url: Mapped[str | None] = mapped_column(String(255))
    drive_folder_id: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    inspections: Mapped[list["Inspection"]] = relationship("Inspection", back_populates="vehicle", cascade="all, delete-orphan")
    loaners: Mapped[list["Loaner"]] = relationship("Loaner", back_populates="vehicle", cascade="all, delete-orphan")
    def __repr__(self): return f"<Vehicle vin={self.vin} loaner={self.loaner_number}>"
    @property
    def display_name(self) -> str:
        parts = [str(self.year or ""), self.make or "", self.model or ""]
        label = " ".join(p for p in parts if p).strip()
        return f"{self.loaner_number} — {label}" if self.loaner_number else label
