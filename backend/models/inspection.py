"""
DealerSuite — Inspection Model
One record per inspection event (checkout or check-in walkround).
"""

from datetime import datetime, timezone
from typing import TYPE_CHECKING
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base
import enum

if TYPE_CHECKING:
    from models.vehicle          import Vehicle
    from models.damage           import Damage
    from models.user             import User
    from models.inspection_media import InspectionMedia


class InspectionType(str, enum.Enum):
    checkout  = "Checkout"
    checkin   = "Checkin"
    inventory = "Inventory"
    sales     = "Sales"


class InspectionStatus(str, enum.Enum):
    in_progress = "In Progress"
    completed   = "Completed"
    failed      = "Failed"       # upload error


class Inspection(Base):
    __tablename__ = "inspections"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Foreign keys
    vehicle_id: Mapped[int] = mapped_column(
        ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    inspector_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Inspection metadata  (String to match migration — enums used for validation only)
    inspection_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default=InspectionStatus.in_progress,
        nullable=False,
    )
    inspector_name: Mapped[str | None] = mapped_column(
        String(120), nullable=True   # denormalised copy in case user is deleted
    )

    # Google Drive storage
    drive_folder_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    drive_folder_id:  Mapped[str | None] = mapped_column(String(200), nullable=True)
    video_url:        Mapped[str | None] = mapped_column(String(500), nullable=True)
    video_drive_id:   Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Media counts
    photo_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Demo flag — set True for simulated demo records
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")

    # Notes (manager can add after review)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamps
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    vehicle:  Mapped["Vehicle"] = relationship("Vehicle", back_populates="inspections")
    damages:  Mapped[list["Damage"]] = relationship(
        "Damage", back_populates="inspection", cascade="all, delete-orphan"
    )
    inspector: Mapped["User | None"] = relationship("User", foreign_keys=[inspector_id])
    media: Mapped[list["InspectionMedia"]] = relationship(
        "InspectionMedia", back_populates="inspection", cascade="all, delete-orphan",
        order_by="InspectionMedia.created_at",
    )

    def __repr__(self) -> str:
        return (
            f"<Inspection id={self.id} vehicle_id={self.vehicle_id} "
            f"type={self.inspection_type} status={self.status}>"
        )
