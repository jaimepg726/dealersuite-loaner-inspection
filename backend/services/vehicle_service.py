"""
DealerSuite — Vehicle Service
Business logic for fleet CRUD and VIN validation.
Porter-facing: VIN lookup by scan.
Manager-facing: CRUD, status updates.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from fastapi import HTTPException, status

from models.vehicle import Vehicle
from schemas.vehicle import VehicleCreate, VehicleUpdate


# ---------------------------------------------------------------------------
# VIN helpers
# ---------------------------------------------------------------------------

INVALID_VIN_CHARS = {"I", "O", "Q"}


def validate_vin(vin: str) -> str:
    vin = vin.upper().strip()
    if len(vin) != 17:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"VIN must be 17 characters. Got {len(vin)}.",
        )
    bad = INVALID_VIN_CHARS & set(vin)
    if bad:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"VIN contains invalid characters: {', '.join(sorted(bad))}",
        )
    return vin


# ---------------------------------------------------------------------------
# Read operations
# ---------------------------------------------------------------------------

async def get_vehicle_by_id(db: AsyncSession, vehicle_id: int) -> Vehicle:
    result = await db.execute(select(Vehicle).where(Vehicle.id == vehicle_id))
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail=f"Vehicle {vehicle_id} not found")
    return vehicle


async def get_vehicle_by_vin(db: AsyncSession, vin: str) -> Vehicle:
    vin = validate_vin(vin)
    result = await db.execute(select(Vehicle).where(Vehicle.vin == vin))
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        # Auto-create as unknown vehicle so inspections can still be recorded
        # for service vehicles, sales vehicles, and customer vehicles.
        vehicle = Vehicle(
            vin=vin,
            vehicle_type="Unknown",
            status="Active",
            is_active=True,
        )
        db.add(vehicle)
        await db.flush()
    return vehicle


async def get_vehicle_by_loaner_number(db: AsyncSession, loaner_number: str) -> Vehicle:
    result = await db.execute(
        select(Vehicle).where(Vehicle.loaner_number == loaner_number, Vehicle.is_active == True)  # noqa: E712
    )
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(
            status_code=404,
            detail=f"Loaner #{loaner_number} not found in fleet. Contact your manager.",
        )
    return vehicle


async def list_vehicles(
    db: AsyncSession,
    status_filter: str | None = None,
    vehicle_type: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[int, list[Vehicle]]:
    query = select(Vehicle).where(Vehicle.is_active == True)  # noqa: E712

    if status_filter:
        query = query.where(Vehicle.status == status_filter)
    if vehicle_type:
        query = query.where(Vehicle.vehicle_type == vehicle_type)

    count_result = await db.execute(
        select(func.count()).select_from(query.subquery())
    )
    total = count_result.scalar_one()

    query = query.order_by(Vehicle.loaner_number, Vehicle.vin).offset(skip).limit(limit)
    result = await db.execute(query)
    return total, list(result.scalars().all())


# ---------------------------------------------------------------------------
# Write operations
# ---------------------------------------------------------------------------

async def create_vehicle(db: AsyncSession, data: VehicleCreate) -> Vehicle:
    # Check for duplicate VIN
    existing = await db.execute(select(Vehicle).where(Vehicle.vin == data.vin))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"VIN {data.vin} already exists in fleet",
        )
    vehicle = Vehicle(**data.model_dump())
    db.add(vehicle)
    await db.flush()  # get the id without committing (commit in get_db)
    return vehicle


async def update_vehicle(
    db: AsyncSession, vehicle_id: int, data: VehicleUpdate
) -> Vehicle:
    vehicle = await get_vehicle_by_id(db, vehicle_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(vehicle, field, value)
    await db.flush()
    return vehicle


async def upsert_vehicle_from_csv(db: AsyncSession, row: dict) -> tuple[Vehicle, str]:
    """
    Used by the Fleet CSV import service.
    Returns (vehicle, action) where action is 'created' | 'updated' | 'skipped'.
    """
    vin = validate_vin(row.get("VIN", ""))
    status_val = (row.get("Status") or "Active").strip()

    if status_val.lower() == "retired":
        return None, "skipped"

    result = await db.execute(select(Vehicle).where(Vehicle.vin == vin))
    existing = result.scalar_one_or_none()

    fields = {
        "loaner_number": row.get("Loaner_Number"),
        "vin":           vin,
        "year":          int(row["Year"]) if row.get("Year") else None,
        "make":          row.get("Make"),
        "model":         row.get("Model"),
        "plate":         row.get("Plate"),
        "mileage":       int(str(row["Mileage"]).replace(",", "")) if row.get("Mileage") else None,
        "status":        status_val,
        "vehicle_type":  row.get("Vehicle_Type", "Loaner"),
        "fuel_level":    row.get("Fuel"),
    }

    if existing:
        for k, v in fields.items():
            if v is not None:
                setattr(existing, k, v)
        await db.flush()
        return existing, "updated"
    else:
        vehicle = Vehicle(**fields)
        db.add(vehicle)
        await db.flush()
        return vehicle, "created"
