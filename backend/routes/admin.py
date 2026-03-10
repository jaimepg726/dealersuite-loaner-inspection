"""DealerSuite — Admin / Demo Mode Routes
POST /api/admin/demo/enable   -> insert demo records (is_demo=true)
POST /api/admin/demo/disable  -> delete all demo records
GET  /api/admin/demo/status   -> {demo_mode: bool}
"""
import traceback
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from utils.time import utcnow
from database import get_db
from dependencies import require_manager
from models.vehicle import Vehicle
from models.loaner import Loaner
from models.inspection import Inspection

router = APIRouter()

# ---------------------------------------------------------------------------
# Demo seed data
# ---------------------------------------------------------------------------
_DEMO_VEHICLES = [
    {"vin": "DEMO00000000000001", "loaner_number": "L-01", "year": 2023, "make": "Toyota",    "model": "Camry",     "plate": "DMO 1001", "color": "Silver", "fuel_level": "Full",  "vehicle_type": "Loaner",    "status": "Active"},
    {"vin": "DEMO00000000000002", "loaner_number": "L-02", "year": 2022, "make": "Honda",     "model": "Accord",    "plate": "DMO 1002", "color": "White",  "fuel_level": "3/4",   "vehicle_type": "Loaner",    "status": "Active"},
    {"vin": "DEMO00000000000003", "loaner_number": "L-03", "year": 2024, "make": "Ford",      "model": "Escape",    "plate": "DMO 1003", "color": "Blue",   "fuel_level": "1/2",   "vehicle_type": "Loaner",    "status": "In Service"},
    {"vin": "DEMO00000000000004", "loaner_number": None,   "year": 2023, "make": "Chevrolet", "model": "Equinox",   "plate": "DMO 1004", "color": "Black",  "fuel_level": "Full",  "vehicle_type": "Inventory", "status": "Active"},
    {"vin": "DEMO00000000000005", "loaner_number": None,   "year": 2024, "make": "BMW",       "model": "3 Series",  "plate": "DMO 1005", "color": "Gray",   "fuel_level": "Full",  "vehicle_type": "Sales",     "status": "Active"},
]

_DEMO_LOANERS = [
    {"vehicle_idx": 0, "customer_name": "James Rivera",    "customer_phone": "555-0101", "ro_number": "RO-88201", "advisor_name": "Maria Lopez",   "mileage_out": 12450, "fuel_out": "Full", "status": "Out"},
    {"vehicle_idx": 1, "customer_name": "Sandra Chen",     "customer_phone": "555-0102", "ro_number": "RO-88202", "advisor_name": "Carlos Medina",  "mileage_out": 8310,  "fuel_out": "3/4",  "status": "Out"},
    {"vehicle_idx": 2, "customer_name": "Derek Thompson",  "customer_phone": "555-0103", "ro_number": "RO-88203", "advisor_name": "Maria Lopez",   "mileage_out": 21800, "fuel_out": "1/2",  "status": "Out"},
]

_DEMO_INSPECTIONS = [
    {"vehicle_idx": 0, "inspection_type": "Checkout",  "status": "Completed", "inspector_name": "Alex Perez",   "photo_count": 8},
    {"vehicle_idx": 1, "inspection_type": "Checkout",  "status": "Completed", "inspector_name": "Jordan Kim",   "photo_count": 6},
    {"vehicle_idx": 2, "inspection_type": "Checkin",   "status": "Completed", "inspector_name": "Alex Perez",   "photo_count": 5},
    {"vehicle_idx": 3, "inspection_type": "Inventory", "status": "Completed", "inspector_name": "Jordan Kim",   "photo_count": 10},
    {"vehicle_idx": 4, "inspection_type": "Sales",     "status": "Completed", "inspector_name": "Taylor Brooks", "photo_count": 7},
]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/demo/status", summary="Is demo mode active?")
async def demo_status(
    db: AsyncSession = Depends(get_db),
):
    from services.settings_service import get_setting
    flag = await get_setting(db, "demo_mode")
    # Fall back to counting demo vehicles if settings row missing
    if flag is None:
        result = await db.execute(
            select(func.count()).select_from(Vehicle).where(Vehicle.is_demo == True)  # noqa: E712
        )
        return {"demo_mode": result.scalar_one() > 0}
    return {"demo_mode": flag == "true"}


@router.post("/demo/enable", summary="Insert demo records")
async def demo_enable(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_manager),
):
    from services.settings_service import set_setting

    # Idempotent — skip if demo data already exists
    existing = await db.execute(
        select(func.count()).select_from(Vehicle).where(Vehicle.is_demo == True)  # noqa: E712
    )
    if existing.scalar_one() > 0:
        await set_setting(db, "demo_mode", "true")
        await db.commit()
        return {"detail": "Demo mode already active"}

    try:
        now = utcnow()

        # 1. Insert demo vehicles — capture IDs before inserting dependants
        vehicles = []
        for v in _DEMO_VEHICLES:
            veh = Vehicle(
                vin=v["vin"], loaner_number=v["loaner_number"],
                year=v["year"], make=v["make"], model=v["model"],
                plate=v["plate"], color=v["color"], fuel_level=v["fuel_level"],
                vehicle_type=v["vehicle_type"], status=v["status"],
                is_active=True, is_demo=True,
            )
            db.add(veh)
            vehicles.append(veh)
        await db.flush()  # get IDs before FK inserts

        # 2. Insert demo loaners referencing vehicle IDs
        for l in _DEMO_LOANERS:
            db.add(Loaner(
                vehicle_id=vehicles[l["vehicle_idx"]].id,
                customer_name=l["customer_name"],
                customer_phone=l["customer_phone"],
                ro_number=l["ro_number"],
                advisor_name=l["advisor_name"],
                mileage_out=l["mileage_out"],
                fuel_out=l["fuel_out"],
                status=l["status"],
                checked_out_at=utcnow() - timedelta(hours=3),
                is_demo=True,
            ))

        # 3. Insert demo inspections referencing vehicle IDs
        for i in _DEMO_INSPECTIONS:
            db.add(Inspection(
                vehicle_id=vehicles[i["vehicle_idx"]].id,
                inspection_type=i["inspection_type"],
                status=i["status"],
                inspector_name=i["inspector_name"],
                photo_count=i["photo_count"],
                started_at=utcnow() - timedelta(hours=4),
                completed_at=utcnow() - timedelta(hours=3, minutes=30),
                is_demo=True,
            ))

        # 4. Persist demo_mode flag in settings
        await set_setting(db, "demo_mode", "true")

        await db.commit()
    except Exception:
        print(traceback.format_exc())
        raise

    return {"detail": "Demo mode enabled", "vehicles": len(_DEMO_VEHICLES)}


@router.post("/demo/disable", summary="Delete all demo records")
async def demo_disable(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_manager),
):
    from services.settings_service import set_setting

    # Delete in FK-safe order (child rows before parent rows)
    await db.execute(text("DELETE FROM inspection_media WHERE inspection_id IN (SELECT id FROM inspections WHERE is_demo = true)"))
    await db.execute(text("DELETE FROM inspections WHERE is_demo = true"))
    await db.execute(text("DELETE FROM loaners     WHERE is_demo = true"))
    await db.execute(text("DELETE FROM vehicles    WHERE is_demo = true"))
    await set_setting(db, "demo_mode", "false")
    await db.commit()
    return {"detail": "Demo mode disabled"}
