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

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query, HTTPException, status, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from database import get_db
from dependencies import get_current_user, require_manager, require_admin
from schemas.inspection import InspectionListResponse, InspectionResponse
from schemas.damage import DamageListResponse, DamageResponse, DamageUpdate
from schemas.user import UserCreate, UserUpdate, UserResponse, UserListResponse
from services.inspection_service import (
    list_inspections, get_inspection_by_id, get_dashboard_stats
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
    return await get_dashboard_stats(db)


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
    total, inspections = await list_inspections(
        db, status, inspection_type, vehicle_id, days, skip, limit
    )
    return InspectionListResponse(total=total, inspections=inspections)


@router.get(
    "/inspections/{inspection_id}",
    response_model=InspectionResponse,
    summary="Get inspection detail with damages and media",
)
async def route_get_inspection(
    inspection_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    # Returns vehicle info, loaner number, inspection type, porter name,
    # damage notes, and media array (photos + videos) via the ORM relationship.
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
    return await get_dashboard_stats(db)


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


# ---------------------------------------------------------------------------
# Frame comparison (checkout vs checkin media side-by-side)
# ---------------------------------------------------------------------------

@router.get("/inspections/{inspection_id}/frame-match")
async def get_frame_match(
    inspection_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    """Compare checkout vs checkin for same vehicle — show before/after media."""
    from sqlalchemy import select as _sel, func as _func
    from models.inspection import Inspection as _Insp
    from models.inspection_media import InspectionMedia as _Media
    insp = await db.get(_Insp, inspection_id)
    if not insp:
        raise HTTPException(status_code=404, detail="Inspection not found")
    cur_type = (insp.inspection_type or "").lower()
    pair_type = "Checkout" if cur_type == "checkin" else "Checkin"
    stmt = (
        _sel(_Insp)
        .where(
            _Insp.vehicle_id == insp.vehicle_id,
            _func.lower(_Insp.inspection_type) == pair_type.lower(),
            _Insp.id != inspection_id,
        )
        .order_by(_Insp.id.desc())
        .limit(1)
    )
    paired = (await db.execute(stmt)).scalar_one_or_none()
    async def _media(iid):
        rows = (await db.execute(
            _sel(_Media).where(_Media.inspection_id == iid)
        )).scalars().all()
        return [{"id": m.id, "file_url": m.file_url, "media_type": m.media_type} for m in rows]
    return {
        "inspection_id": inspection_id,
        "inspection_type": insp.inspection_type,
        "vehicle_id": insp.vehicle_id,
        "paired_inspection_id": paired.id if paired else None,
        "paired_type": paired.inspection_type if paired else None,
        "current_media": await _media(inspection_id),
        "paired_media": await _media(paired.id) if paired else [],
        "has_pair": paired is not None,
    }


# ---------------------------------------------------------------------------
# One-time junk data cleanup (manager-auth-protected)
# ---------------------------------------------------------------------------

@router.post("/cleanup-junk-preview", summary="Preview junk data cleanup counts (no deletes)")
async def cleanup_junk_preview(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    """
    Dry-run preview: returns counts of what cleanup-junk-execute would delete.
    Safe to call any number of times — no data is modified.
    """
    from sqlalchemy import text as _text
    junk_count = (await db.execute(_text("""
        SELECT COUNT(*) FROM inspections i
        WHERE i.status = 'In Progress'
          AND NOT EXISTS (
              SELECT 1 FROM inspection_media m
              WHERE m.inspection_id = i.id
                AND m.file_url IS NOT NULL
                AND m.file_url NOT IN ('pending', '')
          )
    """))).scalar_one()

    completed_no_media = (await db.execute(_text("""
        SELECT COUNT(*) FROM inspections i
        WHERE i.status = 'Completed'
          AND NOT EXISTS (
              SELECT 1 FROM inspection_media m
              WHERE m.inspection_id = i.id
                AND m.file_url IS NOT NULL
                AND m.file_url NOT IN ('pending', '')
          )
    """))).scalar_one()

    damage_count = (await db.execute(_text("SELECT COUNT(*) FROM damages"))).scalar_one()

    return {
        "dry_run": True,
        "junk_inspections_to_delete": junk_count,
        "completed_no_media_skipped": completed_no_media,
        "damage_records_to_delete": damage_count,
        "message": "Call POST /api/manager/cleanup-junk-execute to apply these deletes.",
    }


@router.post("/cleanup-junk-execute", summary="Execute one-time junk data cleanup (irreversible)")
async def cleanup_junk_execute(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    """
    ONE-TIME OPERATION — deletes:
      • All 'In Progress' inspections with zero finalized media (abandoned/junk rows)
      • All damage records (confirmed test data)
    Cascades automatically remove orphaned InspectionMedia stubs.
    Does NOT touch Completed inspections or any Drive files.
    """
    from sqlalchemy import text as _text

    # Collect IDs of junk inspections for reporting
    junk_rows = (await db.execute(_text("""
        SELECT i.id FROM inspections i
        WHERE i.status = 'In Progress'
          AND NOT EXISTS (
              SELECT 1 FROM inspection_media m
              WHERE m.inspection_id = i.id
                AND m.file_url IS NOT NULL
                AND m.file_url NOT IN ('pending', '')
          )
    """))).fetchall()
    junk_ids = [r[0] for r in junk_rows]

    deleted_inspections = 0
    if junk_ids:
        result = await db.execute(
            _text("DELETE FROM inspections WHERE id = ANY(:ids)").bindparams(ids=junk_ids)
        )
        deleted_inspections = result.rowcount

    result = await db.execute(_text("DELETE FROM damages"))
    deleted_damages = result.rowcount

    await db.commit()

    return {
        "executed": True,
        "deleted_junk_inspections": deleted_inspections,
        "deleted_damage_records": deleted_damages,
        "note": "Cascades removed orphaned media stubs. No Drive files were touched.",
    }


# ---------------------------------------------------------------------------
# Instruction Screenshots — any-auth GET, manager-only POST/DELETE
# Screenshots stored as encrypted base64 data URLs in AppSettings.
# ---------------------------------------------------------------------------

_INSTR_SS_PREFIX  = "instr_ss_"
_MAX_SS_BYTES     = 1_500_000           # 1.5 MB raw image limit
_ALLOWED_SS_MIMES = {"image/jpeg", "image/png", "image/webp"}


@router.get(
    "/instruction-screenshots",
    summary="Get all uploaded instruction screenshots (any authenticated user)",
)
async def get_instruction_screenshots(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),   # porters may also read screenshots
):
    """Returns {screenshotKey: 'data:image/...;base64,...'} for every uploaded screenshot."""
    from models.settings import AppSettings
    from services.settings_service import decrypt_value

    result = await db.execute(
        select(AppSettings).where(AppSettings.key.like(f"{_INSTR_SS_PREFIX}%"))
    )
    rows = result.scalars().all()
    out: dict = {}
    for row in rows:
        short_key = row.key[len(_INSTR_SS_PREFIX):]
        if row.value:
            try:
                out[short_key] = decrypt_value(row.value)
            except Exception:
                pass
    return out


@router.post(
    "/instruction-screenshots/{key}",
    summary="Upload or replace a screenshot for an instruction step",
)
async def set_instruction_screenshot(
    key: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    """Accepts JPEG, PNG, or WebP up to 1.5 MB. Stored encrypted in AppSettings."""
    import re as _re
    import base64 as _b64

    if not _re.match(r'^[a-z0-9][a-z0-9\-]*$', key) or len(key) > 60:
        raise HTTPException(status_code=400, detail="Invalid screenshot key")
    if file.content_type not in _ALLOWED_SS_MIMES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported image type '{file.content_type}'. Use JPEG, PNG, or WebP.",
        )

    raw = await file.read()
    if len(raw) > _MAX_SS_BYTES:
        raise HTTPException(status_code=413, detail="Image too large — maximum 1.5 MB per screenshot")

    data_url = f"data:{file.content_type};base64,{_b64.b64encode(raw).decode()}"
    from services.settings_service import set_setting
    await set_setting(db, f"{_INSTR_SS_PREFIX}{key}", data_url)
    await db.commit()
    return {"key": key, "stored": True}


@router.delete(
    "/instruction-screenshots/{key}",
    status_code=204,
    summary="Remove an instruction screenshot",
)
async def delete_instruction_screenshot(
    key: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    """Removes the stored screenshot for the given step key."""
    from services.settings_service import delete_setting
    await delete_setting(db, f"{_INSTR_SS_PREFIX}{key}")
    await db.commit()


# ---------------------------------------------------------------------------
# Video Session Management — manager visibility into failed/incomplete sessions
# ---------------------------------------------------------------------------

_ACTIVE_STATUSES   = frozenset({"started", "recording", "ready_for_upload", "uploading"})
_TERMINAL_STATUSES = frozenset({"completed", "failed_upload", "abandoned",
                                 "closed_early", "interrupted", "expired"})
_STALE_THRESHOLD   = timedelta(minutes=10)   # heartbeat gap before marking interrupted


def _session_dict(s) -> dict:
    """Serialize a VideoSession ORM row to a plain dict for the API response."""
    def _iso(v): return v.isoformat() if v else None
    return {
        "id":               s.id,
        "uuid":             s.uuid,
        "inspection_id":    s.inspection_id,
        "inspector_name":   s.inspector_name,
        "loaner_number":    s.loaner_number,
        "inspection_type":  s.inspection_type,
        "status":           s.status,
        "created_at":       _iso(s.created_at),
        "recording_started_at": _iso(s.recording_started_at),
        "recording_stopped_at": _iso(s.recording_stopped_at),
        "upload_started_at":    _iso(s.upload_started_at),
        "upload_finished_at":   _iso(s.upload_finished_at),
        "last_heartbeat_at":    _iso(s.last_heartbeat_at),
        "duration_seconds":     s.duration_seconds,
        "min_duration_required": s.min_duration_required,
        "min_duration_met":     s.min_duration_met,
        "failure_reason":       s.failure_reason,
        "interruption_type":    s.interruption_type,
        "last_known_phase":     s.last_known_phase,
        "app_backgrounded":     s.app_backgrounded,
        "app_unloaded":         s.app_unloaded,
        "upload_started":       s.upload_started,
        "upload_finalized":     s.upload_finalized,
    }


@router.get("/video-sessions", summary="List video sessions with lazy expiry")
async def list_video_sessions(
    status_filter: str | None = Query(None, alias="status",
        description="Filter by status. Use 'incomplete' for all non-completed."),
    days:  int = Query(7,  ge=1, le=90),
    skip:  int = Query(0,  ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    """
    Returns video sessions from the last N days.
    Side-effect: lazily marks sessions with a stale heartbeat as 'interrupted'.
    """
    from models.video_session import VideoSession

    cutoff       = datetime.now(timezone.utc) - timedelta(days=days)
    stale_cutoff = datetime.now(timezone.utc) - _STALE_THRESHOLD

    # Lazy expiry — any session still "active" with no recent heartbeat
    stale_result = await db.execute(
        select(VideoSession).where(
            VideoSession.status.in_(list(_ACTIVE_STATUSES)),
            VideoSession.created_at > cutoff,
            or_(
                VideoSession.last_heartbeat_at.is_(None),
                VideoSession.last_heartbeat_at < stale_cutoff,
            ),
        )
    )
    stale_rows = stale_result.scalars().all()
    if stale_rows:
        for s in stale_rows:
            s.status = "interrupted"
            if not s.failure_reason:
                s.failure_reason = "Heartbeat stopped — app may have closed unexpectedly"
        await db.commit()

    # Build query
    q = select(VideoSession).where(VideoSession.created_at > cutoff)
    if status_filter == "incomplete":
        q = q.where(VideoSession.status.notin_(["completed"]))
    elif status_filter:
        q = q.where(VideoSession.status == status_filter)

    # Total count
    count_q = select(func.count()).select_from(q.subquery())
    total   = (await db.execute(count_q)).scalar_one()

    # Paged results
    rows = (await db.execute(
        q.order_by(VideoSession.created_at.desc()).offset(skip).limit(limit)
    )).scalars().all()

    return {"total": total, "sessions": [_session_dict(s) for s in rows]}


@router.get("/video-sessions/stats", summary="Per-porter video session outcome stats")
async def video_session_stats(
    days: int = Query(30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_manager),
):
    """Aggregate completion/failure stats grouped by porter name."""
    from models.video_session import VideoSession

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    rows   = (await db.execute(
        select(VideoSession).where(VideoSession.created_at > cutoff)
    )).scalars().all()

    # Group by inspector_name
    by_name: dict[str, dict] = {}
    for s in rows:
        name = s.inspector_name or "Unknown"
        if name not in by_name:
            by_name[name] = {
                "inspector_name":     name,
                "total":              0,
                "completed":          0,
                "stopped_short":      0,
                "interrupted":        0,
                "other_incomplete":   0,
                "_durations":         [],
            }
        p = by_name[name]
        p["total"] += 1
        if s.status == "completed":
            p["completed"] += 1
        elif s.status == "stopped_short":
            p["stopped_short"] += 1
        elif s.status in ("interrupted", "closed_early", "abandoned",
                          "failed_upload", "expired"):
            p["interrupted"] += 1
        else:
            p["other_incomplete"] += 1
        if s.duration_seconds:
            p["_durations"].append(s.duration_seconds)

    result = []
    for p in by_name.values():
        durations = p.pop("_durations")
        p["avg_duration_seconds"] = (
            round(sum(durations) / len(durations), 1) if durations else None
        )
        p["completion_rate_pct"] = (
            round(p["completed"] / p["total"] * 100) if p["total"] else 0
        )
        p["incomplete"] = p["total"] - p["completed"]
        result.append(p)

    result.sort(key=lambda x: x["total"], reverse=True)
    return {"days": days, "porter_stats": result}
