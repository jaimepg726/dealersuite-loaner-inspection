"""
DealerSuite — Vehicle Routes
GET  /api/vehicles              → list fleet (porters + managers)
GET  /api/vehicles/vin/{vin}    → lookup by VIN (porter VIN scan result)
GET  /api/vehicles/{id}         → single vehicle detail
POST /api/vehicles              → create vehicle (manager+)
PATCH /api/vehicles/{id}        → update vehicle (manager+)
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user, require_manager
from schemas.vehicle import VehicleCreate, VehicleUpdate, VehicleResponse, VehicleListResponse
from services.vehicle_service import (
    list_vehicles, get_vehicle_by_id, get_vehicle_by_vin,
    create_vehicle, update_vehicle,
)

router = APIRouter()


@router.get("/", response_model=VehicleListResponse, summary="List fleet vehicles")
async def route_list_vehicles(
    status: str | None = Query(None, description="Filter by status: Active, Retired, In Service"),
    vehicle_type: str | None = Query(None, description="Filter by type: Loaner, Inventory, Sales"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    total, vehicles = await list_vehicles(db, status, vehicle_type, skip, limit)
    return VehicleListResponse(total=total, vehicles=vehicles)


@router.get("/vin/{vin}", response_model=VehicleResponse, summary="Look up vehicle by VIN scan")
async def route_get_by_vin(
    vin: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Called immediately after a porter scans a VIN barcode or OCR."""
    return await get_vehicle_by_vin(db, vin)


@router.get("/{vehicle_id}", response_model=VehicleResponse, summary="Get single vehicle")
async def route_get_vehicle(
    vehicle_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await get_vehicle_by_id(db, vehicle_id)


@router.post("/", response_model=VehicleResponse, status_code=201, summary="Create vehicle")
async def route_create_vehicle(
    data: VehicleCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    return await create_vehicle(db, data)


@router.patch("/{vehicle_id}", response_model=VehicleResponse, summary="Update vehicle")
async def route_update_vehicle(
    vehicle_id: int,
    data: VehicleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    return await update_vehicle(db, vehicle_id, data)
