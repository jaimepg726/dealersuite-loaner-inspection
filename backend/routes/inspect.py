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


ALLOWED_IMAGE_MIMETYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO_MIMETYPES = {"video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"}
ALLOWED_MIMETYPES = ALLOWED_IMAGE_MIMETYPES | ALLOWED_VIDEO_MIMETYPES

_VIDEO_EXT_MAP = {
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/x-msvideo": "avi",
}


# POST /{id}/upload
@router.post(
    "/{inspection_id}/upload",
    response_model=UploadResponse,
    summary="Upload video or photo, stored in database",
)
async def upload_media(
    inspection_id: int,
    file: UploadFile = File(...),
    damage_location: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from models.inspection_media import InspectionMedia
    from utils.time import utcnow as _utcnow

    # 1. Confirm inspection exists before upload
    inspection = await get_inspection_by_id(db, inspection_id)

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 512 MB limit")

    # 2 & 3. Validate MIME type and determine media_type from content_type.
    # Strip codec parameters (e.g. "video/webm;codecs=vp9" → "video/webm") before
    # the set lookup so MediaRecorder blobs with codec suffixes pass validation.
    raw_content_type = (file.content_type or "").lower()
    content_type     = raw_content_type.split(";")[0].strip()  # base MIME only

    if content_type.startswith("image/"):
        media_type = "photo"
    elif content_type.startswith("video/"):
        media_type = "video"
    else:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported media type '{content_type}'. Must be image or video.",
        )
    if content_type not in ALLOWED_MIMETYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported MIME type '{content_type}'. Allowed: {', '.join(sorted(ALLOWED_MIMETYPES))}",
        )

    # 4. Insert media record — store raw bytes in DB (survives redeploys, no /tmp)
    record = InspectionMedia(
        inspection_id=inspection_id,
        file_url="",           # updated below once we have the row ID
        media_type=media_type,
        mime_type=content_type,  # base MIME without codec params
        file_data=content,
        created_at=_utcnow(),
    )
    db.add(record)
    await db.flush()           # populate record.id without committing

    # 5. Set file_url to the permanent serve endpoint
    record.file_url = f"/api/media/{record.id}"
    await db.commit()

    # 6. Attempt Drive upload opportunistically — DB record is the fallback.
    #    If Drive is connected and upload succeeds, update file_url to the
    #    Drive URL so there is a permanent off-DB copy as well.
    final_backend = "database"
    try:
        from storage.drive_backend import GoogleDriveBackend
        drive = GoogleDriveBackend(db)
        creds = await drive._get_credentials()
        if creds:
            folder_hint = "inspections" if media_type == "video" else "damage"
            drive_filename = file.filename or f"{media_type}_{record.id}"
            drive_result = await drive.upload_file(content, drive_filename, content_type, folder_hint)
            if drive_result.success and drive_result.file_url:
                record.file_url = drive_result.file_url
                await db.commit()
                final_backend = "drive"
                logger.info("Drive upload succeeded for media %d: %s", record.id, drive_result.file_url)
    except Exception as exc:
        logger.warning("Drive upload skipped for media %d: %s", record.id, exc)

    return UploadResponse(
        file_id=str(record.id),
        file_url=record.file_url,
        filename=file.filename or f"{media_type}_{record.id}",
        bytes_uploaded=len(content),
        backend=final_backend,
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
