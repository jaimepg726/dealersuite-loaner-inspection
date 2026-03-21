from fastapi import APIRouter, Depends, HTTPException
from utils.time import utcnow
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from dependencies import get_db, get_current_user
from models.loaner import Loaner
from models.vehicle import Vehicle
from schemas.loaner import LoanerCreate, LoanerCheckIn, LoanerOut
from schemas.vehicle import VehicleResponse

router = APIRouter()

def _enrich(l: Loaner) -> dict:
    d = {c.name: getattr(l, c.name) for c in l.__table__.columns}
    d["vehicle_display"] = l.vehicle.display_name if l.vehicle else None
    return d

@router.get("/", response_model=list[LoanerOut])
async def list_loaners(status: str | None = None, limit: int = 100, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    q = select(Loaner).order_by(desc(Loaner.checked_out_at)).limit(limit)
    if status: q = q.where(Loaner.status == status)
    rows = (await db.execute(q)).scalars().all()
    return [_enrich(r) for r in rows]

@router.post("/", response_model=LoanerOut, status_code=201)
async def checkout(body: LoanerCreate, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    v = await db.get(Vehicle, body.vehicle_id)
    if not v: raise HTTPException(404, "Vehicle not found")
    l = Loaner(**body.model_dump(), status="Out", created_by=user.id)
    db.add(l)
    await db.commit()
    await db.refresh(l)
    return _enrich(l)

@router.get("/{id}", response_model=LoanerOut)
async def get_loaner(id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    l = await db.get(Loaner, id)
    if not l: raise HTTPException(404, "Not found")
    return _enrich(l)

@router.patch("/{id}/checkin", response_model=LoanerOut)
async def checkin(id: int, body: LoanerCheckIn, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    l = await db.get(Loaner, id)
    if not l: raise HTTPException(404, "Not found")
    if l.status == "Returned": raise HTTPException(400, "Already checked in")
    l.status = "Returned"; l.checked_in_at = utcnow()
    if body.mileage_in is not None: l.mileage_in = body.mileage_in
    if body.fuel_in is not None: l.fuel_in = body.fuel_in
    if body.notes is not None: l.notes = body.notes
    await db.commit(); await db.refresh(l)
    return _enrich(l)

@router.get("/by-number/{loaner_number}", response_model=VehicleResponse, summary="Look up vehicle by loaner number")
async def get_by_loaner_number(
    loaner_number: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    """
    Porter enters a loaner number (e.g. M501, m501, 501).
    Returns the matching Vehicle in the same shape as the VIN lookup endpoint.
    Normalisation: uppercase, strip whitespace.
    If input is purely numeric (e.g. "501") also tries with an 'M' prefix ("M501").
    """
    normalized = loaner_number.strip().upper()

    result = await db.execute(
        select(Vehicle).where(func.upper(Vehicle.loaner_number) == normalized)
    )
    vehicle = result.scalar_one_or_none()

    # Try 'M' prefix when caller omitted it (e.g. "501" -> "M501")
    if vehicle is None and normalized.isdigit():
        result = await db.execute(
            select(Vehicle).where(func.upper(Vehicle.loaner_number) == f"M{normalized}")
        )
        vehicle = result.scalar_one_or_none()

    if vehicle is None:
        raise HTTPException(
            status_code=404,
            detail=f"No vehicle found with loaner number '{loaner_number}'. Check the number and try again.",
        )
    return vehicle


@router.delete("/{id}", status_code=204)
async def delete_loaner(id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    l = await db.get(Loaner, id)
    if not l: raise HTTPException(404, "Not found")
    await db.delete(l); await db.commit()
