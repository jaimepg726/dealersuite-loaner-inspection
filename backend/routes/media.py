"""DealerSuite — Media endpoint

GET /api/media/{media_id}

Two paths:
  • Legacy (file_data IS NOT NULL) — stream the BYTEA bytes directly so the
    handful of records that still carry binary data continue to display.
  • Drive-backed (file_data IS NULL) — return a JSON descriptor that lets the
    frontend fetch the file directly from the Google Drive API using a fresh
    OAuth token.  A plain redirect to drive_url / file_url does not work
    because Drive share links require a Google login, which fails inside the
    PWA web-view.
"""
import io
import logging
import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.inspection_media import InspectionMedia

logger = logging.getLogger(__name__)
router = APIRouter()

DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files"


def _extract_file_id(url: str | None) -> str | None:
    """Extract a Google Drive file ID from any known Drive URL format."""
    if not url:
        return None
    # /file/d/FILE_ID/ or /file/d/FILE_ID?
    m = re.search(r"/d/([a-zA-Z0-9_-]+)", url)
    if m:
        return m.group(1)
    # ?id=FILE_ID or &id=FILE_ID
    m = re.search(r"[?&]id=([a-zA-Z0-9_-]+)", url)
    if m:
        return m.group(1)
    return None


@router.get("/{media_id}", summary="Serve or describe media")
async def serve_media(
    media_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(InspectionMedia).where(InspectionMedia.id == media_id)
    )
    media = result.scalar_one_or_none()

    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # ── Legacy path: BYTEA data still present ─────────────────────────────────
    if media.file_data is not None:
        mime = media.mime_type or "application/octet-stream"
        return StreamingResponse(
            io.BytesIO(media.file_data),
            media_type=mime,
        )

    # ── Drive path: resolve file ID ───────────────────────────────────────────
    # Prefer the dedicated drive_file_id column; fall back to parsing a URL.
    file_id = (
        media.drive_file_id
        or _extract_file_id(media.drive_url)
        or _extract_file_id(media.file_url)
    )

    if not file_id:
        raise HTTPException(
            status_code=404,
            detail="Media file not available — no Drive file ID found",
        )

    # Obtain a fresh, valid OAuth access token for the Drive API.
    from storage.drive_backend import get_valid_access_token

    token = await get_valid_access_token(db)
    if not token:
        raise HTTPException(
            status_code=503,
            detail="Google Drive is not connected — reconnect via Admin > Settings",
        )

    return JSONResponse({
        "direct_fetch": True,
        "access_token": token,
        "drive_url": f"{DRIVE_FILES_API}/{file_id}?alt=media",
        "mime_type": media.mime_type or "application/octet-stream",
    })
