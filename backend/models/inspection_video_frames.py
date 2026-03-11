"""DealerSuite — InspectionVideoFrame model
Stores individual JPEG frames extracted from a walkaround video.
One row per frame, tied to the source inspection.
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, Text, DateTime, ForeignKey, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base
from utils.time import utcnow


class InspectionVideoFrame(Base):
    __tablename__ = "inspection_video_frames"

    id:            Mapped[int]            = mapped_column(Integer, primary_key=True, index=True)
    inspection_id: Mapped[int]            = mapped_column(
        Integer, ForeignKey("inspections.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    frame_url:     Mapped[str]            = mapped_column(Text, nullable=False)
    frame_index:   Mapped[int]            = mapped_column(Integer, nullable=False)
    frame_data:    Mapped[Optional[bytes]]= mapped_column(LargeBinary, nullable=True)
    created_at:    Mapped[datetime]       = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    inspection = relationship("Inspection", lazy="selectin")
