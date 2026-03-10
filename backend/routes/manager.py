"""
DealerSuite — Manager Dashboard Routes

GET  /api/manager/stats                  → dashboard KPI summary
GET  /api/manager/inspections            → paginated inspection list
GET  /api/manager/inspections/{id}       → single inspection detail
GET  /api/manager/damage                 → damage review queue
PATCH /api/manager/damage/{id}           → assign RO / update status
GET  /api/manager/reports                → aggregate report data

── Stage 10: User Management & Settings ──────────────────────────────────────
GET    /api/manager/users                → list all users
POST   /api/manager/users                → create a new porter / manager
PATCH  /api/manager/users/{id}           → update user (name, role, active, password)
DELETE /api/manager/users/{id}           → soft-deactivate a user
GET    /api/manager/drive-status         → Google Drive connection health check
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from database import get_db
from dependencies import require_manager, require_admin
from schemas.inspection import InspectionListResponse, InspectionResponse
from schemas.damage import DamageListResponse, DamageResponse, DamageUpdate
from schemas.user import UserCreate, UserUpdate, UserResponse, UserListResponse
from services.inspection_service import (
    list_inspections, get_inspection_by_id, get_dashboard_stats, get_demo_mode
)
from services.damage_service import list_damages, update_damage

router = APIRouter()


# ---------------------------------------------------------------------------
# Stats (top of dashboard)
# ---------------------------------------------------------------------------

@router.get("/stats", summary="Dashboard KPI summary")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    demo = await get_demo_mode(db)
    return await get_dashboard_stats(db, is_demo=demo if demo else False)


# ---------------------------------------------------------------------------
# Inspections
# ---------------------------------------------------------------------------

@router.get(
    "/inspections",
    response_model=InspectionListResponse,
    summary="List inspections",
)
async def route_list_inspections(
    status:          str | None = Query(None, description="In Progress | Completed | Failed"),
    inspection_type: str | None = Query(None, description="Checkout | Checkin | Inventory | Sales"),
    vehicle_id:      int | None = Query(None),
    days:            int | None = Query(None, description="Limit to last N days"),
    skip:  int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=250),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    demo = await get_demo_mode(db)
    total, inspections = await list_inspections(
        db, status, inspection_type, vehicle_id, days,
        is_demo=demo if demo else False,
        skip=skip, limit=limit,
    )
    return InspectionListResponse(total=total, inspections=inspections)


@router.get(
    "/inspections/{inspection_id}",
    response_model=InspectionResponse,
    summary="Get inspection detail with damages",
)
async def route_get_inspection(
    inspection_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    return await get_inspection_by_id(db, inspection_id)


# ---------------------------------------------------------------------------
# Damage review
# ---------------------------------------------------------------------------

@router.get(
    "/damage",
    response_model=DamageListResponse,
    summary="Damage review queue",
)
async def route_list_damage(
    status:     str | None = Query(None, description="Open | RO Assigned | In Repair | Repaired | Waived"),
    vehicle_id: int | None = Query(None),
    skip:  int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=250),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    total, damages = await list_damages(db, status, vehicle_id, skip, limit)
    return DamageListResponse(total=total, damages=damages)


@router.patch(
    "/damage/{damage_id}",
    response_model=DamageResponse,
    summary="Assign RO or update damage status",
)
async def route_update_damage(
    damage_id: int,
    data: DamageUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    return await update_damage(db, damage_id, data)


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

@router.get("/reports", summary="Aggregate inspection reports")
async def route_reports(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    """Returns the same stats as /stats plus a full type breakdown for charts."""
    demo = await get_demo_mode(db)
    return await get_dashboard_stats(db, is_demo=demo if demo else False)


# ---------------------------------------------------------------------------
# Stage 10 — User Management (admin & manager access)
# ---------------------------------------------------------------------------

@router.get(
    "/users",
    response_model=UserListResponse,
    summary="List all user accounts",
)
async def route_list_users(
    role:      str | None  = Query(None, description="porter | manager | admin"),
    is_active: bool | None = Query(None, description="Filter by active status"),
    skip:  int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    """Managers can view the full user list; only admins can modify users."""
    from models.user import User

    q = select(User)
    if role is not None:
        q = q.where(User.role == role)
    if is_active is not None:
        q = q.where(User.is_active == is_active)

    count_q = select(func.count()).select_from(q.subquery())
    total   = (await db.execute(count_q)).scalar_one()

    result = await db.execute(q.order_by(User.name).offset(skip).limit(limit))
    users  = result.scalars().all()

    return UserListResponse(total=total, users=users)


@router.post(
    "/users",
    response_model=UserResponse,
    status_code=201,
    summary="Create a new user account",
)
async def route_create_user(
    data: UserCreate,
    db:   AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    """
    Managers can create porter accounts.
    Only admins can create manager or admin accounts.
    """
    from models.user import User
    from services.auth_service import hash_password

    # Role guard: only admins can promote to manager/admin
    if data.role in ("manager", "admin") and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can create manager or admin accounts.",
        )

    # Duplicate email check
    existing = (await db.execute(
        select(User).where(User.email == data.email.lower().strip())
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An account with email '{data.email}' already exists.",
        )

    user = User(
        name=data.name.strip(),
        email=data.email.lower().strip(),
        hashed_password=hash_password(data.password),
        role=data.role,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.patch(
    "/users/{user_id}",
    response_model=UserResponse,
    summary="Update a user account",
)
async def route_update_user(
    user_id: int,
    data:    UserUpdate,
    db:      AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    """
    Managers can toggle porter active status.
    Only admins can change roles or update manager/admin accounts.
    """
    from models.user import User
    from services.auth_service import hash_password

    result = await db.execute(select(User).where(User.id == user_id))
    user   = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Managers can only touch porter accounts
    if current_user.role != "admin" and user.role in ("manager", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can modify manager or admin accounts.",
        )

    # Role change guard
    if data.role is not None and data.role in ("manager", "admin") and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can assign manager or admin roles.",
        )

    # Prevent self-deactivation
    if data.is_active is False and user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account.",
        )

    if data.name      is not None: user.name      = data.name.strip()
    if data.role      is not None: user.role      = data.role
    if data.is_active is not None: user.is_active = data.is_active
    if data.password  is not None: user.hashed_password = hash_password(data.password)

    await db.commit()
    await db.refresh(user)
    return user


@router.delete(
    "/users/{user_id}",
    status_code=204,
    summary="Soft-deactivate a user account",
)
async def route_deactivate_user(
    user_id: int,
    db:      AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),   # admin-only hard delete
):
    """Soft-deletes: sets is_active=False. The account remains in the DB."""
    from models.user import User

    result = await db.execute(select(User).where(User.id == user_id))
    user   = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account.",
        )

    user.is_active = False
    await db.commit()


# ---------------------------------------------------------------------------
# Stage 10 — Google Drive status
# ---------------------------------------------------------------------------

@router.get(
    "/drive-status",
    summary="Check Google Drive connection",
)
async def route_drive_status(
    current_user=Depends(require_manager),
):
    """
    Returns whether Google Drive is configured and can authenticate.
    Does not make a live API call — just checks whether credentials exist.
    """
    from config import get_settings
    settings = get_settings()

    configured = bool(
        settings.google_service_account_json
        or __import__("os").path.exists(settings.google_service_account_file)
    )

    return {
        "configured":        configured,
        "root_folder_name":  settings.google_drive_root_folder_name,
        "credential_source": (
            "env_json"  if settings.google_service_account_json else
            "file"      if __import__("os").path.exists(settings.google_service_account_file) else
            "none"
        ),
    }
