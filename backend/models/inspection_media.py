"""
DealerSuite — InspectionMedia Model
One row per uploaded photo or video linked to an inspection.
"""

from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base
from utils.time import utcnow

if TYPE_CHECKING:
    from models.inspection import Inspection


class InspectionMedia(Base):
    __tablename__ = "inspection_media"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    inspection_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("inspections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_url: Mapped[str] = mapped_column(Text, nullable=False)
    media_type: Mapped[str] = mapped_column(String(10), nullable=False)  # "photo" or "video"
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    inspection: Mapped["Inspection"] = relationship("Inspection", back_populates="media")

    def __repr__(self) -> str:
        return f"<InspectionMedia id={self.id} inspection_id={self.inspection_id} type={self.media_type}>"
