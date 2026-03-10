from datetime import datetime
from sqlalchemy import Integer, Text, String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base
from utils.time import utcnow


class InspectionMedia(Base):
    __tablename__ = "inspection_media"

    id:            Mapped[int]           = mapped_column(Integer, primary_key=True, index=True)
    inspection_id: Mapped[int]           = mapped_column(Integer, ForeignKey("inspections.id", ondelete="CASCADE"), nullable=False, index=True)
    file_url:      Mapped[str]           = mapped_column(Text, nullable=False)
    media_type:    Mapped[str]           = mapped_column(String(10), nullable=False)  # "photo" | "video"
    created_at:    Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    inspection = relationship("Inspection", back_populates="media", lazy="selectin")
