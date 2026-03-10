"""DealerSuite - Inspection Routes (Batch 3: StorageBackend abstraction)
POST /api/inspect/start             -> porter begins inspection
POST /api/inspect/{id}/complete     -> porter finalises
POST /api/inspect/{id}/upload       -> upload media via StorageBackend
POST /api/inspect/{id}/damage       -> log damage item
GET  /api/inspect/{id}              -> inspection detail
"""
import asyncio
import logging
import re
from typing import Literal

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db
from dependencies import get_current_user
from schemas.inspection import InspectionStart, InspectionResponse
from schemas.damage import PorterDamageInput, DamageResponse
from services.inspection_service import (
    start_inspection as _start,
    complete_inspection as _complete,
    get_inspection_by_id,
    update_drive_folder,
    set_video_url,
)

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_UPLOAD_BYTES = 512 * 1024 * 1024  # 512 MB


class CompleteBody(BaseModel):
    photo_count: int = 0
    notes: str | None = None


class UploadResponse(BaseModel):
    file_id: str | None
    file_url: str | None
    filename: str
    bytes_uploaded: int
    backend: str = "local"


# POST /start
@router.post(
    "/start",
    response_model=InspectionResponse,
    status_code=201,
    summary="Start a new inspection",
)
async def start_inspection(
    data: InspectionStart,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # 1. Save inspection record immediately - upload failures never block this
    inspection = await _start(db, data, current_user)
    snapshot = await get_inspection_by_id(db, inspection.id)

    # 2. Create Drive folder in background (non-blocking)
    asyncio.create_task(_create_drive_folder_bg(inspection.id, snapshot))
    return snapshot


async def _create_drive_folder_bg(inspection_id: int, inspection) -> None:
    """Background: create Drive folder hierarchy and write IDs back."""
    from database import AsyncSessionLocal
    from storage import GoogleDriveBackend

    try:
        async with AsyncSessionLocal() as bg_db:
            drive = GoogleDriveBackend(bg_db)
            if not await drive.is_available():
                logger.info("Drive: not connected - skipping folder creation for inspection %d", inspection_id)
                return

            vehicle = inspection.vehicle
            loaner  = vehicle.loaner_number if vehicle else None
            vin     = vehicle.vin if vehicle else "UNKNOWN"

            folders = await drive._ensure_folders()
            # We don't create per-inspection subfolders here - files go into
            # the top-level inspections or damage folder with descriptive names
            if folders.get("inspections"):
                await update_drive_folder(
                    bg_db,
                    inspection_id,
                    folders["inspections"],
                    f"https://drive.google.com/drive/folders/{folders['inspections']}",
                )
                await bg_db.commit()
                logger.info("Drive: folder linked for inspection %d", inspection_id)
    except Exception as exc:
        logger.error("Drive: background folder task failed for inspection %d - %s", inspection_id, exc)


# POST /{id}/complete
@router.post(
    "/{inspection_id}/complete",
    response_model=InspectionResponse,
    summary="Mark inspection complete",
)
async def complete_inspection(
    inspection_id: int,
    body: CompleteBody,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    inspection = await _complete(db, inspection_id, body.photo_count, body.notes)
    return await get_inspection_by_id(db, inspection.id)


# POST /{id}/upload
@router.post(
    "/{inspection_id}/upload",
    response_model=UploadResponse,
    summary="Upload video or photo via StorageBackend",
)
async def upload_media(
    inspection_id: int,
    file: UploadFile = File(...),
    media_type: Literal["video", "photo"] = Query("photo"),
    damage_location: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from storage import get_storage_backend, build_filename

    inspection = await get_inspection_by_id(db, inspection_id)

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 512 MB limit")

    # Build standardised filename: {LoanerNumber}_{Type}_{Date}_{HHMMSS}.ext
    vehicle = inspection.vehicle
    loaner  = vehicle.loaner_number if vehicle else None
    itype   = inspection.inspection_type
    if hasattr(itype, "value"):
        itype = itype.value

    if media_type == "video":
        filename = build_filename(loaner, itype, "mp4")
        mimetype = "video/mp4"
        folder_hint = "inspections"
    else:
        ext = "jpg"
        suffix = damage_location or "other"
        filename = build_filename(loaner, itype, ext, suffix=suffix)
        mimetype = "image/jpeg"
        folder_hint = "damage"

    # Upload through abstraction layer
    backend = await get_storage_backend(db)
    result  = await backend.upload_file(content, filename, mimetype, folder_hint)

    # Persist file reference on inspection/damage record
    if result.success and media_type == "video" and result.file_id:
        await set_video_url(db, inspection_id, result.file_id, result.file_url)
        await db.commit()

    if not result.success and result.backend == "local" and not result.file_id:
        raise HTTPException(status_code=502, detail="Upload failed on all backends")

    return UploadResponse(
        file_id=result.file_id,
        file_url=result.file_url,
        filename=filename,
        bytes_uploaded=len(content),
        backend=result.backend,
    )


# POST /{id}/damage
@router.post(
    "/{inspection_id}/damage",
    response_model=DamageResponse,
    status_code=201,
    summary="Log a damage item",
)
async def log_damage(
    inspection_id: int,
    data: PorterDamageInput,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from services.damage_service import create_damage
    inspection = await get_inspection_by_id(db, inspection_id)
    damage = await create_damage(db, inspection.id, data)
    await db.commit()
    return damage


# GET /{id}
@router.get(
    "/{inspection_id}",
    response_model=InspectionResponse,
    summary="Get inspection detail",
)
async def get_inspection(
    inspection_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await get_inspection_by_id(db, inspection_id)
