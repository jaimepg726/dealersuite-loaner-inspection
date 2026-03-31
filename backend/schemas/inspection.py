"""
DealerSuite — Inspection Pydantic Schemas
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, model_validator

from schemas.damage import DamageResponse


class InspectionStart(BaseModel):
    """Porter sends this when tapping 'Start Inspection'."""
    vehicle_id:      Optional[int] = None  # None allowed for Condition type
    inspection_type: str  # "Checkout" | "Checkin" | "Inventory" | "Sales" | "Condition"
    vin_override:    Optional[str] = None  # Raw VIN or last-7 for Condition inspections
    inspector_name:  Optional[str] = None  # Porter name from sessionStorage — overrides JWT user name


class InspectionComplete(BaseModel):
    """Porter sends this when tapping 'Finish'."""
    photo_count: int = 0
    notes:       Optional[str] = None


class MediaItem(BaseModel):
    id:                    int
    file_url:              str
    media_type:            str  # "photo" | "video"
    created_at:            datetime
    geo_latitude:          Optional[float] = None
    geo_longitude:         Optional[float] = None
    geo_accuracy_m:        Optional[float] = None
    geo_permission_status: Optional[str]   = None
    overlay_burned_in:     bool            = False

    class Config:
        from_attributes = True


class VehicleBrief(BaseModel):
    """Minimal vehicle fields embedded in inspection list/detail responses."""
    id:            int
    loaner_number: Optional[str] = None
    year:          Optional[int] = None
    make:          Optional[str] = None
    model:         Optional[str] = None
    vin:           str

    class Config:
        from_attributes = True


class InspectionResponse(BaseModel):
    id:               int
    vehicle_id:       Optional[int]  = None
    inspection_type:  str
    status:           str
    inspector_name:   Optional[str]  = None
    vin_override:     Optional[str]  = None
    drive_folder_id:  Optional[str]  = None
    drive_folder_url: Optional[str]  = None
    video_url:        Optional[str]  = None
    photo_count:      int            = 0
    video_count:      int            = 0
    notes:            Optional[str]  = None
    started_at:       datetime
    completed_at:     Optional[datetime] = None
    vehicle:          Optional[VehicleBrief] = None

    # Nested damages (loaded when viewing a single inspection)
    damages: list[DamageResponse] = []

    # Inspection media (photos + videos)
    media: list[MediaItem] = []

    @model_validator(mode='after')
    def _compute_media_counts(self):
        """Derive accurate counts from loaded media records.

        Excludes 'pending' records — these are orphaned upload-session stubs
        from failed direct-to-Drive uploads that never reached /finalize-upload.
        Counting them as real media would show inflated video/photo counts.
        """
        # Strip orphaned pending records before counting and before returning
        # the media list so the manager gallery never shows a broken player.
        active = [m for m in self.media if m.file_url != 'pending']
        self.media = active
        self.photo_count = sum(1 for m in active if m.media_type == 'photo')
        self.video_count = sum(1 for m in active if m.media_type == 'video')
        return self

    class Config:
        from_attributes = True


class InspectionSummary(BaseModel):
    """Lightweight version for list views — includes vehicle for card display."""
    id:               int
    vehicle_id:       Optional[int]  = None
    inspection_type:  str
    status:           str
    inspector_name:   Optional[str]    = None
    vin_override:     Optional[str]    = None
    photo_count:      int              = 0
    video_count:      int              = 0
    geo_tagged:       bool             = False
    drive_folder_url: Optional[str]    = None
    started_at:       datetime
    completed_at:     Optional[datetime] = None
    vehicle:          Optional[VehicleBrief] = None

    # Loaded for video_count + geo_tagged computation only — excluded from the API response.
    # Populated when list_inspections eager-loads Inspection.media.
    media: list = Field(default=[], exclude=True)

    @model_validator(mode='after')
    def _compute_video_count(self):
        """Count non-pending video records and check for geotagged media."""
        active = [
            m for m in self.media
            if getattr(m, 'file_url', 'pending') != 'pending'
        ]
        self.video_count = sum(1 for m in active if getattr(m, 'media_type', '') == 'video')
        self.geo_tagged  = any(getattr(m, 'geo_latitude', None) is not None for m in active)
        return self

    class Config:
        from_attributes = True


class InspectionListResponse(BaseModel):
    total:       int
    inspections: list[InspectionSummary]
