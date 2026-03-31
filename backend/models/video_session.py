"""DealerSuite — VideoSession Model

Tracks the full lifecycle of each video recording/upload attempt.
Separate from Inspection so we can log failed, abandoned, and interrupted
sessions that never resulted in a completed inspection record.

Status lifecycle:
  started → recording → stopped_short | ready_for_upload
  ready_for_upload → uploading → completed | failed_upload
  Any active status → interrupted | closed_early | abandoned | expired
"""

from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Float, Boolean, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from database import Base


class VideoSession(Base):
    __tablename__ = "video_sessions"

    id:   Mapped[int] = mapped_column(primary_key=True)
    uuid: Mapped[str] = mapped_column(String(36), unique=True, index=True, nullable=False)

    # Context — denormalized so manager view needs no joins
    inspection_id:   Mapped[int | None] = mapped_column(
        Integer, ForeignKey("inspections.id", ondelete="SET NULL"), nullable=True, index=True
    )
    inspector_id:    Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    inspector_name:  Mapped[str | None] = mapped_column(String(200), nullable=True)
    loaner_number:   Mapped[str | None] = mapped_column(String(50),  nullable=True)
    inspection_type: Mapped[str | None] = mapped_column(String(50),  nullable=True)

    # Status lifecycle
    # started | recording | stopped_short | ready_for_upload | uploading |
    # completed | failed_upload | abandoned | closed_early | interrupted | expired
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="started", index=True
    )

    # Timestamps
    created_at:           Mapped[datetime]      = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    last_heartbeat_at:    Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recording_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recording_stopped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    upload_started_at:    Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    upload_finished_at:   Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Duration tracking
    duration_seconds:     Mapped[float | None] = mapped_column(Float,   nullable=True)
    min_duration_required: Mapped[float | None] = mapped_column(Float,  nullable=True)
    min_duration_met:     Mapped[bool]          = mapped_column(Boolean, nullable=False, default=False)

    # Phase and failure detail
    last_known_phase:  Mapped[str | None] = mapped_column(String(50),  nullable=True)
    failure_reason:    Mapped[str | None] = mapped_column(String(500), nullable=True)
    interruption_type: Mapped[str | None] = mapped_column(String(50),  nullable=True)

    # Event flags — once True, never reset to False
    app_backgrounded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    app_unloaded:     Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    upload_started:   Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    upload_finalized: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    def __repr__(self) -> str:
        return f"<VideoSession uuid={self.uuid} status={self.status}>"
