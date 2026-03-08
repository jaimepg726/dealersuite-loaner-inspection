"""
DealerSuite — Vehicle Model
Represents a single loaner, inventory, or sales vehicle in the fleet.
"""

from datetime import datetime, timezone
from typing import TYPE_CHECKING
from sqlalchemy import String, Integer, DateTime, Enum, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base
import enum

if TYPE_CHECKING:
    from models.inspection import Inspection


class VehicleStatus(str, enum.Enum):
    active  = "Active"
    retired = "Retired"
    service = "In Service"


class VehicleType(str, enum.Enum):
    loaner    = "Loaner"
    inventory = "Inventory"
    sales     = "Sales"


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Dealer identifiers
    loaner_number: Mapped[str | None] = mapped_column(
        String(20), nullable=True, index=True
    )
    vin: Mapped[str] = mapped_column(
        String(17), unique=True, nullable=False, index=True
    )

    # Vehicle details
    year:  Mapped[int | None]        = mapped_column(Integer, nullable=True)
    make:  Mapped[str | None]        = mapped_column(String(50), nullable=True)
    model: Mapped[str | None]        = mapped_column(String(80), nullable=True)
    plate: Mapped[str | None]        = mapped_column(String(20), nullable=True)
    mileage: Mapped[int | None]      = mapped_column(Integer, nullable=True)
    color:   Mapped[str | None]      = mapped_column(String(30), nullable=True)

    # Status / type
    status: Mapped[str] = mapped_column(
        Enum(VehicleStatus), default=VehicleStatus.active, nullable=False
    )
    vehicle_type: Mapped[str] = mapped_column(
        Enum(VehicleType), default=VehicleType.loaner, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Google Drive — pre-created folder for this vehicle
    drive_folder_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    drive_folder_id:  Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    inspections: Mapped[list["Inspection"]] = relationship(
        "Inspection", back_populates="vehicle", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Vehicle vin={self.vin} loaner={self.loaner_number} {self.year} {self.make} {self.model}>"

    @property
    def display_name(self) -> str:
        parts = [str(self.year or ""), self.make or "", self.model or ""]
        label = " ".join(p for p in parts if p).strip()
        return f"{self.loaner_number} — {label}" if self.loaner_number else label
