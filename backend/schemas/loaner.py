from datetime import datetime
from pydantic import BaseModel

class LoanerOut(BaseModel):
    id: int
    vehicle_id: int
    customer_name: str
    customer_phone: str | None
    customer_email: str | None
    ro_number: str | None
    advisor_name: str | None
    status: str
    mileage_out: int | None
    mileage_in: int | None
    fuel_out: str | None
    fuel_in: str | None
    checked_out_at: datetime
    checked_in_at: datetime | None
    notes: str | None
    vehicle_display: str | None = None
    model_config = {"from_attributes": True}

class LoanerCreate(BaseModel):
    vehicle_id: int
    customer_name: str
    customer_phone: str | None = None
    customer_email: str | None = None
    ro_number: str | None = None
    advisor_name: str | None = None
    mileage_out: int | None = None
    fuel_out: str | None = None
    notes: str | None = None

class LoanerCheckIn(BaseModel):
    mileage_in: int | None = None
    fuel_in: str | None = None
    notes: str | None = None
