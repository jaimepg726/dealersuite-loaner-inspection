"""
DealerSuite — Fleet Import Routes
POST /api/fleet/import        → upload TSD Dealer CSV, upsert all vehicles
GET  /api/fleet/vehicles      → paginated vehicle list for manager fleet tab
GET  /api/fleet/vehicles/{id} → single vehicle with inspection history count
"""

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from database import get_db
from dependencies import require_manager, get_current_user
from models.vehicle import Vehicle
from models.inspection import Inspection
from schemas.vehicle import VehicleListResponse, VehicleResponse
from services.fleet_service import import_fleet_csv as _import_csv
from services.vehicle_service import list_vehicles

router = APIRouter()

# ---------------------------------------------------------------------------
# CSV Import
# ---------------------------------------------------------------------------

@router.post("/import", summary="Import fleet CSV from TSD Dealer")
async def import_fleet_csv(
    file: UploadFile = File(..., description="CSV exported from TSD Dealer"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    """
    Accepts a CSV file and upserts all vehicles.
    Returns a summary of created / updated / skipped / error rows.
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="File must be a .csv export from TSD Dealer",
        )

    # Guard against very large files (10 MB max)
    MAX_BYTES = 10 * 1024 * 1024
    contents = await file.read(MAX_BYTES + 1)
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="CSV file too large (max 10 MB)")

    result = await _import_csv(contents, db)

    return {
        "status":  "completed",
        "filename": file.filename,
        "summary": result.to_dict(),
        "imported_by": current_user.name,
    }


# ---------------------------------------------------------------------------
# Fleet list (manager dashboard)
# ---------------------------------------------------------------------------

@router.get("/vehicles", response_model=VehicleListResponse, summary="List fleet vehicles")
async def list_fleet_vehicles(
    status:       str | None = Query(None, description="Filter: Active | Retired | In Service"),
    vehicle_type: str | None = Query(None, description="Filter: Loaner | Inventory | Sales"),
    search:       str | None = Query(None, description="Search by loaner number, VIN, make, or model"),
    skip:  int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=250),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    query = select(Vehicle).where(Vehicle.is_active == True)  # noqa: E712

    if status:
        query = query.where(Vehicle.status == status)
    if vehicle_type:
        query = query.where(Vehicle.vehicle_type == vehicle_type)
    if search:
        term = f"%{search.upper()}%"
        from sqlalchemy import or_
        query = query.where(
            or_(
                Vehicle.vin.ilike(term),
                Vehicle.loaner_number.ilike(term),
                Vehicle.make.ilike(term),
                Vehicle.model.ilike(term),
                Vehicle.plate.ilike(term),
            )
        )

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar_one()

    query = query.order_by(Vehicle.loaner_number.nulls_last(), Vehicle.vin).offset(skip).limit(limit)
    result = await db.execute(query)
    vehicles = list(result.scalars().all())

    return VehicleListResponse(total=total, vehicles=vehicles)


@router.get("/vehicles/{vehicle_id}", summary="Get vehicle detail with inspection count")
async def get_fleet_vehicle(
    vehicle_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Vehicle).where(Vehicle.id == vehicle_id))
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    # Count completed inspections
    count_result = await db.execute(
        select(func.count(Inspection.id))
        .where(Inspection.vehicle_id == vehicle_id)
        .where(Inspection.status == "Completed")
    )
    inspection_count = count_result.scalar_one()

    return {
        **VehicleResponse.model_validate(vehicle).model_dump(),
        "inspection_count": inspection_count,
    }
