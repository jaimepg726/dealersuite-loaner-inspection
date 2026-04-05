from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, Text, String, DateTime, ForeignKey, LargeBinary, Float, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base
from utils.time import utcnow


class InspectionMedia(Base):
    __tablename__ = "inspection_media"

    id:            Mapped[int]            = mapped_column(Integer, primary_key=True, index=True)
    inspection_id: Mapped[int]            = mapped_column(Integer, ForeignKey("inspections.id", ondelete="CASCADE"), nullable=False, index=True)
    file_url:      Mapped[str]            = mapped_column(Text, nullable=False)
    media_type:    Mapped[str]            = mapped_column(String(10), nullable=False)  # "photo" | "video"
    mime_type:     Mapped[Optional[str]]  = mapped_column(String(50), nullable=True)
    file_data:     Mapped[Optional[bytes]]= mapped_column(LargeBinary, nullable=True)
    file_hash:     Mapped[Optional[str]]  = mapped_column(String(64), nullable=True, index=True)
    created_at:    Mapped[datetime]       = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Idempotency key — one UUID per completed recording, shared across the direct
    # Drive path and the legacy fallback so the same attempt cannot produce two records.
    upload_attempt_id:     Mapped[Optional[str]]      = mapped_column(String(36),               nullable=True)

    geo_latitude:          Mapped[Optional[float]]    = mapped_column(Float,                    nullable=True)
    geo_longitude:         Mapped[Optional[float]]    = mapped_column(Float,                    nullable=True)
    geo_accuracy_m:        Mapped[Optional[float]]    = mapped_column(Float,                    nullable=True)
    geo_timestamp_utc:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True),  nullable=True)
    geo_permission_status: Mapped[Optional[str]]      = mapped_column(String(20),               nullable=True)
    overlay_burned_in:     Mapped[bool]               = mapped_column(Boolean, default=False,   nullable=False, server_default="false")

    inspection = relationship("Inspection", back_populates="media", lazy="selectin")
