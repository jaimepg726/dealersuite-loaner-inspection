"""
DealerSuite — Inspection Service
Business logic for creating, listing, and completing inspections.
"""

from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import selectinload
from fastapi import HTTPException

from models.inspection       import Inspection, InspectionStatus
from models.inspection_media import InspectionMedia
from models.vehicle          import Vehicle
from models.user             import User
from schemas.inspection      import InspectionStart


async def start_inspection(
    db: AsyncSession,
    data: InspectionStart,
    current_user: User,
) -> Inspection:
    """Create a new in-progress inspection record."""
    result = await db.execute(select(Vehicle).where(Vehicle.id == data.vehicle_id))
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    inspection = Inspection(
        vehicle_id      = data.vehicle_id,
        inspector_id    = current_user.id,
        inspector_name  = current_user.name,
        inspection_type = data.inspection_type,
        status          = InspectionStatus.in_progress,
        started_at      = datetime.now(timezone.utc),
    )
    db.add(inspection)
    await db.flush()
    return inspection


async def complete_inspection(
    db: AsyncSession,
    inspection_id: int,
    photo_count: int = 0,
    notes: str | None = None,
) -> Inspection:
    result = await db.execute(
        select(Inspection).where(Inspection.id == inspection_id)
    )
    inspection = result.scalar_one_or_none()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")

    inspection.status       = InspectionStatus.completed
    inspection.completed_at = datetime.now(timezone.utc)
    inspection.photo_count  = photo_count
    if notes:
        inspection.notes = notes
    await db.flush()
    return inspection


async def get_inspection_by_id(
    db: AsyncSession,
    inspection_id: int,
) -> Inspection:
    result = await db.execute(
        select(Inspection)
        .options(
            selectinload(Inspection.damages),
            selectinload(Inspection.vehicle),
            selectinload(Inspection.media),
        )
        .where(Inspection.id == inspection_id)
    )
    inspection = result.scalar_one_or_none()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    return inspection


async def add_media(
    db: AsyncSession,
    inspection_id: int,
    file_url: str,
    media_type: str,  # "photo" or "video"
) -> InspectionMedia:
    """Insert a media record after a successful upload."""
    from utils.time import utcnow
    item = InspectionMedia(
        inspection_id=inspection_id,
        file_url=file_url,
        media_type=media_type,
        created_at=utcnow(),
    )
    db.add(item)
    await db.flush()
    return item


async def list_inspections(
    db: AsyncSession,
    status: str | None = None,
    inspection_type: str | None = None,
    vehicle_id: int | None = None,
    days: int | None = None,
    is_demo: bool | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[int, list[Inspection]]:
    query = select(Inspection)

    filters = []
    if status:
        filters.append(Inspection.status == status)
    if inspection_type:
        filters.append(Inspection.inspection_type == inspection_type)
    if vehicle_id:
        filters.append(Inspection.vehicle_id == vehicle_id)
    if days:
        from datetime import timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        filters.append(Inspection.started_at >= cutoff)
    if is_demo is True:
        filters.append(Inspection.is_demo == True)   # noqa: E712
    elif is_demo is False:
        filters.append(
            or_(Inspection.is_demo == False, Inspection.is_demo == None)  # noqa: E712,E711
        )

    if filters:
        query = query.where(and_(*filters))

    count_q = select(func.count()).select_from(query.subquery())
    total   = (await db.execute(count_q)).scalar_one()

    query = (
        query
        .options(selectinload(Inspection.vehicle))
        .order_by(Inspection.started_at.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = (await db.execute(query)).scalars().all()
    return total, list(rows)


async def update_drive_folder(
    db: AsyncSession,
    inspection_id: int,
    folder_id: str,
    folder_url: str | None,
) -> None:
    """Write Drive folder ID/URL back to an inspection row (called from background task)."""
    result = await db.execute(select(Inspection).where(Inspection.id == inspection_id))
    inspection = result.scalar_one_or_none()
    if inspection:
        inspection.drive_folder_id  = folder_id
        inspection.drive_folder_url = folder_url
        await db.commit()


async def set_video_url(
    db: AsyncSession,
    inspection_id: int,
    video_drive_id: str,
    video_url: str | None,
) -> None:
    """Persist the Drive file ID and public URL for an inspection's video."""
    result = await db.execute(select(Inspection).where(Inspection.id == inspection_id))
    inspection = result.scalar_one_or_none()
    if inspection:
        inspection.video_drive_id = video_drive_id
        inspection.video_url      = video_url
        await db.commit()


async def get_demo_mode(db: AsyncSession) -> bool:
    """Return True if any vehicle with is_demo=True exists."""
    result = await db.execute(
        select(func.count()).select_from(
            select(Vehicle).where(Vehicle.is_demo == True).subquery()  # noqa: E712
        )
    )
    return result.scalar_one() > 0


async def get_dashboard_stats(db: AsyncSession, is_demo: bool | None = None) -> dict:
    """Aggregate stats for the manager reports tab."""
    from datetime import timedelta

    now   = datetime.now(timezone.utc)
    week  = now - timedelta(days=7)
    month = now - timedelta(days=30)

    def _demo_filter(q):
        if is_demo is True:
            return q.where(Inspection.is_demo == True)   # noqa: E712
        if is_demo is False:
            return q.where(or_(Inspection.is_demo == False, Inspection.is_demo == None))  # noqa: E712,E711
        return q

    async def count(q):
        return (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()

    total_inspections   = await count(_demo_filter(select(Inspection)))
    this_week           = await count(_demo_filter(select(Inspection).where(Inspection.started_at >= week)))
    this_month          = await count(_demo_filter(select(Inspection).where(Inspection.started_at >= month)))
    completed           = await count(_demo_filter(select(Inspection).where(Inspection.status == "Completed")))
    in_progress         = await count(_demo_filter(select(Inspection).where(Inspection.status == "In Progress")))

    from models.damage import Damage
    open_damage         = await count(select(Damage).where(Damage.status == "Open"))
    ro_assigned         = await count(select(Damage).where(Damage.status == "RO Assigned"))
    total_damage        = await count(select(Damage))

    total_vehicles = (
        await db.execute(
            select(func.count(Vehicle.id)).where(Vehicle.is_active == True)  # noqa
        )
    ).scalar_one()

    # Breakdown by type (this month)
    type_q = _demo_filter(
        select(Inspection.inspection_type, func.count(Inspection.id))
        .where(Inspection.started_at >= month)
        .group_by(Inspection.inspection_type)
    )
    type_rows = (await db.execute(type_q)).all()
    by_type = {row[0]: row[1] for row in type_rows}

    return {
        "total_inspections": total_inspections,
        "this_week":         this_week,
        "this_month":        this_month,
        "completed":         completed,
        "in_progress":       in_progress,
        "open_damage":       open_damage,
        "ro_assigned":       ro_assigned,
        "total_damage":      total_damage,
        "total_vehicles":    total_vehicles,
        "by_type":           by_type,
    }
