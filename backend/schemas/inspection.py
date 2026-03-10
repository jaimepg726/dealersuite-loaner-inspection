"""
DealerSuite — Inspection Pydantic Schemas
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from schemas.damage import DamageResponse


class MediaItem(BaseModel):
    type: str   # "photo" or "video"
    url:  str

    class Config:
        from_attributes = True


class InspectionStart(BaseModel):
    """Porter sends this when tapping 'Start Inspection'."""
    vehicle_id:      int
    inspection_type: str  # "Checkout" | "Checkin" | "Inventory" | "Sales"


class InspectionComplete(BaseModel):
    """Porter sends this when tapping 'Finish'."""
    photo_count: int = 0
    notes:       Optional[str] = None


class InspectionResponse(BaseModel):
    id:               int
    vehicle_id:       int
    inspection_type:  str
    status:           str
    inspector_name:   Optional[str]  = None
    drive_folder_url: Optional[str]  = None
    video_url:        Optional[str]  = None
    photo_count:      int
    notes:            Optional[str]  = None
    started_at:       datetime
    completed_at:     Optional[datetime] = None

    # Nested damages (loaded when viewing a single inspection)
    damages: list[DamageResponse] = []

    # Uploaded media items (photos and videos)
    media: list[MediaItem] = []

    class Config:
        from_attributes = True


class InspectionSummary(BaseModel):
    """Lightweight version for list views — no nested damages."""
    id:               int
    vehicle_id:       int
    inspection_type:  str
    status:           str
    inspector_name:   Optional[str] = None
    photo_count:      int
    drive_folder_url: Optional[str] = None
    started_at:       datetime
    completed_at:     Optional[datetime] = None

    class Config:
        from_attributes = True


class InspectionListResponse(BaseModel):
    total:       int
    inspections: list[InspectionSummary]
