"""DealerSuite — VideoSession Pydantic Schemas"""

from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class VideoSessionCreate(BaseModel):
    inspector_name:       Optional[str]   = None
    loaner_number:        Optional[str]   = None
    inspection_type:      Optional[str]   = None
    inspection_id:        Optional[int]   = None
    min_duration_required: Optional[float] = None


class VideoSessionUpdate(BaseModel):
    status:            Optional[str]   = None
    inspection_id:     Optional[int]   = None
    duration_seconds:  Optional[float] = None
    min_duration_met:  Optional[bool]  = None
    last_known_phase:  Optional[str]   = None
    failure_reason:    Optional[str]   = None
    interruption_type: Optional[str]   = None
    # Flags — only set to True; False is ignored server-side
    app_backgrounded:  Optional[bool]  = None
    app_unloaded:      Optional[bool]  = None
    upload_started:    Optional[bool]  = None
    upload_finalized:  Optional[bool]  = None
    # Timestamps — ISO strings from the frontend
    recording_started_at: Optional[datetime] = None
    recording_stopped_at: Optional[datetime] = None
    upload_started_at:    Optional[datetime] = None
    upload_finished_at:   Optional[datetime] = None


class HeartbeatBody(BaseModel):
    phase:           str
    elapsed_seconds: Optional[float] = None


class VideoSessionResponse(BaseModel):
    id:               int
    uuid:             str
    inspection_id:    Optional[int]
    inspector_name:   Optional[str]
    loaner_number:    Optional[str]
    inspection_type:  Optional[str]
    status:           str
    created_at:       datetime
    last_heartbeat_at:    Optional[datetime]
    recording_started_at: Optional[datetime]
    recording_stopped_at: Optional[datetime]
    upload_started_at:    Optional[datetime]
    upload_finished_at:   Optional[datetime]
    duration_seconds:     Optional[float]
    min_duration_required: Optional[float]
    min_duration_met:     bool
    failure_reason:       Optional[str]
    interruption_type:    Optional[str]
    last_known_phase:     Optional[str]
    app_backgrounded:     bool
    app_unloaded:         bool
    upload_started:       bool
    upload_finalized:     bool

    class Config:
        from_attributes = True
