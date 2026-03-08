"""
DealerSuite — Vehicle Pydantic Schemas
Used for request validation and API response serialisation.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator


class VehicleBase(BaseModel):
    loaner_number: Optional[str] = None
    vin:           str
    year:          Optional[int] = None
    make:          Optional[str] = None
    model:         Optional[str] = None
    plate:         Optional[str] = None
    mileage:       Optional[int] = None
    color:         Optional[str] = None
    status:        str = "Active"
    vehicle_type:  str = "Loaner"

    @field_validator("vin")
    @classmethod
    def validate_vin(cls, v: str) -> str:
        v = v.upper().strip()
        if len(v) != 17:
            raise ValueError("VIN must be exactly 17 characters")
        invalid = set(v) & {"I", "O", "Q"}
        if invalid:
            raise ValueError(f"VIN contains invalid characters: {', '.join(invalid)}")
        return v


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(BaseModel):
    """All fields optional for PATCH-style updates."""
    loaner_number: Optional[str]  = None
    year:          Optional[int]  = None
    make:          Optional[str]  = None
    model:         Optional[str]  = None
    plate:         Optional[str]  = None
    mileage:       Optional[int]  = None
    color:         Optional[str]  = None
    status:        Optional[str]  = None
    vehicle_type:  Optional[str]  = None


class VehicleResponse(VehicleBase):
    id:               int
    is_active:        bool
    drive_folder_url: Optional[str] = None
    created_at:       datetime
    updated_at:       datetime

    class Config:
        from_attributes = True


class VehicleListResponse(BaseModel):
    total:    int
    vehicles: list[VehicleResponse]
