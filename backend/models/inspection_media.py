from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, Text, String, DateTime, ForeignKey, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base
from utils.time import utcnow


class InspectionMedia(Base):
    __tablename__ = "inspection_media"

    id:            Mapped[int]            = mapped_column(Integer, primary_key=True, index=True)
    inspection_id: Mapped[int]            = mapped_column(Integer, ForeignKey("inspections.id", ondelete="CASCADE"), nullable=False, index=True)

    # Legacy BYTEA storage — kept nullable for backfilling existing records.
    # New uploads use drive_file_id / drive_url instead.
    file_data:     Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)

    file_url:      Mapped[str]            = mapped_column(Text, nullable=False)
    media_type:    Mapped[str]            = mapped_column(String(10), nullable=False)  # "photo" | "video"
    mime_type:     Mapped[Optional[str]]  = mapped_column(String(50), nullable=True)

    # Direct-to-Drive fields
    drive_file_id: Mapped[Optional[str]]  = mapped_column(String(200), nullable=True)
    drive_url:     Mapped[Optional[str]]  = mapped_column(String(500), nullable=True)
    file_size:     Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
    uploaded_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    file_hash:     Mapped[Optional[str]]  = mapped_column(String(64), nullable=True, index=True)
    created_at:    Mapped[datetime]       = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    inspection = relationship("Inspection", back_populates="media", lazy="selectin")
