"""DealerSuite - Inspection Routes (Direct-to-Drive architecture)

POST /api/inspect/start                  → porter begins inspection
POST /api/inspect/{id}/complete          → porter finalises
POST /api/inspect/{id}/upload-session    → get a Drive resumable upload URL (no payload)
POST /api/inspect/{id}/media             → save Drive file metadata after browser upload
POST /api/inspect/{id}/damage            → log damage item
GET  /api/inspect/{id}                   → inspection detail
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
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

ALLOWED_IMAGE_MIMETYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO_MIMETYPES = {"video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"}
ALLOWED_MIMETYPES = ALLOWED_IMAGE_MIMETYPES | ALLOWED_VIDEO_MIMETYPES

_MIME_EXT_MAP = {
    "video/mp4":      "mp4",
    "video/quicktime": "mov",
    "video/webm":     "webm",
    "video/x-msvideo": "avi",
    "image/jpeg":     "jpg",
    "image/png":      "png",
    "image/webp":     "webp",
}


# ── Request / Response schemas ───────────────────────────────────────────────

class CompleteBody(BaseModel):
    photo_count: int = 0
    notes: str | None = None


class UploadSessionRequest(BaseModel):
    mimetype:        str
    filename:        str | None = None
    media_type:      str        = "photo"   # "photo" | "video"
    damage_location: str | None = None


class UploadSessionResponse(BaseModel):
    upload_url: str          # the Drive resumable upload URI
    filename:   str          # the generated filename to include in metadata save


class MediaMetadata(BaseModel):
    drive_file_id: str
    file_url:      str
    filename:      str
    media_type:    str          # "photo" | "video"
    mime_type:     str | None = None
    file_size:     int | None = None   # bytes, sent by browser after upload
    damage_location: str | None = None


class FinalizeUploadBody(BaseModel):
    drive_file_id: str
    mime_type:     str | None = None
    media_type:    str        = "photo"   # "photo" | "video"
    file_size:     int | None = None
    file_hash:     str | None = None


class MediaResponse(BaseModel):
    id:        int
    file_url:  str
    media_type: str
    backend:   str = "drive"


# ── POST /start ──────────────────────────────────────────────────────────────

@router.post(
    "/start",
    response_model=InspectionResponse,
    status_code=201,
    summary="Start a new inspection",
)
async def start_inspection(
    data: InspectionStart,
    db:   AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    import asyncio
    inspection = await _start(db, data, current_user)
    snapshot   = await get_inspection_by_id(db, inspection.id)
    asyncio.create_task(_create_drive_folder_bg(inspection.id, snapshot))
    return snapshot


async def _create_drive_folder_bg(inspection_id: int, inspection) -> None:
    from database import AsyncSessionLocal
    from storage.drive_backend import ensure_folders, get_valid_access_token
    try:
        async with AsyncSessionLocal() as bg_db:
            token = await get_valid_access_token(bg_db)
            if not token:
                logger.info("Drive: not connected — skipping folder creation for inspection %d", inspection_id)
                return
            folders = await ensure_folders(bg_db)
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
        logger.error("Drive: background folder task failed for inspection %d — %s", inspection_id, exc)


# ── POST /{id}/complete ──────────────────────────────────────────────────────

@router.post(
    "/{inspection_id}/complete",
    response_model=InspectionResponse,
    summary="Mark inspection complete",
)
async def complete_inspection(
    inspection_id: int,
    body: CompleteBody,
    db:   AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    inspection = await _complete(db, inspection_id, body.photo_count, body.notes)
    return await get_inspection_by_id(db, inspection.id)


# ── POST /{id}/upload-session ────────────────────────────────────────────────

@router.post(
    "/{inspection_id}/upload-session",
    response_model=UploadSessionResponse,
    summary="Request a Drive resumable upload session URL",
)
async def get_upload_session(
    inspection_id: int,
    body: UploadSessionRequest,
    db:   AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    The browser calls this endpoint to obtain a Resumable Upload Session URL.
    The backend uses the stored OAuth token to request the URL from Drive,
    then returns it. The browser then PUTs the media DIRECTLY to Drive —
    the backend never receives the raw file bytes.
    """
    from storage.drive_backend import (
        create_resumable_upload_session,
        build_filename,
        get_valid_access_token,
    )

    # Confirm inspection exists
    await get_inspection_by_id(db, inspection_id)

    # Strip codec parameters from MIME (e.g. "video/webm;codecs=vp9" → "video/webm")
    raw_mime    = (body.mimetype or "").lower()
    content_type = raw_mime.split(";")[0].strip()

    if content_type not in ALLOWED_MIMETYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported MIME type '{content_type}'. Allowed: {', '.join(sorted(ALLOWED_MIMETYPES))}",
        )

    ext           = _MIME_EXT_MAP.get(content_type, "bin")
    media_type    = "video" if content_type.startswith("video/") else "photo"
    folder_hint   = "inspections" if media_type == "video" else "damage"
    suffix        = body.damage_location if media_type == "photo" and body.damage_location else ""

    inspection    = await get_inspection_by_id(db, inspection_id)
    loaner_number = inspection.vehicle.loaner_number if inspection.vehicle else None
    insp_type     = (inspection.inspection_type or "inspection").lower()

    filename = body.filename or build_filename(loaner_number, insp_type, ext, suffix=suffix)

    try:
        upload_url = await create_resumable_upload_session(db, filename, content_type, folder_hint)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return UploadSessionResponse(upload_url=upload_url, filename=filename)


# ── POST /{id}/media ─────────────────────────────────────────────────────────

@router.post(
    "/{inspection_id}/media",
    response_model=MediaResponse,
    status_code=201,
    summary="Save Drive file metadata after browser completes direct upload",
)
async def save_media_metadata(
    inspection_id: int,
    body: MediaMetadata,
    db:   AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Called by the browser after it finishes uploading a file directly to Drive.
    Persists the Drive file ID and public URL to PostgreSQL.
    Also grants public-reader permission on the file.
    """
    from models.inspection_media import InspectionMedia
    from storage.drive_backend import set_file_public
    from utils.time import utcnow as _utcnow

    # Confirm inspection exists
    await get_inspection_by_id(db, inspection_id)

    content_type = (body.mime_type or "").lower().split(";")[0].strip() or None

    # Grant public access to the Drive file (best-effort, non-fatal)
    try:
        await set_file_public(db, body.drive_file_id)
    except Exception as exc:
        logger.warning("Drive: could not set file public for %s — %s", body.drive_file_id, exc)

    record = InspectionMedia(
        inspection_id=inspection_id,
        file_url=body.file_url,
        drive_file_id=body.drive_file_id,
        drive_url=body.file_url,
        media_type=body.media_type,
        mime_type=content_type,
        file_size=body.file_size,
        uploaded_at=_utcnow(),
        created_at=_utcnow(),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    logger.info("Drive: saved media metadata id=%d file_id=%s", record.id, body.drive_file_id)
    return MediaResponse(id=record.id, file_url=record.file_url, media_type=record.media_type)


# ── POST /{id}/finalize-upload ───────────────────────────────────────────────

@router.post(
    "/{inspection_id}/finalize-upload",
    response_model=MediaResponse,
    status_code=201,
    summary="Finalize a Direct-to-Drive upload and persist media record",
)
async def finalize_upload(
    inspection_id: int,
    body: FinalizeUploadBody,
    db:   AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Called by the browser after it finishes uploading a file directly to Drive
    via the resumable upload URL.  Persists the Drive file ID and a standard
    view URL to PostgreSQL with file_data = NULL (no binary data on Railway).
    Also grants public-reader permission on the file (best-effort).
    """
    from models.inspection_media import InspectionMedia
    from storage.drive_backend import set_file_public
    from utils.time import utcnow as _utcnow

    await get_inspection_by_id(db, inspection_id)

    content_type = (body.mime_type or "").lower().split(";")[0].strip() or None
    file_url = f"https://drive.google.com/uc?id={body.drive_file_id}&export=view"

    try:
        await set_file_public(db, body.drive_file_id)
    except Exception as exc:
        logger.warning("Drive: could not set file public for %s — %s", body.drive_file_id, exc)

    record = InspectionMedia(
        inspection_id=inspection_id,
        file_data=None,
        file_url=file_url,
        drive_file_id=body.drive_file_id,
        drive_url=file_url,
        media_type=body.media_type,
        mime_type=content_type,
        file_size=body.file_size,
        file_hash=body.file_hash,
        uploaded_at=_utcnow(),
        created_at=_utcnow(),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    logger.info("Drive: finalized media id=%d file_id=%s", record.id, body.drive_file_id)
    return MediaResponse(id=record.id, file_url=record.file_url, media_type=record.media_type)


# ── POST /{id}/damage ────────────────────────────────────────────────────────

@router.post(
    "/{inspection_id}/damage",
    response_model=DamageResponse,
    status_code=201,
    summary="Log a damage item",
)
async def log_damage(
    inspection_id: int,
    data: PorterDamageInput,
    db:   AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from services.damage_service import create_damage
    inspection = await get_inspection_by_id(db, inspection_id)
    damage = await create_damage(db, inspection.id, data)
    await db.commit()
    return damage


# ── GET /{id} ────────────────────────────────────────────────────────────────

@router.get(
    "/{inspection_id}",
    response_model=InspectionResponse,
    summary="Get inspection detail",
)
async def get_inspection(
    inspection_id: int,
    db:   AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await get_inspection_by_id(db, inspection_id)
