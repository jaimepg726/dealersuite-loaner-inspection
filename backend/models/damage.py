"""
DealerSuite — Damage Model
Individual damage items logged against an inspection.
Managers can attach a repair order (RO) number once the item goes to shop.
"""

from datetime import datetime, timezone
from typing import TYPE_CHECKING
from sqlalchemy import String, Integer, DateTime, Enum, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base
import enum

if TYPE_CHECKING:
    from models.inspection import Inspection


class DamageStatus(str, enum.Enum):
    open        = "Open"           # logged, no RO yet
    ro_assigned = "RO Assigned"    # manager attached an RO number
    in_repair   = "In Repair"      # actively being worked on
    repaired    = "Repaired"       # complete
    waived      = "Waived"         # customer declined or pre-existing


class DamageLocation(str, enum.Enum):
    front        = "Front"
    rear         = "Rear"
    driver_front = "Driver Front"
    driver_rear  = "Driver Rear"
    pass_front   = "Passenger Front"
    pass_rear    = "Passenger Rear"
    roof         = "Roof"
    hood         = "Hood"
    trunk        = "Trunk"
    interior     = "Interior"
    underbody    = "Underbody"
    windshield   = "Windshield"
    other        = "Other"


class Damage(Base):
    __tablename__ = "damages"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Foreign key
    inspection_id: Mapped[int] = mapped_column(
        ForeignKey("inspections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Damage details
    location: Mapped[str | None] = mapped_column(
        Enum(DamageLocation), nullable=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Photo stored in the inspection's Google Drive folder
    photo_drive_id:  Mapped[str | None] = mapped_column(String(200), nullable=True)
    photo_url:       Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Repair order — filled in by manager
    repair_order: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)

    # Status lifecycle
    status: Mapped[str] = mapped_column(
        Enum(DamageStatus), default=DamageStatus.open, nullable=False, index=True
    )

    # Manager notes
    manager_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

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

    # Relationship
    inspection: Mapped["Inspection"] = relationship("Inspection", back_populates="damages")

    def __repr__(self) -> str:
        return (
            f"<Damage id={self.id} inspection_id={self.inspection_id} "
            f"location={self.location} status={self.status}>"
        )
