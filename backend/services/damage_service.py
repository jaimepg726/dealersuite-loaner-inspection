"""
DealerSuite — Damage Service
Managers review damage items, assign RO numbers, and track repair status.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from fastapi import HTTPException

from models.damage     import Damage, DamageStatus
from models.inspection import Inspection
from models.vehicle    import Vehicle
from schemas.damage    import DamageUpdate


async def create_damage(
    db: AsyncSession,
    inspection_id: int,
    data,   # PorterDamageInput — typed loosely to avoid circular import
) -> Damage:
    """Porter logs a new damage item during an active inspection."""
    damage = Damage(
        inspection_id  = inspection_id,
        location       = data.location,
        description    = data.description,
        photo_url      = getattr(data, "photo_url",      None),
        photo_drive_id = getattr(data, "photo_drive_id", None),
    )
    db.add(damage)
    await db.flush()
    return damage


async def list_damages(
    db: AsyncSession,
    status: str | None = None,
    vehicle_id: int | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[int, list[Damage]]:
    query = select(Damage)

    filters = []
    if status:
        filters.append(Damage.status == status)
    if vehicle_id:
        # Join through inspection to filter by vehicle
        query = query.join(Inspection, Damage.inspection_id == Inspection.id)
        filters.append(Inspection.vehicle_id == vehicle_id)

    if filters:
        query = query.where(and_(*filters))

    total = (
        await db.execute(select(func.count()).select_from(query.subquery()))
    ).scalar_one()

    query = (
        query
        .options(
            selectinload(Damage.inspection).selectinload(Inspection.vehicle)
        )
        .order_by(Damage.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = (await db.execute(query)).scalars().all()
    return total, list(rows)


async def get_damage_by_id(db: AsyncSession, damage_id: int) -> Damage:
    result = await db.execute(
        select(Damage)
        .options(selectinload(Damage.inspection).selectinload(Inspection.vehicle))
        .where(Damage.id == damage_id)
    )
    damage = result.scalar_one_or_none()
    if not damage:
        raise HTTPException(status_code=404, detail="Damage record not found")
    return damage


async def update_damage(
    db: AsyncSession,
    damage_id: int,
    data: DamageUpdate,
) -> Damage:
    damage = await get_damage_by_id(db, damage_id)

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(damage, field, value)

    # Auto-advance status when RO is first assigned
    if data.repair_order and damage.status == DamageStatus.open:
        damage.status = DamageStatus.ro_assigned

    await db.flush()
    return damage
