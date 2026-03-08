"""
DealerSuite — Damage Pydantic Schemas
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class DamageCreate(BaseModel):
    inspection_id:  int
    location:       Optional[str] = None
    description:    Optional[str] = None
    photo_url:      Optional[str] = None
    photo_drive_id: Optional[str] = None


class PorterDamageInput(BaseModel):
    """Used by the porter during an active inspection — inspection_id comes from the URL."""
    location:       Optional[str] = None
    description:    Optional[str] = None
    photo_url:      Optional[str] = None
    photo_drive_id: Optional[str] = None


class DamageUpdate(BaseModel):
    """Manager uses this to assign RO, update status, add notes."""
    repair_order:  Optional[str] = None
    status:        Optional[str] = None
    manager_notes: Optional[str] = None
    location:      Optional[str] = None
    description:   Optional[str] = None


class DamageResponse(BaseModel):
    id:            int
    inspection_id: int
    location:      Optional[str] = None
    description:   Optional[str] = None
    photo_url:     Optional[str] = None
    repair_order:  Optional[str] = None
    status:        str
    manager_notes: Optional[str] = None
    created_at:    datetime
    updated_at:    datetime

    class Config:
        from_attributes = True


class DamageListResponse(BaseModel):
    total:   int
    damages: list[DamageResponse]
