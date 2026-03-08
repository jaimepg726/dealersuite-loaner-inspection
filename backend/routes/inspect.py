"""
DealerSuite — Inspection Routes

POST /api/inspect/start                → porter begins inspection
                                         (creates Google Drive folder in background)
POST /api/inspect/{id}/complete        → porter finalises (video/photo counts)
POST /api/inspect/{id}/upload          → upload a media file to the Drive folder
POST /api/inspect/{id}/damage          → log a damage item during an inspection
GET  /api/inspect/{id}                 → inspection detail
"""

import asyncio
import logging
from typing import Literal

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db
from dependencies import get_current_user
from schemas.inspection import InspectionStart, InspectionResponse
from schemas.damage     import PorterDamageInput, DamageResponse
from services.inspection_service import (
    start_inspection as _start,
    complete_inspection as _complete,
    get_inspection_by_id,
    update_drive_folder,
    set_video_url,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Max upload size: 512 MB (enough for a 1-minute 4K video)
MAX_UPLOAD_BYTES = 512 * 1024 * 1024


# ── Schemas ──────────────────────────────────────────────────────────────────

class CompleteBody(BaseModel):
    photo_count: int = 0
    notes: str | None = None


class UploadResponse(BaseModel):
    file_id:        str | None
    file_url:       str | None
    filename:       str
    bytes_uploaded: int


# ── Start ────────────────────────────────────────────────────────────────────

@router.post(
    "/start",
    response_model=InspectionResponse,
    status_code=201,
    summary="Start a new inspection (creates Drive folder in background)",
)
async def start_inspection(
    data: InspectionStart,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # 1. Create DB record — fast; porter gets confirmation immediately
    inspection = await _start(db, data, current_user)
    inspection_snapshot = await get_inspection_by_id(db, inspection.id)

    # 2. Kick off Drive folder creation without blocking the response
    asyncio.create_task(
        _create_drive_folder_bg(inspection.id, inspection_snapshot)
    )

    return inspection_snapshot


async def _create_drive_folder_bg(inspection_id: int, inspection) -> None:
    """
    Background task: create the Drive folder hierarchy then write the IDs back.
    Runs after the HTTP response is already sent to the porter.
    """
    from database import AsyncSessionLocal
    from services.drive_service import get_or_create_inspection_folder

    try:
        vehicle = inspection.vehicle
        loaner  = vehicle.loaner_number if vehicle else None
        vin     = vehicle.vin           if vehicle else "UNKNOWN"

        # inspection_type may be enum or string — normalise to "Checkout" etc.
        itype = inspection.inspection_type
        if hasattr(itype, "value"):
            itype = itype.value

        folder_id, folder_url = await get_or_create_inspection_folder(
            loaner_number   = loaner,
            vin             = vin,
            inspection_type = itype,
            started_at      = inspection.started_at,
        )

        if folder_id:
            async with AsyncSessionLocal() as bg_db:
                await update_drive_folder(bg_db, inspection_id, folder_id, folder_url)
            logger.info(
                "Drive: folder ready for inspection %d → %s",
                inspection_id, folder_url,
            )

    except Exception as exc:
        logger.error(
            "Drive: background folder creation failed for inspection %d — %s",
            inspection_id, exc,
        )


# ── Complete ─────────────────────────────────────────────────────────────────

@router.post(
    "/{inspection_id}/complete",
    response_model=InspectionResponse,
    summary="Mark inspection as complete",
)
async def complete_inspection(
    inspection_id: int,
    body: CompleteBody,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    inspection = await _complete(db, inspection_id, body.photo_count, body.notes)
    return await get_inspection_by_id(db, inspection.id)


# ── Upload media ─────────────────────────────────────────────────────────────

@router.post(
    "/{inspection_id}/upload",
    response_model=UploadResponse,
    summary="Upload a video or damage photo to the inspection's Drive folder",
)
async def upload_media(
    inspection_id:   int,
    file:            UploadFile = File(...),
    media_type:      Literal["video", "photo"] = Query(
        "photo", description="'video' for walkround recording, 'photo' for damage"
    ),
    damage_location: str | None = Query(
        None, description="Panel location (e.g. 'Front') — used when media_type=photo"
    ),
    db:           AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    from services.drive_service import upload_video, upload_damage_photo

    inspection = await get_inspection_by_id(db, inspection_id)

    # Drive folder must exist before we can upload
    if not inspection.drive_folder_id:
        raise HTTPException(
            status_code=409,
            detail=(
                "Drive folder is not ready yet. "
                "Wait a moment and retry, or check your Drive configuration."
            ),
        )

    # Read file with size guard
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 512 MB limit")

    filename    = file.filename or f"upload_{media_type}"
    bytes_count = len(content)
    file_id     = None
    file_url    = None

    if media_type == "video":
        # Normalise inspection type for the filename
        itype = inspection.inspection_type
        if hasattr(itype, "value"):
            itype = itype.value

        file_id, file_url = await upload_video(
            folder_id       = inspection.drive_folder_id,
            content         = content,
            inspection_type = itype,
            started_at      = inspection.started_at,
        )
        # Persist the video URL on the inspection record
        if file_id:
            await set_video_url(db, inspection_id, file_id, file_url)

    else:  # photo
        location = damage_location or "other"
        file_id, file_url = await upload_damage_photo(
            folder_id = inspection.drive_folder_id,
            content   = content,
            location  = location,
        )
        # The caller (Stage 9 frontend) stores the returned file_url on the
        # damage record it's about to POST — no extra DB write needed here.

    if not file_id:
        raise HTTPException(
            status_code=502,
            detail="Drive upload failed — check server logs or Drive credentials",
        )

    return UploadResponse(
        file_id        = file_id,
        file_url       = file_url,
        filename       = filename,
        bytes_uploaded = bytes_count,
    )


# ── Log damage item ───────────────────────────────────────────────────────────

@router.post(
    "/{inspection_id}/damage",
    response_model=DamageResponse,
    status_code=201,
    summary="Log a damage item during an active inspection",
)
async def log_damage(
    inspection_id: int,
    data:          PorterDamageInput,
    db:            AsyncSession = Depends(get_db),
    current_user   = Depends(get_current_user),
):
    from services.damage_service import create_damage

    # Confirm inspection exists and belongs to a valid record
    inspection = await get_inspection_by_id(db, inspection_id)
    damage = await create_damage(db, inspection.id, data)
    await db.commit()
    return damage


# ── Detail ───────────────────────────────────────────────────────────────────

@router.get(
    "/{inspection_id}",
    response_model=InspectionResponse,
    summary="Get inspection detail with damages",
)
async def get_inspection(
    inspection_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await get_inspection_by_id(db, inspection_id)
