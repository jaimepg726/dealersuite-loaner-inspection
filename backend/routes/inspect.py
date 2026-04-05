"""DealerSuite - Inspection Routes
POST /api/inspect/start
POST /api/inspect/{id}/complete
POST /api/inspect/{id}/upload           <- legacy fallback (Drive not connected)
POST /api/inspect/{id}/upload-session   <- NEW: returns Drive resumable URL
POST /api/inspect/{id}/finalize-upload  <- NEW: saves Drive file ID after direct upload
POST /api/inspect/{id}/damage
GET  /api/inspect/{id}
"""
import asyncio
import hashlib
import logging
import re
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query
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

MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB

ALLOWED_IMAGE_MIMETYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO_MIMETYPES = {"video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"}
ALLOWED_MIMETYPES = ALLOWED_IMAGE_MIMETYPES | ALLOWED_VIDEO_MIMETYPES

_VIDEO_EXT_MAP = {
    "video/mp4": "mp4", "video/quicktime": "mov",
    "video/webm": "webm", "video/x-msvideo": "avi",
}
_MIME_EXT_MAP = {
    **_VIDEO_EXT_MAP,
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
}


class CompleteBody(BaseModel):
    photo_count: int = 0
    notes: str | None = None


class UploadResponse(BaseModel):
    file_id: str | None
    file_url: str | None
    filename: str
    bytes_uploaded: int
    backend: str = "local"


class UploadSessionResponse(BaseModel):
    """Returned by /upload-session — frontend uses this to PUT directly to Drive."""
    resumable_url: str
    filename: str
    media_record_id: int   # pre-created DB record ID — use in /finalize-upload


class FinalizeUploadBody(BaseModel):
    media_record_id:       int
    drive_file_id:         str
    mime_type:             str
    media_type:            str        # "video" | "photo"
    file_size:             int = 0
    # Geo metadata (optional — only video records have this)
    geo_latitude:          float | None = None
    geo_longitude:         float | None = None
    geo_accuracy_m:        float | None = None
    geo_timestamp_utc:     str | None = None    # ISO 8601 string from frontend
    geo_permission_status: str | None = None
    overlay_burned_in:     bool = False


class FinalizeUploadResponse(BaseModel):
    file_id: str
    file_url: str
    backend: str = "drive"


# ── Start ────────────────────────────────────────────────────────────────────
@router.post("/start", response_model=InspectionResponse, status_code=201)
async def start_inspection(
    data: InspectionStart,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    inspection = await _start(db, data, current_user)
    snapshot = await get_inspection_by_id(db, inspection.id)
    asyncio.create_task(_create_drive_folder_bg(inspection.id, snapshot))
    return snapshot


async def _create_drive_folder_bg(inspection_id: int, inspection) -> None:
    from database import AsyncSessionLocal
    from storage import GoogleDriveBackend
    try:
        async with AsyncSessionLocal() as bg_db:
            drive = GoogleDriveBackend(bg_db)
            if not await drive.is_available():
                return
            folders = await drive._ensure_folders()
            if folders.get("inspections"):
                await update_drive_folder(
                    bg_db, inspection_id, folders["inspections"],
                    f"https://drive.google.com/drive/folders/{folders['inspections']}",
                )
                await bg_db.commit()
    except Exception as exc:
        logger.error("Drive: background folder task failed for inspection %d - %s", inspection_id, exc)


# ── Complete ─────────────────────────────────────────────────────────────────
@router.post("/{inspection_id}/complete", response_model=InspectionResponse)
async def complete_inspection(
    inspection_id: int,
    body: CompleteBody,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    inspection = await _complete(db, inspection_id, body.photo_count, body.notes)
    await db.commit()   # persist "Completed" status before response is sent
    return await get_inspection_by_id(db, inspection.id)


# ── Upload Session (NEW) — browser uploads directly to Drive ─────────────────
@router.post("/{inspection_id}/upload-session", response_model=UploadSessionResponse)
async def create_upload_session(
    inspection_id: int,
    mime_type: str = Query(...),
    media_type: str = Query(...),        # "video" | "photo"
    damage_location: str | None = Query(None),
    attempt_id: str | None = Query(None, description="Client-generated UUID for this recording attempt — idempotency key"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Step 1 of direct-to-Drive upload.
    Returns a Google Drive resumable upload URL + a pre-created media record ID.
    The frontend PUTs the file bytes directly to resumable_url (zero Railway bandwidth).
    Then calls /finalize-upload with the resulting Drive file ID.
    """
    import httpx
    from storage.drive_backend import GoogleDriveBackend, build_filename as _build_filename
    from models.inspection_media import InspectionMedia
    from utils.time import utcnow as _utcnow

    inspection = await get_inspection_by_id(db, inspection_id)

    drive = GoogleDriveBackend(db)
    access_token = await drive._get_access_token()
    if not access_token:
        raise HTTPException(status_code=503, detail="Drive not connected. Use /upload instead.")

    # Ensure Drive folders exist
    folders = await drive._ensure_folders()
    if inspection.inspection_type == "Condition" and media_type == "video":
        folder_id = folders.get("customer-condition", folders.get("inspections"))
    elif media_type == "video":
        folder_id = folders.get("inspections")
    else:
        folder_id = folders.get("damage", folders.get("inspections"))

    # Build filename
    ext = _MIME_EXT_MAP.get(mime_type.split(";")[0].strip(), "bin")
    if inspection.inspection_type == "Condition":
        from storage.drive_backend import build_condition_filename as _build_condition_filename
        filename = _build_condition_filename(getattr(inspection, 'vin_override', None), ext)
    else:
        loaner_number = inspection.vehicle.loaner_number if inspection.vehicle else None
        insp_type = (inspection.inspection_type or "inspection").lower()
        suffix = damage_location if media_type == "photo" and damage_location else ""
        filename = _build_filename(loaner_number, insp_type, ext, suffix=suffix)

    # Create Google Drive resumable upload session
    meta = {"name": filename, "parents": [folder_id]}
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            "https://www.googleapis.com/upload/drive/v3/files",
            params={"uploadType": "resumable"},
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": mime_type,
            },
            json=meta,
        )
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Drive session init failed: {r.status_code}")

    resumable_url = r.headers.get("Location")
    if not resumable_url:
        raise HTTPException(status_code=502, detail="Drive did not return a resumable URL")

    # Deduplication guard for video uploads.
    # Two-layer check:
    #   1. attempt_id (idempotency key) — same recording attempt, regardless of path.
    #      Prevents a Drive-PUT-succeeded-but-onerror-fired scenario from producing
    #      two Drive files when the legacy fallback also uploads.
    #   2. inspection_id + media_type fallback — catches any case where attempt_id
    #      was not provided or differs.
    #
    # For each check:
    #   • pending orphan  (file_url == "pending") → previous session failed mid-flight;
    #     delete the orphan so the caller can start a fresh session.
    #   • finalized record (file_url != "pending") → video already uploaded; reject 409.
    if media_type == "video":
        # Layer 1: attempt_id idempotency check
        if attempt_id:
            attempt_result = await db.execute(
                select(InspectionMedia).where(
                    InspectionMedia.inspection_id == inspection_id,
                    InspectionMedia.upload_attempt_id == attempt_id,
                )
            )
            attempt_existing = attempt_result.scalars().first()
            if attempt_existing:
                if attempt_existing.file_url != "pending":
                    logger.warning(
                        "upload-session: attempt %s already finalized (record %d, inspection %d) — 409",
                        attempt_id, attempt_existing.id, inspection_id,
                    )
                    raise HTTPException(
                        status_code=409,
                        detail="Video already uploaded for this recording attempt",
                    )
                logger.warning(
                    "upload-session: deleting pending orphan (record %d) for attempt %s "
                    "inspection %d — retry allowed",
                    attempt_existing.id, attempt_id, inspection_id,
                )
                await db.delete(attempt_existing)
                await db.commit()

        # Layer 2: inspection-level dedup (covers missing or different attempt_id)
        dup_result = await db.execute(
            select(InspectionMedia).where(
                InspectionMedia.inspection_id == inspection_id,
                InspectionMedia.media_type == "video",
            )
        )
        existing_vid = dup_result.scalars().first()
        if existing_vid:
            if existing_vid.file_url != "pending":
                logger.warning(
                    "upload-session: finalized video already exists for inspection %d "
                    "(record %d, attempt=%s) — rejecting duplicate session",
                    inspection_id, existing_vid.id, existing_vid.upload_attempt_id,
                )
                raise HTTPException(
                    status_code=409,
                    detail="Video upload already in progress for this inspection",
                )
            logger.warning(
                "upload-session: deleting orphaned pending video record %d "
                "for inspection %d (attempt=%s) — allowing retry",
                existing_vid.id, inspection_id, existing_vid.upload_attempt_id,
            )
            await db.delete(existing_vid)
            await db.commit()

    # Pre-create the media record so we have an ID to return.
    # file_url is a placeholder — updated in /finalize-upload.
    # upload_attempt_id ties this record to the specific recording blob so the
    # legacy fallback path can detect it and return deduplicated instead of
    # creating a second record for the same attempt.
    record = InspectionMedia(
        inspection_id=inspection_id,
        file_url="pending",
        media_type=media_type,
        mime_type=mime_type.split(";")[0].strip(),
        file_data=None,
        upload_attempt_id=attempt_id,
        created_at=_utcnow(),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    return UploadSessionResponse(
        resumable_url=resumable_url,
        filename=filename,
        media_record_id=record.id,
    )


# ── Finalize Upload (NEW) — save Drive file ID after direct upload ────────────
@router.post("/{inspection_id}/finalize-upload", response_model=FinalizeUploadResponse)
async def finalize_upload(
    inspection_id: int,
    body: FinalizeUploadBody,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Step 2 of direct-to-Drive upload.
    Called by frontend after successful PUT to Drive resumable URL.
    Saves the Drive file ID and URL to the pre-created media record.
    Makes the file publicly readable on Drive.
    """
    import httpx
    from storage.drive_backend import GoogleDriveBackend, DRIVE_FILE_BASE
    from models.inspection_media import InspectionMedia

    # Verify inspection exists
    await get_inspection_by_id(db, inspection_id)

    # Load the pre-created media record
    result = await db.execute(select(InspectionMedia).where(InspectionMedia.id == body.media_record_id))
    record = result.scalar_one_or_none()
    if not record or record.inspection_id != inspection_id:
        raise HTTPException(status_code=404, detail="Media record not found")

    # Make file publicly readable on Drive
    drive = GoogleDriveBackend(db)
    access_token = await drive._get_access_token()
    if access_token:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    f"https://www.googleapis.com/drive/v3/files/{body.drive_file_id}/permissions",
                    json={"role": "reader", "type": "anyone"},
                    headers={"Authorization": f"Bearer {access_token}"},
                )
        except Exception as exc:
            logger.warning("Could not set Drive permissions for %s: %s", body.drive_file_id, exc)

    # Update record with Drive URL
    drive_url = DRIVE_FILE_BASE.format(body.drive_file_id)
    record.file_url = drive_url
    record.media_type = body.media_type
    record.mime_type = body.mime_type

    # Save geo metadata if provided
    from datetime import timezone as _tz
    record.geo_latitude          = body.geo_latitude
    record.geo_longitude         = body.geo_longitude
    record.geo_accuracy_m        = body.geo_accuracy_m
    record.geo_permission_status = body.geo_permission_status
    record.overlay_burned_in     = body.overlay_burned_in
    if body.geo_timestamp_utc:
        try:
            from datetime import datetime as _dt
            record.geo_timestamp_utc = _dt.fromisoformat(
                body.geo_timestamp_utc.replace('Z', '+00:00')
            )
        except ValueError:
            pass  # invalid timestamp — skip

    await db.commit()

    logger.info("Finalized direct Drive upload: media %d -> %s", record.id, body.drive_file_id)

    return FinalizeUploadResponse(
        file_id=str(record.id),
        file_url=drive_url,
        backend="drive",
    )


# ── Upload (legacy fallback — used when Drive not connected) ──────────────────
@router.post("/{inspection_id}/upload", response_model=UploadResponse)
async def upload_media(
    inspection_id: int,
    file: UploadFile = File(...),
    damage_location:       str   | None = Query(None),
    geo_latitude:          float | None = Query(None),
    geo_longitude:         float | None = Query(None),
    geo_accuracy_m:        float | None = Query(None),
    geo_permission_status: str   | None = Query(None),
    overlay_burned_in:     bool         = Query(False),
    attempt_id:            str   | None = Query(None, description="Client idempotency key — same as /upload-session"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from models.inspection_media import InspectionMedia
    from utils.time import utcnow as _utcnow

    inspection = await get_inspection_by_id(db, inspection_id)
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 100 MB limit")

    raw_content_type = (file.content_type or "").lower()
    content_type = raw_content_type.split(";")[0].strip()

    if content_type.startswith("image/"):
        media_type = "photo"
    elif content_type.startswith("video/"):
        media_type = "video"
    else:
        raise HTTPException(status_code=415, detail=f"Unsupported media type '{content_type}'")

    if content_type not in ALLOWED_MIMETYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported MIME type '{content_type}'")

    # Video dedup — two-layer check mirrors /upload-session logic.
    #
    # Layer 1: attempt_id idempotency — if this is the legacy fallback for a
    #   recording whose /upload-session pending row already existed (Drive PUT
    #   fired and Drive may have received the bytes), we can detect the same
    #   attempt and avoid creating a second Drive file + DB record.
    #   • Finalized record with same attempt_id → already uploaded; return it.
    #   • Pending record with same attempt_id → orphan from failed Drive path;
    #     delete it and proceed with this legacy upload so the record gets a
    #     real file_url.
    #
    # Layer 2: inspection-level dedup (covers missing attempt_id).
    #   • Finalized record → return deduplicated.
    #   • Pending orphan → delete and re-upload.
    if media_type == "video":
        # Layer 1
        if attempt_id:
            attempt_result = await db.execute(
                select(InspectionMedia).where(
                    InspectionMedia.inspection_id == inspection_id,
                    InspectionMedia.upload_attempt_id == attempt_id,
                )
            )
            attempt_existing = attempt_result.scalars().first()
            if attempt_existing:
                if attempt_existing.file_url != "pending":
                    logger.warning(
                        "upload (legacy): attempt %s already finalized (record %d, inspection %d) "
                        "— returning deduplicated",
                        attempt_id, attempt_existing.id, inspection_id,
                    )
                    return UploadResponse(
                        file_id=str(attempt_existing.id),
                        file_url=attempt_existing.file_url,
                        filename=file.filename or f"video_{attempt_existing.id}",
                        bytes_uploaded=len(content),
                        backend="deduplicated",
                    )
                logger.warning(
                    "upload (legacy): deleting pending orphan (record %d) for attempt %s "
                    "inspection %d — proceeding with fresh upload",
                    attempt_existing.id, attempt_id, inspection_id,
                )
                await db.delete(attempt_existing)
                await db.flush()

        # Layer 2: inspection-level fallback
        vid_dup = await db.execute(
            select(InspectionMedia).where(
                InspectionMedia.inspection_id == inspection_id,
                InspectionMedia.media_type == "video",
            )
        )
        vid_existing = vid_dup.scalars().first()
        if vid_existing:
            if vid_existing.file_url != "pending":
                # Already finalized — return it to prevent a true duplicate.
                logger.warning(
                    "upload (legacy): finalized video already exists for inspection %d "
                    "(record %d, attempt=%s) — skipping duplicate",
                    inspection_id, vid_existing.id, vid_existing.upload_attempt_id,
                )
                return UploadResponse(
                    file_id=str(vid_existing.id),
                    file_url=vid_existing.file_url,
                    filename=file.filename or f"video_{vid_existing.id}",
                    bytes_uploaded=len(content),
                    backend="deduplicated",
                )
            # Orphaned pending record — delete it and fall through to upload fresh.
            logger.warning(
                "upload (legacy): deleting orphaned pending video record %d "
                "for inspection %d (attempt=%s) — proceeding with fresh upload",
                vid_existing.id, inspection_id, vid_existing.upload_attempt_id,
            )
            await db.delete(vid_existing)
            await db.flush()

    # Hash-based dedup (applies to photos and any edge cases not caught above)
    file_hash = hashlib.sha256(content).hexdigest()
    dup = await db.execute(
        select(InspectionMedia).where(
            InspectionMedia.inspection_id == inspection_id,
            InspectionMedia.file_hash == file_hash,
        )
    )
    existing = dup.scalar_one_or_none()
    if existing:
        return UploadResponse(
            file_id=str(existing.id), file_url=existing.file_url,
            filename=file.filename or f"{media_type}_{existing.id}",
            bytes_uploaded=len(content), backend="deduplicated",
        )

    # Save BYTEA to DB — include attempt_id so subsequent dedup checks can
    # match this record even if the Drive opportunistic upload changes file_url.
    record = InspectionMedia(
        inspection_id=inspection_id, file_url="",
        media_type=media_type, mime_type=content_type,
        file_data=content, file_hash=file_hash,
        upload_attempt_id=attempt_id,
        created_at=_utcnow(),
    )
    db.add(record)
    await db.flush()
    record.file_url = f"/api/media/{record.id}"
    record.geo_latitude          = geo_latitude
    record.geo_longitude         = geo_longitude
    record.geo_accuracy_m        = geo_accuracy_m
    record.geo_permission_status = geo_permission_status
    record.overlay_burned_in     = overlay_burned_in
    await db.commit()

    # Try Drive upload opportunistically
    final_backend = "database"
    try:
        from storage.drive_backend import GoogleDriveBackend, build_filename as _build_filename
        drive = GoogleDriveBackend(db)
        creds = await drive._get_credentials()
        if creds:
            folder_hint = "inspections" if media_type == "video" else "damage"
            loaner_number = inspection.vehicle.loaner_number if inspection.vehicle else None
            insp_type = (inspection.inspection_type or "inspection").lower()
            ext = _MIME_EXT_MAP.get(content_type, "bin")
            suffix = damage_location if media_type == "photo" and damage_location else ""
            drive_filename = _build_filename(loaner_number, insp_type, ext, suffix=suffix)
            drive_result = None
            for attempt in range(2):
                try:
                    drive_result = await drive.upload_file(content, drive_filename, content_type, folder_hint)
                    if drive_result.success:
                        break
                except Exception as exc:
                    logger.warning("Drive upload attempt %d failed: %s", attempt + 1, exc)
                    if attempt == 1:
                        raise
            if drive_result and drive_result.success and drive_result.file_url:
                record.file_url = drive_result.file_url
                record.file_data = None  # clear BYTEA — Drive is source of truth
                await db.commit()
                final_backend = "drive"
    except Exception as exc:
        logger.warning("Drive upload skipped for media %d: %s", record.id, exc)

    return UploadResponse(
        file_id=str(record.id), file_url=record.file_url,
        filename=file.filename or f"{media_type}_{record.id}",
        bytes_uploaded=len(content), backend=final_backend,
    )


# ── Damage ────────────────────────────────────────────────────────────────────
@router.post("/{inspection_id}/damage", response_model=DamageResponse, status_code=201)
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


# ── Get ───────────────────────────────────────────────────────────────────────
@router.get("/{inspection_id}", response_model=InspectionResponse)
async def get_inspection(
    inspection_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await get_inspection_by_id(db, inspection_id)
